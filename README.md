# Postly

Multi-Platform AI Content Publishing Engine Backend. Postly is an automated system that utilizes the Gemini AI model to generate and publish social media content directly from a conversational Telegram bot.

## Features

- **JWT Authentication**: Secure user registration, login, and robust session management with short-lived access tokens and rotated, database-persisted refresh tokens.
- **Data Encryption**: All sensitive OAuth tokens and AI API keys are securely encrypted at rest using AES-256-GCM.
- **Gemini AI Content Engine**: Integrates natively with `@google/generative-ai` to automatically format user ideas into platform-ready posts (e.g., enforcing 280-character limits and hashtags for Twitter).
- **Telegram Bot Interface**: A multi-step conversational flow allowing users to pick platforms, tone, and provide ideas natively within Telegram. Powered by Redis state management.
- **Asynchronous Publishing**: Utilizes `BullMQ` and `Redis` to queue jobs, handle simulated network delays, and retry API failures with exponential backoff.
- **Dashboard APIs**: Comprehensive REST endpoints for monitoring queue statuses, historical posts, and user statistics.

## Prerequisites
- Node.js v18+
- Docker & Docker Compose (for local database and Redis)
- A Telegram Bot Token (from BotFather)
- A Gemini API Key

## Setup & Starting the Server

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Copy the example environment file and fill in your secrets (especially `GEMINI_API_KEY` and `TELEGRAM_BOT_TOKEN`).
   ```bash
   cp .env.example .env
   ```

3. **Start Local Services (PostgreSQL & Redis)**
   Ensure Docker Desktop is running, then execute:
   ```bash
   docker compose up -d
   ```

4. **Initialize Database**
   Push the Prisma schema to the database to create the tables.
   ```bash
   npx prisma db push
   # Alternatively: npx prisma migrate dev
   ```

5. **Start the Development Server**
   Start the Node.js API with hot-reloading:
   ```bash
   npm run dev
   ```
   *(If not configured in package.json, you can run: `npx ts-node-dev src/server.ts`)*

## How to Use the Server

### 1. Telegram Bot Flow
Once your server is running and the Telegram bot is configured (with Webhooks pointing to your live URL, e.g., `/api/webhook/telegram`), you can interact with the bot:
- Open Telegram and message your bot with `/start`.
- Follow the interactive prompts to select the **Post Type**, **Platform (Twitter)**, and **Tone**.
- Provide a brief idea. The bot will trigger Gemini to generate a preview.
- Confirm the post. It will enter the BullMQ publishing queue and automatically update the database once "published."

### 2. Dashboard API Endpoints
You can interact with the REST API using Postman or Bruno. Include the `Bearer <access_token>` in your headers.

**Auth:**
- `POST /api/auth/register` - Create an account
- `POST /api/auth/login` - Get JWT tokens
- `POST /api/auth/refresh` - Rotate refresh token

**User Settings:**
- `GET /api/user/profile` - View profile
- `PUT /api/user/ai-keys` - Add your Gemini API key (encrypted in DB)
- `POST /api/user/social-accounts` - Link a mock Twitter/X account

**Posts:**
- `POST /api/content/generate` - Directly test Gemini generation
- `GET /api/posts` - Paginated history of your posts
- `GET /api/dashboard/stats` - Total posts and success rate metrics
