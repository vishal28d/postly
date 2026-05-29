# 🎯 Postly — In-Depth Interview Guide

> A complete reference for explaining this project confidently in any technical interview.
> Covers architecture, code-level decisions, tradeoffs, and common interviewer challenges.

---

## 1. The 30-Second Elevator Pitch

> Deliver this confidently when asked *"Tell me about a project you're proud of."*

**"I built Postly — a multi-platform AI content publishing engine operated entirely through a Telegram bot. Instead of a complex web dashboard, users interact conversationally: they choose a post type, target platform, tone, and AI model, then provide their idea. The system generates platform-optimized content using NVIDIA NIM (Gemma 2B), previews it, and publishes it asynchronously via BullMQ. The stack is Node.js + TypeScript, PostgreSQL with Prisma, Redis (Upstash) for session state, and Twitter API v2 for publishing. The key engineering challenge was managing stateful multi-step conversations over a fundamentally stateless protocol — which I solved using a Redis-backed Finite State Machine."**

---

## 2. STAR Method Breakdown

### 📍 Situation
Content creators juggle multiple tools: AI generators, platform dashboards, and schedulers. The context-switching kills creative momentum. There's no single conversational tool that covers ideation → generation → publishing in one flow.

### 🎯 Task
Build a backend system that:
- Handles multi-step conversational flows over Telegram (stateless protocol)
- Integrates an LLM to generate platform-specific content
- Publishes reliably to social platforms with retries and failure notifications
- Stores credentials and API keys securely

### ⚙️ Action (Technical Highlights)

| Problem | Solution Used |
|---|---|
| Stateless Telegram protocol | Redis FSM with TTL-based session keys |
| Slow/unreliable third-party APIs | BullMQ with exponential backoff retries |
| Secure credential storage | AES-256-GCM encryption via Node.js `crypto` |
| Persistent data + relations | PostgreSQL with Prisma ORM |
| REST API surface | Express 5 + JWT auth (access + refresh tokens) |
| Input validation | Zod schema validation on all endpoints |

### 🏆 Result
A fully functional event-driven system where users publish to Twitter entirely through a Telegram chat, with zero downtime risk from slow APIs, automatic retries, and real-time success/failure notifications.

---

## 3. System Architecture Deep Dive

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        USER                                  │
│                    (Telegram App)                            │
└─────────────────────┬────────────────────────────────────────┘
                      │ Messages / Inline Buttons
                      ▼
┌──────────────────────────────────────────────────────────────┐
│              Telegram Bot (Long Polling)                     │
│              node-telegram-bot-api                           │
└─────────────────────┬────────────────────────────────────────┘
                      │ Events forwarded to
                      ▼
┌──────────────────────────────────────────────────────────────┐
│              Node.js / Express Server (TypeScript)           │
│  ┌─────────────┐  ┌───────────────┐  ┌───────────────────┐  │
│  │ Bot Handler │  │ REST API      │  │ BullMQ Worker     │  │
│  │(FSM Logic)  │  │(JWT Protected)│  │(Publish Jobs)     │  │
│  └──────┬──────┘  └───────┬───────┘  └────────┬──────────┘  │
└─────────┼─────────────────┼──────────────────-┼─────────────┘
          │                 │                    │
    ┌─────▼──────┐   ┌──────▼──────┐    ┌───────▼───────┐
    │  Upstash   │   │  PostgreSQL  │    │  Twitter API  │
    │  Redis     │   │  (Supabase) │    │    v2          │
    │ (HTTP +TCP)│   │  via Prisma  │    └───────────────┘
    └────────────┘   └─────────────┘
          ▲
          │ Queue backend (TCP/ioredis)
          │ Session state (HTTP/Upstash)
          │
    ┌─────┴──────┐
    │  NVIDIA NIM │
    │  (Gemma 2B) │
    └─────────────┘
