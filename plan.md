# Postly: Detailed Implementation Plan

This is a comprehensive, step-by-step breakdown of the Postly Multi-Platform AI Content Publishing Engine backend development.

---

## Task 1: Project Initialization & Architecture Setup
**Objective**: Establish the foundational codebase, Docker environment, and server structure.

### Subtask 1.1: Node.js & TypeScript Setup
- Run `npm init -y` to initialize `package.json`.
- Install TypeScript dependencies: `npm i -D typescript @types/node ts-node-dev`.
- Initialize TypeScript: `npx tsc --init`.
- Configure `tsconfig.json`:
  - `"target": "ES2022"`
  - `"module": "CommonJS"`
  - `"rootDir": "./src"`
  - `"outDir": "./dist"`
  - `"strict": true`
- Create `src` directory and `src/server.ts` as the entry point.
- **Commit**: `chore: initialize node project with typescript`

### Subtask 1.2: Core Dependencies Installation
- **Core server**: `npm i express cors helmet dotenv`
- **Validation**: `npm i zod`
- **Logging**: `npm i morgan`
- **Dev types**: `npm i -D @types/express @types/cors @types/morgan`
- **Commit**: `chore: install core server dependencies`

### Subtask 1.3: Express Server Configuration
- Create `src/app.ts` to instantiate the Express app.
- Apply global middlewares: `express.json()`, `cors()`, `helmet()`, `morgan('dev')`.
- Set up a basic health-check endpoint: `GET /health`.
- Set up global error handling middleware (`src/middlewares/errorHandler.ts`).
- Bind the app to a port in `src/server.ts` (e.g., `PORT=3000`).
- **Commit**: `feat: setup express server with global middlewares and error handling`

### Subtask 1.4: Docker Environment & Env Vars
- Create `.env.example` with placeholders for `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`.
- Create `docker-compose.yml` defining two services:
  - `postgres` (PostgreSQL 15, port 5432)
  - `redis` (Redis 7, port 6379)
- **Commit**: `chore: setup docker-compose for database and redis`

---

## Task 2: Database Design & ORM Configuration
**Objective**: Set up Prisma ORM and define the precise database schema based on requirements.

### Subtask 2.1: Prisma Initialization
- Install Prisma: `npm i -D prisma` and `npm i @prisma/client`.
- Initialize Prisma: `npx prisma init`.
- Update `prisma/schema.prisma` to use PostgreSQL.
- **Commit**: `chore: initialize prisma orm`

### Subtask 2.2: Define Schema Models
- **User Model**:
  - `id` (UUID), `email` (Unique), `password_hash` (String), `name` (String), `bio` (String?), `default_tone` (String?), `default_language` (String?), `created_at` (DateTime).
- **SocialAccount Model**:
  - `id` (UUID), `user_id` (Relation to User), `platform` (String: twitter, linkedin, etc.), `access_token_enc` (String), `refresh_token_enc` (String?), `handle` (String?), `connected_at` (DateTime).
- **AIKey Model**:
  - `id` (UUID), `user_id` (Relation to User, Unique), `openai_key_enc` (String?), `anthropic_key_enc` (String?), `updated_at` (DateTime).
- **Post Model**:
  - `id` (UUID), `user_id` (Relation to User), `idea` (String, max 500), `post_type` (String), `tone` (String), `language` (String), `model_used` (String), `created_at` (DateTime), `publish_at` (DateTime?), `status` (String).
- **PlatformPost Model**:
  - `id` (UUID), `post_id` (Relation to Post), `platform` (String), `content` (String), `status` (String: queued, processing, published, failed, cancelled), `published_at` (DateTime?), `error_message` (String?), `attempts` (Int, default 0).
- **Commit**: `feat: define core database schema models`

### Subtask 2.3: Database Migration
- Start Docker containers: `docker-compose up -d`.
- Run migration: `npx prisma migrate dev --name init_schema`.
- Create `src/utils/db.ts` to instantiate and export the PrismaClient.
- **Commit**: `chore: apply initial database migration`

---

## Task 3: Security & Cryptography Layer
**Objective**: Implement tools to securely hash passwords and encrypt sensitive tokens.

### Subtask 3.1: Password Hashing
- Install bcrypt: `npm i bcrypt` & `npm i -D @types/bcrypt`.
- Create `src/utils/hash.ts` with functions: `hashPassword(plain)` (using cost 12) and `verifyPassword(plain, hashed)`.
- **Commit**: `feat: add bcrypt password hashing utility`

### Subtask 3.2: AES-256 Encryption
- Create `src/utils/crypto.ts` using Node's native `crypto` module.
- Implement `encrypt(text: string): string` (AES-256-GCM, utilizing `ENCRYPTION_KEY` from env, appending initialization vector and auth tag).
- Implement `decrypt(encryptedText: string): string`.
- **Commit**: `feat: implement AES-256-GCM encryption for secrets`

---

## Task 4: User Authentication System
**Objective**: Build a complete JWT-based auth flow with token rotation.

