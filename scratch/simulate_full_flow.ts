import { prisma } from '../src/utils/db';
import { generateContent } from '../src/services/ai.service';
import { publishQueue } from '../src/queues/publish.queue';
import dotenv from 'dotenv';
dotenv.config();

const simulate = async () => {
  try {
    console.log("--- 1. Generating Content via NVIDIA NIM ---");
    // Ensure a user exists
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({ data: { email: 'sim@test.com', password_hash: 'xyz', name: 'Simulation User' } });
    }

    const idea = "Postly is the ultimate tool for social media automation!";
    const result = await generateContent(user.id, idea, ["twitter"], "excited", "English", "nvidia");
    console.log("Generated Content:", result.generated.twitter.content);

    console.log("\n--- 2. Creating Post in Database ---");
    const post = await prisma.post.create({
      data: {
        user_id: user.id,
        idea,
        post_type: 'automation',
        tone: 'excited',
        language: 'English',
        model_used: 'nvidia-gemma',
        status: 'processing',
        publish_at: new Date()
      }
    });

    console.log("\n--- 3. Queueing for Publication ---");
    const pPost = await prisma.platformPost.create({
      data: {
        post_id: post.id,
        platform: 'twitter',
        content: result.generated.twitter.content,
        status: 'queued'
      }
    });

    // We add a dummy chatId to see if it triggers the log (it won't send a real TG msg here but will log completion)
    await publishQueue.add('publish', { 
      platformPostId: pPost.id, 
      platform: 'twitter', 
      userId: user.id,
      chatId: 123456789 
    });

    console.log("Job added to queue. Checking worker status...");
    
    // Wait for worker to pick it up (assuming dev server is running)
    console.log("Waiting 5 seconds for worker to process...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    const finalPost = await prisma.platformPost.findUnique({ where: { id: pPost.id } });
    console.log("\n--- 4. Final Status ---");
    console.log(`Status: ${finalPost?.status}`);
    if (finalPost?.status === 'published') {
      console.log("✅ Simulation SUCCESSFUL!");
    } else {
      console.log(`❌ Simulation FAILED: ${finalPost?.error_message || 'unknown error'}`);
    }

  } catch (err: any) {
    console.error("Simulation Error:", err.message);
  } finally {
    await prisma.$disconnect();
    // We don't close redis/queue here as it might be shared, but in a script we should
    process.exit(0);
  }
};

simulate();