```

### Component Responsibilities

| Component | File(s) | Responsibility |
|---|---|---|
| Entry Point | `server.ts` | Starts Express, bot, worker; manages graceful shutdown via PID file |
| Express App | `app.ts` | Registers all routes + global middleware (cors, helmet, morgan) |
| Telegram Bot | `bot/telegramBot.ts` | FSM logic, user interaction, queues jobs |
| Publish Queue | `queues/publish.queue.ts` | BullMQ Queue + Worker for async publishing |
| AI Service | `services/ai.service.ts` | Builds prompts, calls NVIDIA NIM, returns generated content |
| Auth | `controllers/auth.controller.ts` | Register, Login, Refresh, Logout with JWT + bcrypt |
| Posts | `controllers/post.controller.ts` | Publish, Schedule, Retry, Delete, List posts |
| User | `controllers/user.controller.ts` | Profile, Social accounts, AI key storage |
| Content | `controllers/content.controller.ts` | REST endpoint for content generation |
| Crypto | `utils/crypto.ts` | AES-256-GCM encrypt/decrypt |
| Redis | `utils/redis.ts` | Dual Redis clients (HTTP for sessions, TCP for BullMQ) |

---

## 4. Data Flow — Step by Step

### Bot Publishing Flow

```
1. User sends /start
   └─► Bot sets Redis key: chat:{chatId}:state = "AWAITING_POST_TYPE" (TTL: 30min)
   └─► Bot shows inline keyboard: Announcement / Thread / Story / Promotional / Educational / Opinion

2. User taps "Announcement"
   └─► callback_data = "type_announcement"
   └─► Bot saves: chat:{chatId}:post_type = "announcement"
   └─► Bot updates: chat:{chatId}:state = "AWAITING_PLATFORMS"
   └─► Bot shows: Platform selector (Twitter/X, Done)

3. User taps "Twitter/X" then "Done"
   └─► Each platform tap: reads + appends to chat:{chatId}:platforms (CSV)
   └─► "Done" tap: state = "AWAITING_TONE"
   └─► Bot shows: tone options (Professional / Casual / Witty / etc.)

4. User taps "Professional"
   └─► chat:{chatId}:tone = "professional"
   └─► state = "AWAITING_MODEL"
   └─► Bot shows: AI model selection (Gemini)

5. User taps "Gemini"
   └─► chat:{chatId}:model = "gemini"
   └─► state = "AWAITING_IDEA"
   └─► Bot prompts: "Tell me the idea or core message — keep it brief."

6. User types their idea (plain text message)
   └─► Bot detects state = "AWAITING_IDEA" via Redis lookup
   └─► Reads all session keys: post_type, platforms, tone, model
   └─► Calls: generateContent(userId, idea, platforms, tone, language, model)
        └─► constructPrompt(platform, idea, tone, language) → builds structured prompt
        └─► callNvidiaNim(prompt) → HTTPS POST to api.nvidia.com/v1/chat/completions
             └─► Model: google/gemma-2-2b-it, max_tokens: 4096, temp: 0.7
        └─► Returns: { generated: { twitter: { content: "..." } }, model_used: "nvidia-gemma" }
   └─► Preview stored: chat:{chatId}:preview = JSON.stringify(content.generated)
   └─► Bot shows preview + "Yes, Post Now" / "Cancel" buttons
   └─► state = "AWAITING_CONFIRMATION"

7. User taps "Yes, Post Now" (callback: "action_post")
   └─► Reads all session keys from Redis
   └─► Creates Post record in PostgreSQL:
        { user_id, idea, post_type, tone, language, model_used, status: "processing" }
   └─► For each platform:
        └─► Creates PlatformPost: { post_id, platform, content, status: "queued" }
        └─► Adds BullMQ job: publishQueue.add("publish", { platformPostId, platform, userId, chatId },
             { attempts: 3, backoff: { type: "exponential", delay: 1000 } })
   └─► Bot sends: "✅ Post has been queued for publishing!"
   └─► Deletes: chat:{chatId}:state (cleans session)

8. BullMQ Worker picks up job
   └─► Updates PlatformPost status: "processing", increments attempts
   └─► Fetches PlatformPost content from DB
   └─► Authenticates Twitter client (appKey, appSecret, accessToken, accessSecret)
   └─► Calls: client.v2.tweet(pPost.content)
   └─► On success:
        └─► Updates PlatformPost: status = "published", published_at = now()
        └─► Checks if ALL platform posts are done → updates Post.status = "published"
   └─► On failure (job 'failed' event):
        └─► Updates PlatformPost: status = "failed", error_message = err.message
        └─► BullMQ retries automatically (up to 3 attempts, exponential backoff)

