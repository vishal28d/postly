import dotenv from 'dotenv';
dotenv.config();

import app from './app';

import { bot, stopBot } from './bot/telegramBot';
import './queues/publish.queue';

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
});

const shutdown = async () => {
  console.log('Shutdown signal received: closing HTTP server and bot');
  await stopBot();
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
