# Postly

Multi-Platform AI Content Publishing Engine Backend.

## Setup
1. `npm install`
2. `cp .env.example .env` and fill in secrets.
3. `docker-compose up -d`
4. `npx prisma db push` or `npx prisma migrate dev`
5. `npm run dev` (run `npx ts-node-dev src/server.ts`)

## Bot Setup
Webhook URL must be registered with Telegram.

## Endpoints
Import the Postman collection or see `src/routes`.