9. Worker emits 'completed' or 'failed' event
   └─► Bot listener sends Telegram notification to chatId:
        Success: "🚀 SUCCESS! Your post has been published to twitter."
        Failure: "❌ FAILED! Could not publish to twitter: <error>"
```

---

## 5. Key Technical Decisions & Tradeoffs

### 5.1 Dual Redis Client Architecture

**The Problem:** The project uses two fundamentally different Redis interaction patterns:
- **Session management** (bot state): short-lived, frequent, small data — works great over HTTP
- **BullMQ queue backend**: requires a **persistent TCP connection** for pub/sub and blocking commands

**The Solution:** Two separate clients in `utils/redis.ts`:

```typescript
// HTTP Client — Upstash REST API (stateless, edge-compatible)
export const redis = new UpstashRedis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN
});

// TCP Client — ioredis (persistent, required by BullMQ)
const redisTcpUrl = process.env.REDIS_TCP_URL || 'redis://localhost:6379';
export const bullMqConnection = new Redis(redisTcpUrl, { maxRetriesPerRequest: null });
```

**Why this matters:** BullMQ uses Redis `BLPOP` (blocking list pop) for job dequeuing. This is a **blocking command** that holds an open TCP connection. Upstash's HTTP adapter cannot support this. Using two separate clients is the correct architectural decision, not a hack.

---

### 5.2 Finite State Machine via Redis Keys

Each user's conversation state is stored as individual Redis keys with a 30-minute TTL:

```
chat:{chatId}:state      → "AWAITING_IDEA" | "AWAITING_TONE" | etc.
chat:{chatId}:post_type  → "announcement"
chat:{chatId}:platforms  → "twitter" (CSV for multi-platform)
chat:{chatId}:tone       → "professional"
chat:{chatId}:model      → "gemini"
chat:{chatId}:idea       → "My startup just raised $1M..."
chat:{chatId}:preview    → JSON of generated content
```

**Why not a single JSON key?** Individual keys allow atomic updates to single fields without read-modify-write cycles. Each step of the FSM only writes the key it needs.

**Why TTL?** Abandoned sessions auto-expire. No manual cleanup required. This is **Redis's native strength** — impossible to replicate efficiently with a relational DB.

---

### 5.3 AES-256-GCM Encryption for Credentials

Social account tokens and AI keys are never stored in plaintext. The `crypto.ts` util:

```typescript
const ALGORITHM = 'aes-256-gcm'; // Authenticated encryption
const IV_LENGTH = 16;             // Random IV per encryption call

export const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(getKey()), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`; // iv:authTag:ciphertext
};
```

**Why GCM mode (not CBC)?** GCM is **authenticated encryption** — it provides both confidentiality AND integrity. The `authTag` ensures the ciphertext hasn't been tampered with. CBC would only encrypt, not authenticate.

**Why random IV?** A new random IV per encryption operation ensures that encrypting the same plaintext twice produces different ciphertext. This prevents pattern analysis.

**Storage format:** `iv:authTag:ciphertext` — all three components needed for decryption are stored together in a single DB column, so no extra schema is needed.

---

### 5.4 JWT Token Strategy (Access + Refresh)

```typescript
// Short-lived access token (15 minutes)
const accessToken = jwt.sign({ id, email }, JWT_ACCESS_SECRET, { expiresIn: '15m' });

// Long-lived refresh token (7 days) — stored in DB for revocation
const refreshToken = jwt.sign({ id, email }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

// DB-backed Session model stores refresh token → enables logout/revocation
```

**Why two tokens?** If only a long-lived token existed, stolen tokens would grant access for days. With short-lived access tokens (15m), the attacker's window is tiny. The refresh token is DB-backed, so `DELETE session` = instant logout. This is **token rotation** — a security best practice.

**The refresh endpoint** uses a "rotate on use" pattern: it deletes the old session and creates a new one, preventing refresh token replay attacks.

---

### 5.5 BullMQ Job Configuration

```typescript
await publishQueue.add('publish', jobData, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 }
  // attempt 1: immediately
  // attempt 2: after 1s
  // attempt 3: after 2s (2^1 * 1000ms)
});
```

**Concurrency:** Worker is set to `concurrency: 5`, meaning 5 jobs run in parallel.

