import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../utils/redis';
import { prisma } from '../utils/db';
import { decrypt } from '../utils/crypto';

export const publishQueue = new Queue('publishQueue', { connection: redis });

export const publishWorker = new Worker('publishQueue', async (job: Job) => {
  const { platformPostId, platform, userId } = job.data;
  
  await prisma.platformPost.update({
    where: { id: platformPostId },
    data: { status: 'processing', attempts: { increment: 1 } }
  });
  
  const socialAccount = await prisma.socialAccount.findFirst({
    where: { user_id: userId, platform }
  });
  
  if (!socialAccount) {
    throw new Error(`Social account for ${platform} not connected.`);
  }

  const accessToken = decrypt(socialAccount.access_token_enc);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  if (Math.random() < 0.1) {
    throw new Error(`Simulated API failure for ${platform}`);
  }

  await prisma.platformPost.update({
    where: { id: platformPostId },
    data: { status: 'published', published_at: new Date() }
  });

  const pPost = await prisma.platformPost.findUnique({ where: { id: platformPostId } });
  if (pPost) {
    const all = await prisma.platformPost.findMany({ where: { post_id: pPost.post_id } });
    const pending = all.filter(p => p.status === 'queued' || p.status === 'processing');
    if (pending.length === 0) {
      await prisma.post.update({
        where: { id: pPost.post_id },
        data: { status: 'published' }
      });
    }
  }

}, {
  connection: redis,
  concurrency: 5,
});

publishWorker.on('failed', async (job, err) => {
  if (job) {
    const { platformPostId } = job.data;
    await prisma.platformPost.update({
      where: { id: platformPostId },
      data: { status: 'failed', error_message: err.message }
    });
  }
});
