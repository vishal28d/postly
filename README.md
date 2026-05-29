# 🚀 Postly

**Multi-Platform AI Content Publishing Engine.**  
Postly is an intelligent automation system that transforms your ideas into platform-ready social media content using advanced AI models. Orchestrated through a conversational Telegram bot, Postly handles everything from generation to scheduling and publishing.

**Live Demo**: [Postly on Render](https://postly-knzw.onrender.com)  
**Telegram Bot**: [@Postly_content_bot](https://t.me/Postly_content_bot)

---

## 🛠️ Tech Stack & Architecture

Postly is built on a modern, asynchronous event-driven architecture to ensure high reliability and low latency.

### Core Technologies
- **Node.js & TypeScript**: Core runtime and language providing type-safety and modern ES features.
- **Express.js**: Lightweight framework for the Dashboard REST APIs.
- **PostgreSQL & Prisma**: Relational database with a type-safe ORM for user data, posts, and encrypted credentials.
- **Redis & BullMQ**: A high-performance message broker and queue system used for background job processing and managing Telegram bot conversational state.
- **NVIDIA NIM (Gemma 3)**: State-of-the-art AI model (`google/gemma-3-27b-it`) used for content generation via secure HTTPS endpoints.
- **Telegram Bot API**: Conversational interface for interacting with the content engine.
- **Twitter API v2**: Native integration for automated publishing.

---

## 📂 File Structure

```bash
credes-assign/
├── prisma/                 # Database schema and migrations
│   └── schema.prisma       # Data models (Users, Posts, AIKeys, etc.)
├── src/
│   ├── bot/                # Telegram Bot implementation
│   │   └── telegramBot.ts  # Bot logic, commands, and session handling
│   ├── controllers/        # REST API controllers for the dashboard
│   ├── middlewares/        # Express middlewares (Auth, Logging, etc.)
│   ├── queues/             # BullMQ queue definitions
│   │   └── publish.queue.ts # Task worker and publishing logic
│   ├── services/           # Business logic layer
│   │   └── ai.service.ts   # NVIDIA NIM integration and prompt engineering
│   ├── utils/              # Utility classes and helpers
│   │   ├── db.ts           # Prisma Client & PostgreSQL adapter
│   │   ├── redis.ts        # Redis client configuration
│   │   └── crypto.ts       # AES-256-GCM encryption/decryption
│   ├── app.ts              # Express application setup
│   └── server.ts           # Entry point with PID-based process management
├── scratch/                # Diagnostic and test scripts
└── .env                    # Environment variables (API Keys, DB URLs)
```

---

## ✨ Key Features

- **Conversational Content Engine**: Generate posts natively within Telegram. No complex dashboards required.
- **NVIDIA NIM (Gemma 3) Integration**: Leverages high-performance AI for creative and logical writing.
- **Multi-Step State Management**: Uses **Redis** to maintain user session state across Telegram conversations.
- **Asynchronous Job Queue**: Powered by **BullMQ**, ensuring posts are reliably published even during API downtime.
- **Smart Notifications**: Real-time success/fail notifications sent back to your Telegram chat.
- **Secure by Design**: All sensitive API keys and social tokens are encrypted at rest using AES-256-GCM.
- **Auto-Session Cleanup**: Automatic detection and termination of stale processes using PID-file tracking.

---

## 🚀 Setup Guide

### 1. Prerequisites
- Node.js v18+
- PostgreSQL Database
- Redis Instance
- NVIDIA NIM API Key
- Telegram Bot Token

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
PORT=3000
DATABASE_URL="postgresql://user:pass@host:5432/db"
REDIS_URL="redis://localhost:6379"

# Encryption (32 char key)
ENCRYPTION_KEY="your-32-character-secret-key"

# AI Configuration
NVIDIA_API_KEY="your_nvidia_nim_key"

# Telegram Configuration
TELEGRAM_BOT_TOKEN="your_bot_token"

# Twitter Configuration
TWITTER_API_KEY="your_api_key"
TWITTER_API_SECRET="your_api_secret"
TWITTER_ACCESS_TOKEN="your_access_token"
TWITTER_ACCESS_SECRET="your_access_secret"
```

### 3. Installation
```bash
# Install dependencies
npm install

# Initialize database
npx prisma generate
npx prisma db push

# Start development server
npm run dev
```

---

## 🤖 How to Use the Telegram Bot

1. **Start the Bot**: Search for `@Postly_content_bot` on Telegram and send `/start`.
2. **Select Platform**: Choose the social media platform (e.g., Twitter).
3. **Select Tone**: Choose the mood (Professional, Excited, etc.).
4. **Provide Idea**: Type your post idea (e.g., "AI is changing the world").
5. **Preview & Confirm**: Review the AI-generated content and click **"✅ Yes, Post Now"**.
6. **Notification**: You will receive a 🚀 notification once the post is live.

---

## 📄 License
ISC License. Built for scalability and speed.