**Why exponential backoff?** Twitter's API may be rate-limited or temporarily unavailable. Hammering it immediately would make things worse. Exponential backoff gives the API time to recover while still retrying.

**Status lifecycle:**
```
queued → processing → published  ✅
                    → failed     ❌ (with error_message stored)
```

The `post.controller.ts` also exposes a `retryPost` endpoint to manually re-queue failed jobs without re-generating content.

---

### 5.6 Prompt Engineering for Platform-Specific Content

```typescript
const constructPrompt = (platform, idea, tone, language) => {
  let platformRules = '';
  if (platform === 'twitter') {
    platformRules = 'Max 280 characters. Include 2-3 relevant hashtags. Must have a punchy opener.';
  }

  return `Generate a ${platform} post based on this idea: "${idea}".
Tone: ${tone}
Language: ${language}
Platform Constraints: ${platformRules}

Provide only the content. Do not wrap in quotes or add preamble.`;
};
```

Key decisions in the prompt:
- **Platform constraints are injected** so the model understands format boundaries
- **"Provide only the content"** prevents the model from wrapping the post in markdown or adding explanatory text
- **Tone and Language** are separate parameters to make the model's output persona controllable

---

### 5.7 Graceful Shutdown & PID Management

`server.ts` implements a PID file strategy to prevent duplicate processes during development:

```typescript
if (fs.existsSync(PID_FILE)) {
  const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
  if (oldPid && oldPid !== process.pid) {
    process.kill(oldPid, 'SIGTERM'); // Signal previous instance to shut down
    // Sync wait 2s for port + bot polling release
  }
}
fs.writeFileSync(PID_FILE, process.pid.toString());
```

**Why?** Telegram's polling system only allows one active poller per token. Running two instances causes a `409 Conflict` error. The PID file ensures the old instance dies before the new one starts.

**Graceful shutdown** also stops the BullMQ worker and Express server cleanly on `SIGTERM`/`SIGINT`, preventing mid-flight jobs from being lost.

---

## 6. Database Schema Explained

```prisma
model User {
  id, email, password_hash, name, bio
  default_tone, default_language        // User preferences
  ai_key      AIKey?                    // 1-to-1: their encrypted Gemini key
  posts       Post[]                    // 1-to-many: their posts
  sessions    Session[]                 // 1-to-many: refresh token sessions
  social_accounts SocialAccount[]       // 1-to-many: connected platforms
}

model Post {
  idea, post_type, tone, language, model_used   // Generation parameters
  status        // "processing" | "published" | "queued" | "cancelled"
  publish_at    // nullable — set for scheduled posts
  platform_posts PlatformPost[]                 // one per platform
}

model PlatformPost {
  platform      // "twitter"
  content       // the actual generated text
  status        // "queued" | "processing" | "published" | "failed" | "cancelled"
  published_at  // timestamp on success
  error_message // stored on failure for debugging
  attempts      // how many times the worker tried
}
```

**Why separate `Post` and `PlatformPost`?** A single idea generates N platform-specific posts. Each platform post has independent state (one may succeed while another fails). The parent `Post` aggregates all child statuses.

**Why store `model_used` on Post?** Audit trail — lets users know which AI model generated their content, which matters if they switch models.

---

## 7. REST API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | ❌ | Create account |
| POST | `/api/auth/login` | ❌ | Get access + refresh tokens |
| POST | `/api/auth/refresh` | ❌ | Rotate refresh token |
| POST | `/api/auth/logout` | ❌ | Invalidate refresh token |
| GET | `/api/user/me` | ✅ | Get current user profile |
| PUT | `/api/user/me` | ✅ | Update profile (name, bio, defaults) |
| POST | `/api/user/social` | ✅ | Connect social account (encrypts tokens) |
| GET | `/api/user/social` | ✅ | List connected accounts |
| DELETE | `/api/user/social/:id` | ✅ | Disconnect account |
| PUT | `/api/user/ai-keys` | ✅ | Store encrypted AI API key |
| POST | `/api/content/generate` | ✅ | Generate content (no publish) |
| POST | `/api/posts/publish` | ✅ | Publish immediately |
| POST | `/api/posts/schedule` | ✅ | Schedule for future publish |
| GET | `/api/posts` | ✅ | List posts (paginated, filterable) |
| GET | `/api/posts/:id` | ✅ | Get single post + platform statuses |
| DELETE | `/api/posts/:id` | ✅ | Cancel post |
| POST | `/api/posts/:id/retry` | ✅ | Re-queue failed platform jobs |
| GET | `/api/dashboard/stats` | ✅ | Total posts, success rate, per-platform counts |
| GET | `/health` | ❌ | Health check |

