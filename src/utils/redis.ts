import { Redis as UpstashRedis } from '@upstash/redis';
import Redis from 'ioredis';

// Upstash HTTP Client (for Bot state, etc.)
export const redis = new UpstashRedis({
  url: process.env.REDIS_URL || '',
  token: process.env.REDIS_TOKEN || '',
});

// ioredis Client (for BullMQ)
// BullMQ requires a persistent TCP connection.
// Note: The Upstash token provided in REDIS_TOKEN failed to authenticate over TCP (WRONGPASS).
// We are falling back to local Redis for BullMQ.
// To use Upstash for BullMQ, please provide a valid TCP URL in REDIS_TCP_URL (e.g., rediss://default:PASSWORD@endpoint:36379).
const redisTcpUrl = process.env.REDIS_TCP_URL || 'redis://localhost:6379';

console.log(`BullMQ connecting to: ${redisTcpUrl.replace(/:[^:]*@/, ':****@')}`);

export const bullMqConnection = new Redis(redisTcpUrl, { maxRetriesPerRequest: null });
