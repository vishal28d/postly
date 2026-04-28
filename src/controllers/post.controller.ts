import { Response } from 'express';
import { prisma } from '../utils/db';
import { AuthRequest } from '../middlewares/auth.middleware';
import { publishQueue } from '../queues/publish.queue';

export const publishPost = async (req: AuthRequest, res: Response) => {
  try {
    const { idea, post_type, tone, language, model_used, platforms, generated_content } = req.body;
    
    const post = await prisma.post.create({
      data: {
        user_id: req.user!.id,
        idea,
        post_type,
        tone,
        language,
        model_used,
        status: 'processing',
        publish_at: new Date()
      }
    });

    for (const platform of platforms) {
      const pPost = await prisma.platformPost.create({
        data: {
          post_id: post.id,
          platform,
          content: generated_content[platform]?.content || '',
          status: 'queued'
        }
      });
      
      await publishQueue.add('publish', {
        platformPostId: pPost.id,
        platform,
        userId: req.user!.id
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
      });
    }

    return res.status(200).json({ message: 'Post queued for publishing', id: post.id });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const schedulePost = async (req: AuthRequest, res: Response) => {
  try {
    const { idea, post_type, tone, language, model_used, platforms, generated_content, publish_at } = req.body;
    
    const delay = new Date(publish_at).getTime() - Date.now();
    if (delay < 0) return res.status(400).json({ error: 'publish_at must be in the future' });

    const post = await prisma.post.create({
      data: {
        user_id: req.user!.id,
        idea,
        post_type,
        tone,
        language,
        model_used,
        status: 'queued',
        publish_at: new Date(publish_at)
      }
    });

    for (const platform of platforms) {
      const pPost = await prisma.platformPost.create({
        data: {
          post_id: post.id,
          platform,
          content: generated_content[platform]?.content || '',
          status: 'queued'
        }
      });
      
      await publishQueue.add('publish', {
        platformPostId: pPost.id,
        platform,
        userId: req.user!.id
      }, {
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
      });
    }

    return res.status(200).json({ message: 'Post scheduled', id: post.id });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const retryPost = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string; // Post ID
    const failedPlatformPosts = await prisma.platformPost.findMany({
      where: { post_id: id, status: 'failed' }
    });
    
    for (const pPost of failedPlatformPosts) {
      await prisma.platformPost.update({
        where: { id: pPost.id },
        data: { status: 'queued', error_message: null }
      });
      await publishQueue.add('publish', {
        platformPostId: pPost.id,
        platform: pPost.platform,
        userId: req.user!.id
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
      });
    }
    
    return res.status(200).json({ message: `Retrying ${failedPlatformPosts.length} failed jobs` });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const deletePost = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.post.update({
      where: { id },
      data: { status: 'cancelled' }
    });
    await prisma.platformPost.updateMany({
      where: { post_id: id, status: 'queued' },
      data: { status: 'cancelled' }
    });
    return res.status(200).json({ message: 'Post cancelled' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getPosts = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const skip = (page - 1) * limit;

    const where: any = { user_id: req.user!.id };
    if (status) where.status = status;

    const posts = await prisma.post.findMany({
      where,
      skip,
      take: limit,
      include: { platform_posts: true },
      orderBy: { created_at: 'desc' }
    });

    const total = await prisma.post.count({ where });

    return res.status(200).json({ data: posts, meta: { total, page, limit } });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getPost = async (req: AuthRequest, res: Response) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id as string },
      include: { platform_posts: true }
    });
    if (!post || post.user_id !== req.user!.id) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.status(200).json({ data: post });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const totalPosts = await prisma.post.count({ where: { user_id: req.user!.id } });
    
    const pPosts = await prisma.platformPost.findMany({
      where: { post: { user_id: req.user!.id } }
    });
    
    const published = pPosts.filter((p: any) => p.status === 'published').length;
    const failed = pPosts.filter((p: any) => p.status === 'failed').length;
    
    const successRate = (published / (published + failed || 1)) * 100;
    
    const perPlatform = pPosts.reduce((acc: any, p: any) => {
      acc[p.platform] = (acc[p.platform] || 0) + 1;
      return acc;
    }, {});
    
    return res.status(200).json({
      data: {
        total_posts: totalPosts,
        success_rate: successRate,
        posts_per_platform: perPlatform
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