---

## 8. Tough Interview Questions — Model Answers

**Q: Why Telegram instead of a web UI?**
> "A web UI requires a frontend framework, hosting, authentication UI, and responsive design. Telegram gives us all of that for free — it's mobile-first, runs on every device, and handles authentication. The bot just has to respond to events. This let me focus on the backend logic rather than building a UI from scratch."

---

**Q: Why didn't you just use PostgreSQL for session state?**
> "Session state has three characteristics that make Redis ideal: it's short-lived (30 minutes), it's read/written on every bot interaction (high frequency), and it doesn't need relational queries. Redis handles all three: sub-millisecond reads, built-in TTL for auto-expiry, and no overhead of SQL transactions. Using PostgreSQL for this would add unnecessary load and latency."

---

**Q: What happens if Redis goes down?**
> "Active bot sessions would be lost — users mid-flow would need to /start again. In production, I'd use Upstash Redis with replication (it's cloud-managed with built-in HA). For BullMQ, jobs in-flight would be paused, but no jobs would be lost if Redis AOF (Append-Only File) persistence is enabled — Redis can recover the queue state on restart."

---

**Q: What happens if the NVIDIA API is down during content generation?**
> "The error is caught in the try/catch block in the bot's message handler. The bot sends a user-friendly error message: 'Error generating content: ...' instead of crashing. The session state remains in 'AWAITING_IDEA', so the user can simply retype their idea to retry."

---

**Q: Why BullMQ instead of direct async/await for publishing?**
> "If I published synchronously in the bot handler, two problems arise: (1) if Twitter takes 3s to respond, the bot feels unresponsive; (2) if the job fails, there's no automatic retry. BullMQ solves both: the user gets immediate feedback ('Queued!'), and the worker retries with exponential backoff up to 3 times automatically. It's the difference between fire-and-pray vs. reliable delivery."

---

**Q: Why use Zod for validation?**
> "Express doesn't validate request bodies by default. Without validation, malformed requests reach the database layer, causing cryptic errors. Zod provides schema-level validation with excellent TypeScript inference — if `generateSchema.parse(req.body)` passes, TypeScript guarantees the types downstream. It also auto-generates 400 errors with descriptive field-level messages."

---

**Q: How do you prevent the Telegram 409 Conflict polling error?**
> "The PID file strategy in server.ts. On startup, we check if a PID file exists. If it does, we SIGTERM the old process and wait 2 seconds for it to release the port and stop polling. Then we write the new PID. The bot also has a 409 handler that stops and restarts polling after a 5-second delay. In production, you'd use a process manager like PM2 with a single instance, but for local development this is robust enough."

---

**Q: How does the retry endpoint work?**
> "The `retryPost` endpoint (`POST /api/posts/:id/retry`) queries `platformPost` records with `status = 'failed'` for the given post ID. It resets them to `status = 'queued'` and clears `error_message`, then re-adds them to the BullMQ publish queue. Crucially, it does NOT re-generate the content — the existing `content` field in `PlatformPost` is reused. This is intentional: you don't want the AI to generate different content just because the Twitter API was temporarily down."

---

**Q: Is there a risk of the same content being published twice?**
> "BullMQ has built-in job deduplication via `jobId`. Currently, we don't set a custom `jobId`, so theoretically a duplicate could be added. In a production hardening phase, I'd use `jobId: platformPostId` to deduplicate jobs. The worker also checks the post status before publishing — if it's already 'published', it can short-circuit."

---

**Q: Why store `attempts` in PlatformPost?**
> "BullMQ tracks retry counts internally, but those are ephemeral. Storing `attempts` in the database gives us a persistent audit trail: 'This post took 3 attempts to publish.' This is valuable for debugging — if a user says 'why did my post fail?', I can see exactly how many times we tried and what error occurred on each attempt."

---

