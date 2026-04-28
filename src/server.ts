import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import fs from 'fs';
import path from 'path';

import { bot, stopBot } from './bot/telegramBot';
import './queues/publish.queue';

const PORT = process.env.PORT || 3000;
const PID_FILE = path.join(process.cwd(), 'server.pid');

// Automatically stop previous instance if PID file exists
if (fs.existsSync(PID_FILE)) {
  const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
  if (oldPid && oldPid !== process.pid) {
    try {
      process.kill(oldPid, 'SIGTERM');
      console.log(`Stopped previous instance with PID: ${oldPid}`);
      // Wait a bit for the previous instance to release the port and bot polling
      const start = Date.now();
      while (Date.now() - start < 2000) { /* sync wait for release */ }
    } catch (e) {
      // Process might already be dead
    }
  }
}
fs.writeFileSync(PID_FILE, process.pid.toString());

const server = app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
});

const shutdown = async () => {
  console.log('Shutdown signal received: closing HTTP server and bot');
  await stopBot();
  server.close(() => {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    console.log('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
