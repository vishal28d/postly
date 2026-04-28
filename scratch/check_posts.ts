import { prisma } from '../src/utils/db';
import dotenv from 'dotenv';
dotenv.config();

const checkPosts = async () => {
  try {
    const platformPosts = await prisma.platformPost.findMany({
      take: 10
    });
    console.log(`Last 10 platform posts:`);
    platformPosts.forEach(p => {
      console.log(`ID: ${p.id}, Platform: ${p.platform}, Status: ${p.status}, Error: ${p.error_message || 'none'}`);
    });

    const posts = await prisma.post.findMany({
      orderBy: { created_at: 'desc' },
      take: 5
    });
    console.log(`\nLast 5 posts:`);
    posts.forEach(p => {
      console.log(`ID: ${p.id}, Idea: ${p.idea}, Status: ${p.status}`);
    });
  } catch (e: any) {
    console.error("Check failed:", e.message);
  } finally {
    await prisma.$disconnect();
  }
};

checkPosts();