**Q: How is the schedule feature implemented?**
> "The `schedulePost` controller calculates `delay = publish_at - Date.now()` in milliseconds. It passes this `delay` option to `publishQueue.add()`. BullMQ natively supports delayed jobs — it stores the job with a 'delayed' status and only makes it available to workers after the delay expires. This is backed by Redis sorted sets with timestamps as scores."

---

**Q: Why bcrypt for passwords and AES-GCM for tokens — why not the same algorithm for both?**
> "They solve fundamentally different problems. `bcrypt` is a **one-way hash** — you never need to recover the original password, only verify a guess against the hash. It's slow by design to resist brute-force attacks. AES-256-GCM is **reversible encryption** — the system needs to retrieve the actual Twitter access token to make API calls. You can't hash a token you need to use later."

---

## 9. Tech Stack Rationale Summary

| Technology | Why Chosen |
|---|---|
| **Node.js + TypeScript** | Non-blocking I/O ideal for event-driven bot/queue architecture; TypeScript adds compile-time safety |
| **Express 5** | Lightweight, flexible HTTP framework; v5 has native async error handling |
| **Prisma** | Type-safe ORM with schema-first development; migrations, relations, and `include` for joins |
| **PostgreSQL** | ACID-compliant relational DB; perfect for User/Post/Session relational data |
| **Upstash Redis (HTTP)** | Serverless Redis for session state; no persistent connection needed; built-in TTL |
| **ioredis + local Redis** | BullMQ requires TCP persistent connections; Upstash HTTP client can't support BLPOP |
| **BullMQ** | Production-grade job queue backed by Redis; supports delays, retries, concurrency, events |
| **NVIDIA NIM (Gemma 2B)** | OpenAI-compatible API surface; no SDK needed; raw HTTPS call for transparency |
| **Twitter API v2** | Official API for tweet publishing; twitter-api-v2 library handles OAuth 1.0a |
| **Zod** | Runtime + compile-time validation; better than Joi due to TypeScript-first design |
| **Helmet** | Sets security HTTP headers (X-Frame-Options, CSP, etc.) with one line |
| **bcryptjs** | Adaptive hashing for passwords with salt rounds |

---

## 10. What I'd Add in Production

| Feature | Implementation Approach |
|---|---|
| **Rate Limiting** | `express-rate-limit` per IP + per user; BullMQ rate limiter per worker |
| **Multi-platform Support** | Extend `publish.queue.ts` worker with platform strategy pattern |
| **Webhook Mode** | Replace polling with Express `/webhook` endpoint + Telegram `setWebhook` |
| **Job Deduplication** | Use `jobId: platformPostId` in BullMQ to prevent double-publish |
| **Monitoring** | Bull Board dashboard (BullMQ UI) for queue visibility; Prometheus metrics |
| **Scheduled Post Reminders** | Separate BullMQ queue for reminders; notify user 5min before scheduled time |
| **Content History in Bot** | `/status` command already planned; shows last 5 posts with status |
| **Multi-tenancy** | Per-user encryption keys instead of global `ENCRYPTION_KEY` env var |
| **Test Coverage** | Unit tests for `crypto.ts`, `ai.service.ts`; integration tests for queue worker |

---

## 11. Quick Reference — Key Code Locations

| What | Where |
|---|---|
| Bot FSM state transitions | `src/bot/telegramBot.ts` — callback_query handler |
| Redis dual-client setup | `src/utils/redis.ts` |
| AES-256-GCM encrypt/decrypt | `src/utils/crypto.ts` |
| NVIDIA NIM API call | `src/services/ai.service.ts` — `callNvidiaNim()` |
| BullMQ job creation | `src/queues/publish.queue.ts` — `publishQueue.add()` |
| BullMQ worker logic | `src/queues/publish.queue.ts` — `publishWorker` |
| JWT token generation | `src/controllers/auth.controller.ts` — `generateTokens()` |
| Social token encryption | `src/controllers/user.controller.ts` — `addSocialAccount()` |
| Post scheduling logic | `src/controllers/post.controller.ts` — `schedulePost()` |
| Database schema | `prisma/schema.prisma` |
| All route definitions | `src/routes/*.ts` |
| Graceful shutdown + PID | `src/server.ts` |

---

*Last updated: May 2026 — Covers full codebase as implemented.*