### Subtask 4.1: Auth Controllers & Routes
- Install JWT: `npm i jsonwebtoken` & `npm i -D @types/jsonwebtoken`.
- Create `src/routes/auth.routes.ts` and `src/controllers/auth.controller.ts`.
- **POST /api/auth/register**:
  - Validate email, password, name (using Zod).
  - Hash password.
  - Create user in DB.
  - Return user (excluding password).
- **POST /api/auth/login**:
  - Validate credentials.
  - Generate Access Token (15m expiry, signed with `JWT_ACCESS_SECRET`).
  - Generate Refresh Token (7d expiry, signed with `JWT_REFRESH_SECRET`).
  - Store Refresh Token in DB (or Redis) against the user session.
  - Return both tokens.
- **Commit**: `feat: implement user registration and login endpoints`

### Subtask 4.2: Refresh Token Rotation
- **POST /api/auth/refresh**:
  - Accept old refresh token.
  - Verify signature and check if it exists in the DB/Redis.
  - Invalidate old refresh token.
  - Generate new Access and Refresh tokens.
  - Save new refresh token.
- **POST /api/auth/logout**:
  - Accept refresh token and delete/invalidate it from DB/Redis.
- **Commit**: `feat: implement secure refresh token rotation and logout`

### Subtask 4.3: Auth Middleware
- Create `src/middlewares/auth.middleware.ts`.
- Extract Bearer token from `Authorization` header.
- Verify JWT using `JWT_ACCESS_SECRET`.
- Attach `req.user` payload to the request.
- Return 401 Unauthorized for invalid/expired tokens.
- **Commit**: `feat: add JWT authentication middleware`

---

## Task 5: User Profile & Integration APIs
**Objective**: Endpoints for managing user profiles, social accounts, and custom AI keys.

### Subtask 5.1: Profile Management
- Create `src/routes/user.routes.ts` and `src/controllers/user.controller.ts`.
- **GET /api/auth/me**: Return current user data.
- **PUT /api/user/profile**: Update `name`, `bio`, `default_tone`, `default_language`.
- **GET /api/user/profile**: Fetch profile.
- **Commit**: `feat: add user profile management endpoints`

### Subtask 5.2: Social Accounts Management
- **POST /api/user/social-accounts**:
  - Accept `platform`, `access_token`, `refresh_token`, `handle`.
  - Encrypt tokens using `src/utils/crypto.ts`.
  - Save to `SocialAccount` model.
- **GET /api/user/social-accounts**:
  - Return list of accounts (omit encrypted tokens, return handle and platform).
- **DELETE /api/user/social-accounts/:id**:
  - Remove account from DB.
- **Commit**: `feat: add social account connection endpoints`

### Subtask 5.3: AI Keys Management
- **PUT /api/user/ai-keys**:
  - Accept `openai_key` and/or `anthropic_key`.
  - Encrypt keys and upsert into `AIKey` model.
- **Commit**: `feat: add AI key storage endpoint`

---

## Task 6: AI Content Engine Service
**Objective**: Abstract the AI generation logic with strict prompt engineering.

