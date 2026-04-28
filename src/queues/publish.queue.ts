import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../utils/redis';
import { prisma } from '../utils/db';
import { decrypt } from '../utils/crypto';
import { TwitterApi } from 'twitter-api-v2';

export const publishQueue = new Queue('publishQueue', { connection: redis });

export const publishWorker = new Worker('publishQueue', async (job: Job) => {
  const { platformPostId, platform, userId } = job.data;
  console.log(`Worker: Processing job ${job.id} for platform ${platform}`);
  
  await prisma.platformPost.update({
    where: { id: platformPostId },
    data: { status: 'processing', attempts: { increment: 1 } }
  });
  
  const pPost = await prisma.platformPost.findUnique({ where: { id: platformPostId } });
  if (!pPost || !pPost.content) {
    throw new Error('Post content not found');
  }

  if (platform === 'twitter') {
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_SECRET;

    if (!accessToken || !accessSecret) {
      console.warn('Worker: Missing Twitter access tokens. Simulating success...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      const client = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY || '',
        appSecret: process.env.TWITTER_API_SECRET || '',
        accessToken,
        accessSecret,
      });
      
      console.log('Worker: Posting to Twitter...');
      await client.v2.tweet(pPost.content);
      console.log('Worker: Posted to Twitter successfully');
    }
  } else {
    // Simulated delay for non-Twitter platforms
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await prisma.platformPost.update({
    where: { id: platformPostId },
    data: { status: 'published', published_at: new Date() }
  });

  if (pPost) {
    const all = await prisma.platformPost.findMany({ where: { post_id: pPost.post_id } });
    const pending = all.filter((p: any) => p.status === 'queued' || p.status === 'processing');
    if (pending.length === 0) {
      await prisma.post.update({
        where: { id: pPost.post_id },
        data: { status: 'published' }
      });
    }
  }
  console.log(`Worker: Job ${job.id} completed successfully`);
}, {
  connection: redis,
  concurrency: 5,
});

publishWorker.on('failed', async (job: Job | undefined, err: Error) => {
  if (job) {
    const { platformPostId } = job.data;
    await prisma.platformPost.update({
      where: { id: platformPostId },
      data: { status: 'failed', error_message: err.message }
    });
  }
});