### Subtask 6.1: API Clients Setup
- Install SDKs: `npm i @google/generative-ai`.
- Create `src/services/ai.service.ts`.
- Implement a helper to resolve which API key to use (User's custom Gemini key from DB decrypted, fallback to `.env` key).
- **Commit**: `chore: setup AI SDKs and key resolution`

### Subtask 6.2: Prompt Engineering
- Define platform constraints explicitly in system prompts:
  - **Twitter**: Max 280 chars, 2-3 hashtags, punchy opener.
- Create prompt builders that inject the user's `idea`, `post_type`, `tone`, and `language`.
- **Commit**: `feat: design strict platform-specific AI prompts`

### Subtask 6.3: Generation Endpoint
- Create `src/controllers/content.controller.ts` & `src/routes/content.routes.ts`.
- **POST /api/content/generate**:
  - Accept generation payload.
  - Route to Gemini.
  - Parse the AI response into the required JSON envelope (per-platform output + token usage).
- **Commit**: `feat: implement content generation endpoint`

---

## Task 7: Telegram Bot & Conversational Flow
**Objective**: Build the primary user interface using Telegram Webhooks and Redis.

### Subtask 7.1: Bot Webhook Configuration
- Install Bot API: `npm i node-telegram-bot-api`.
- Create `src/bot/telegramBot.ts`. Initialize in webhook mode.
- Create `POST /api/webhook/telegram` endpoint in Express to pass updates to the bot instance.
- **Commit**: `feat: setup Telegram bot webhook integration`

### Subtask 7.2: Redis Session Management
- Install Redis client: `npm i ioredis`.
- Create `src/utils/redis.ts`.
- Implement getters/setters for conversational state based on `chatId`. Set 30-min TTL.
- **Commit**: `feat: implement Redis-backed bot session management`

### Subtask 7.3: Bot Command Handlers
- Implement `/start`, `/help`, `/status` (fetch last 5 posts from DB), `/accounts` (list social accounts).
- **Commit**: `feat: add basic Telegram bot commands`

### Subtask 7.4: Multi-Step Generation Flow
- Implement the state machine:
  1. Ask Post Type. (Save to Redis, prompt Platforms)
  2. Ask Platforms (Multi-select via Inline Keyboard).
  3. Ask Tone.
  4. Ask AI Model.
  5. Ask Idea (Wait for text input).
  6. Trigger `ai.service.ts` to generate preview.
  7. Show preview and provide "Confirm & Post" or "Cancel" buttons.
  8. If Confirmed, insert into DB and push to Queue.
- **Commit**: `feat: implement complete multi-step bot conversational flow`

---

## Task 8: Publishing Queue Architecture
**Objective**: Implement a reliable, retryable queue using BullMQ.

### Subtask 8.1: Queue Setup
- Install BullMQ: `npm i bullmq`.
- Create `src/queues/publish.queue.ts` connected to Redis.
- Define job payload interface: `{ platformPostId: string, platform: string, userId: string }`.
- **Commit**: `feat: initialize BullMQ publishing queue`

### Subtask 8.2: Platform Workers
- Create `src/workers/publish.worker.ts`.
- Fetch `PlatformPost` and `SocialAccount` (decrypt access token) from DB.
- Implement platform-specific API calls (mocking is acceptable as per brief, but must simulate network delay and potential failure).
- Update `PlatformPost` status to `processing`, then `published` or `failed`.
- **Commit**: `feat: implement BullMQ job workers for content publishing`

### Subtask 8.3: Retry Policy & Error Handling
- Configure BullMQ worker with exponential backoff: 3 attempts, 1s -> 5s -> 25s.
- Capture error reasons and save to `error_message` in the database on failure.
- Update overall `Post` status if all platform posts finish.
- **Commit**: `feat: configure queue retry policies and failure tracking`

---

## Task 9: REST API for Dashboard
**Objective**: Provide endpoints for frontend consumption.

### Subtask 9.1: Post Management APIs
- Create `src/controllers/post.controller.ts` & `src/routes/post.routes.ts`.
- **POST /api/posts/publish**: Add job to queue immediately.
- **POST /api/posts/schedule**: Add job to queue with `delay` option based on `publish_at`.
- **POST /api/posts/:id/retry**: Find failed `PlatformPost`s and re-add them to the queue.
- **DELETE /api/posts/:id**: Cancel scheduled posts (remove from queue, mark `cancelled` in DB).
- **Commit**: `feat: add post publishing, scheduling, and retry APIs`

### Subtask 9.2: Reporting & Filtering APIs
- **GET /api/posts**: Fetch history. Implement pagination (`page`, `limit`), and filters (`status`, `platform`).
- **GET /api/posts/:id**: Fetch specific post details.
- **GET /api/dashboard/stats**: Calculate total posts, success rate, and platform breakdown using Prisma aggregations.
- **Commit**: `feat: add dashboard statistics and paginated post listing APIs`

---

## Task 10: Automated Testing
**Objective**: Ensure system stability with Jest and Supertest.

### Subtask 10.1: Test Environment Setup
- Install testing tools: `npm i -D jest supertest ts-jest @types/jest @types/supertest`.
- Initialize Jest config (`npx ts-jest config:init`).
- **Commit**: `chore: setup jest and supertest for automated testing`

### Subtask 10.2: Write Core Tests
- Test 1: Auth Middleware - missing token (401).
- Test 2: Auth Middleware - expired/invalid token (401).
- Test 3: Content Generation - input validation failure (400).
- Test 4: Database Integration - create a post and verify statuses.
- Test 5: Queue Job Creation - verify queue receives job on publish.
- **Commit**: `test: implement minimum 5 required test suites`

---

## Task 11: Final Polish, Documentation & Deployment
**Objective**: Ensure the submission meets all non-negotiable standards.

### Subtask 11.1: Documentation
- Create comprehensive `README.md` (Setup, Env, Telegram Bot config, Live URL, Postman link).
- Create `ARCHITECTURE.md` (Data flow diagram, Redis state, DB schema, queue retry logic).
- Create `AI_USAGE.md` (Detailed disclosure of AI tools used during development).
- **Commit**: `docs: write comprehensive README, ARCHITECTURE, and AI_USAGE`

### Subtask 11.2: Deployment
- Deploy PostgreSQL and Redis to a cloud provider (e.g., Aiven, Supabase).
- Deploy Node.js server to Render or Railway.
- Configure `.env` variables on the hosting platform.
- Register the live Webhook URL with Telegram (`https://api.telegram.org/bot<TOKEN>/setWebhook?url=<LIVE_URL>/api/webhook/telegram`).
- **Commit**: `chore: prepare environment for production deployment`

### Subtask 11.3: Demonstration Video
- Record the 2-minute Loom video:
  - Show the Telegram bot conversation from start to finish.
  - Show the DB/Terminal updating statuses.
  - Show Postman hitting the Dashboard API endpoints.
