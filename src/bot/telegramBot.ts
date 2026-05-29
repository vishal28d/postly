import TelegramBot from 'node-telegram-bot-api';
import { redis } from '../utils/redis';
import { prisma } from '../utils/db';
import { generateContent } from '../services/ai.service';
import { publishQueue, publishWorker } from '../queues/publish.queue';
import { randomUUID } from 'crypto';

const token = process.env.TELEGRAM_BOT_TOKEN || '';

export const bot = token ? new TelegramBot(token, { 
  polling: {
    autoStart: true,
    params: { timeout: 10 }
  } 
}) : null;

// Queue listeners - only attach if bot exists
if (bot) {
  publishWorker.on('completed', (job) => {
    const { chatId, platform } = job.data;
    if (chatId) {
      bot.sendMessage(chatId, `SUCCESS! Your post has been published to ${platform}.`);
    }
  });

  publishWorker.on('failed', (job, err) => {
    if (job) {
      const { chatId, platform } = job.data;
      if (chatId) {
        bot.sendMessage(chatId, `FAILED! Could not publish to ${platform}: ${err.message}`);
      }
    }
  });
}

if (bot) {
  bot.on('polling_error', (error: any) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
      console.warn('Telegram bot conflict detected. Another instance is likely running. Retrying in 5s...');
      bot.stopPolling();
      setTimeout(() => bot.startPolling(), 5000);
    } else {
      console.error('Telegram polling error:', error.message);
    }
  });
}

export const stopBot = async () => {
  if (bot && bot.isPolling()) {
    await bot.stopPolling();
    console.log('Telegram bot polling stopped');
  }
};

// Store pending verifications (in production, use Redis with expiration)
const pendingVerifications = new Map<string, { chatId: string; expires: number }>();

if (bot) {
  bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    
    // Check if user is linked
    const userId = await redis.get<string>(`telegram:${chatId}:userId`);
    if (!userId) {
      return bot.sendMessage(chatId, 
        "Hey 👋 Welcome to Postly Bot!\n\nYou need to link your account first. Use /link to connect your Postly account to this bot.",
        {
          reply_markup: {
            inline_keyboard: [[{ text: 'Link Account', callback_data: 'link_start' }]]
          }
        }
      );
    }
    
    await redis.set(`chat:${chatId}:state`, 'AWAITING_POST_TYPE', { ex: 1800 });
    bot.sendMessage(chatId, "Hey 👋 What type of post is this?", {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Announcement', callback_data: 'type_announcement' }, { text: 'Thread', callback_data: 'type_thread' }],
          [{ text: 'Story', callback_data: 'type_story' }, { text: 'Promotional', callback_data: 'type_promotional' }],
          [{ text: 'Educational', callback_data: 'type_educational' }, { text: 'Opinion', callback_data: 'type_opinion' }]
        ]
      }
    });
  });

  bot.onText(/\/help/, (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Available commands:\n/start - Start a new post\n/status - Check last 5 posts\n/accounts - List linked accounts\n/link - Link your Postly account\n/posts - Show your recent posts\n/help - Show this message");
  });

  bot.onText(/\/link/, async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    
    // Check if already linked
    const existingUserId = await redis.get<string>(`telegram:${chatId}:userId`);
    if (existingUserId) {
      return bot.sendMessage(chatId, 
        'You are already linked to an account. Use /unlink to disconnect first if you want to link a different account.'
      );
    }
    
    // Generate verification token
    const verificationId = randomUUID();
    const verificationData = { chatId: chatId.toString() };
    
    // Store verification with 5 minute expiration
    pendingVerifications.set(verificationId, {
      chatId: chatId.toString(),
      expires: Date.now() + 300000 // 5 minutes
    });
    
    // Clean up old verifications periodically
    const now = Date.now();
    for (const [id, verification] of pendingVerifications.entries()) {
      if (verification.expires < now) {
        pendingVerifications.delete(id);
      }
    }
    
    const linkUrl = `${process.env.WEB_URL || 'https://postly-knzw.onrender.com'}/auth/telegram-link?token=${verificationId}&chatId=${chatId}`;
    
    bot.sendMessage(chatId, 
      `To link your Telegram account to Postly:\n\n1. Visit: ${linkUrl}\n2. Log in to your Postly account\n3. Authorize this bot\n\nLink expires in 5 minutes.`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: 'Open Link', url: linkUrl }]]
        }
      }
    );
  });

  bot.onText(/\/unlink/, async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    await redis.del(`telegram:${chatId}:userId`);
    bot.sendMessage(chatId, 'Your Telegram account has been unlinked from Postly.');
  });

  bot.onText(/\/posts/, async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    
    // Get userId from Redis/storage
    const userId = await redis.get<string>(`telegram:${chatId}:userId`);
    if (!userId) {
      return bot.sendMessage(chatId, 
        'You are not linked to any account. Use /link to connect your account first.'
      );
    }
    
    // Fetch user's posts
    const posts = await prisma.post.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 5
    });
    
    if (posts.length === 0) {
      return bot.sendMessage(chatId, 'You have no posts yet.');
    }
    
    const postsText = posts.map((p, i) => {
      const statusEmoji = p.status === 'published' ? '✅' : p.status === 'processing' ? '⏳' : '❌';
      return `${i+1}. ${statusEmoji} [${p.status}] ${p.idea.substring(0, 40)}${p.idea.length > 40 ? '...' : ''}`;
    }).join('\n');
    
    bot.sendMessage(chatId, `Your recent posts:\n\n${postsText}\n\nUse /status for more details.`);
  });

  bot.onText(/\/status/, async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    
    // Get userId from Redis/storage
    const userId = await redis.get<string>(`telegram:${chatId}:userId`);
    if (!userId) {
      return bot.sendMessage(chatId, 
        'You are not linked to any account. Use /link to connect your account first.'
      );
    }
    
    // Fetch user's recent posts with more detail
    const posts = await prisma.post.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 5,
      include: {
        platform_posts: {
          take: 1,
          orderBy: { id: 'desc' }
        }
      }
    });
    
    if (posts.length === 0) {
      return bot.sendMessage(chatId, 'You have no posts yet.');
    }
    
    let statusText = 'Your recent posts:\n\n';
    posts.forEach((p, i) => {
      const statusEmoji = p.status === 'published' ? '✅' : p.status === 'processing' ? '⏳' : p.status === 'failed' ? '❌' : '📝';
      const date = p.created_at?.toLocaleString() ?? 'Unknown';
      statusText += `${i+1}. ${statusEmoji} ${p.idea}\n`;
      statusText += `   Status: ${p.status} | Created: ${date}\n`;
      
      if (p.platform_posts.length > 0) {
        const platformPost = p.platform_posts[0];
        const platEmoji = platformPost.platform === 'twitter' ? '🐦' : '📱';
        statusText += `   Platform: ${platEmoji} ${platformPost.platform} | ${platformPost.status}\n`;
      }
      statusText += '\n';
    });
    
    bot.sendMessage(chatId, statusText);
  });

  bot.on('callback_query', async (query: TelegramBot.CallbackQuery) => {
    if (!query.message) return;
    const chatId = query.message.chat.id;
    const data = query.data || '';
    
    // Handle link start callback
    if (data === 'link_start') {
      return bot.answerCallbackQuery(query.id, {
        text: 'Use /link command to start the account linking process',
        show_alert: true
      });
    }
    
    if (data.startsWith('type_')) {
      const type = data.split('_')[1];
      await redis.set(`chat:${chatId}:post_type`, type, { ex: 1800 });
      await redis.set(`chat:${chatId}:state`, 'AWAITING_PLATFORMS', { ex: 1800 });
      
      bot.sendMessage(chatId, "Which platforms should I post to?", {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Twitter/X', callback_data: 'plat_twitter' }],
            [{ text: 'Done selecting platforms', callback_data: 'plat_done' }]
          ]
        }
      });
    } else if (data.startsWith('plat_')) {
      const plat = data.split('_')[1];
      if (plat === 'done') {
        await redis.set(`chat:${chatId}:state`, 'AWAITING_TONE', { ex: 1800 });
        bot.sendMessage(chatId, "What tone should the content have?", {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Professional', callback_data: 'tone_professional' }, { text: 'Casual', callback_data: 'tone_casual' }],
              [{ text: 'Witty', callback_data: 'tone_witty' }, { text: 'Authoritative', callback_data: 'tone_authoritative' }],
              [{ text: 'Friendly', callback_data: 'tone_friendly' }]
            ]
          }
        });
      } else {
        const existingRaw = await redis.get<string>(`chat:${chatId}:platforms`);
        const existing = existingRaw ?? '';
        const pl = existing ? existing.split(',') : [];
        if (!pl.includes(plat)) pl.push(plat);
        await redis.set(`chat:${chatId}:platforms`, pl.join(','), { ex: 1800 });
        bot.answerCallbackQuery(query.id, { text: `Added ${plat}` });
      }
    } else if (data.startsWith('tone_')) {
      const tone = data.split('_')[1];
      await redis.set(`chat:${chatId}:tone`, tone, { ex: 1800 });
      await redis.set(`chat:${chatId}:state`, 'AWAITING_MODEL', { ex: 1800 });
      
      bot.sendMessage(chatId, "Which AI model do you want to use?", {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Gemini (Google)', callback_data: 'mod_gemini' }]
          ]
        }
      });
    } else if (data.startsWith('mod_')) {
      const mod = data.split('_')[1];
      await redis.set(`chat:${chatId}:model`, mod, { ex: 1800 });
      await redis.set(`chat:${chatId}:state`, 'AWAITING_IDEA', { ex: 1800 });
      
      bot.sendMessage(chatId, "Tell me the idea or core message — keep it brief.");
    } else if (data === 'action_post') {
      // Check authentication before allowing post creation
      const userId = await redis.get<string>(`telegram:${chatId}:userId`);
      if (!userId) {
        return bot.sendMessage(chatId, 
          'Please link your account first using /link'
        );
      }
      
      const ideaRaw = await redis.get<string>(`chat:${chatId}:idea`);
      const idea = ideaRaw ?? '';
      const post_typeRaw = await redis.get<string>(`chat:${chatId}:post_type`);
      const post_type = post_typeRaw ?? 'announcement';
      const toneRaw = await redis.get<string>(`chat:${chatId}:tone`);
      const tone = toneRaw ?? 'professional';
      const modelRaw = await redis.get<string>(`chat:${chatId}:model`);
      const model = modelRaw ?? 'gemini';
      const platformsStrRaw = await redis.get<string>(`chat:${chatId}:platforms`);
      const platformsStr = platformsStrRaw ?? 'twitter';
      const platforms = platformsStr.split(',');
      const previewRaw = await redis.get<string>(`chat:${chatId}:preview`);
      let generated_content: Record<string, any> = {};
      if (typeof previewRaw === 'string') {
        try {
          generated_content = JSON.parse(previewRaw);
        } catch (e) {
          generated_content = {};
        }
      }
      
      const post = await prisma.post.create({
        data: {
          user_id: userId, // Use authenticated userId instead of findFirst()
          idea,
          post_type,
          tone,
          language: 'English',
          model_used: model,
          status: 'processing',
          publish_at: new Date()
        }
      });
      
      for (const platform of platforms) {
        if (platform !== 'twitter') continue;
        const pPost = await prisma.platformPost.create({
          data: {
            post_id: post.id,
            platform,
            content: generated_content[platform]?.content || '',
            status: 'queued'
          }
        });
        await publishQueue.add('publish', { platformPostId: pPost.id, platform, userId: userId, chatId }, {
          attempts: 3, backoff: { type: 'exponential', delay: 1000 }
        });
      }
      
      bot.sendMessage(chatId, "✅ Post has been queued for publishing!");
      await redis.del(`chat:${chatId}:state`);
    } else if (data === 'action_cancel') {
      bot.sendMessage(chatId, "❌ Post cancelled.");
      await redis.del(`chat:${chatId}:state`);
    }
  });
  
  bot.on('message', async (msg: TelegramBot.Message) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const currentState = await redis.get<string>(`chat:${chatId}:state`);
    
    // Check authentication for all bot operations
    const userId = await redis.get<string>(`telegram:${chatId}:userId`);
    if (!userId) {
      return bot.sendMessage(chatId, 
        'Please link your account first using /link'
      );
    }
    
    if (currentState === 'AWAITING_IDEA') {
      await redis.set(`chat:${chatId}:idea`, msg.text, { ex: 1800 });
      bot.sendMessage(chatId, "Generating your content using Gemini... ⚙️");
      
      try {
        // Use authenticated userId
        const post_typeRaw = await redis.get<string>(`chat:${chatId}:post_type`);
        const post_type = post_typeRaw ?? 'announcement';
        const platformsStrRaw = await redis.get<string>(`chat:${chatId}:platforms`);
        const platformsStr = platformsStrRaw ?? 'twitter';
        const platforms = platformsStr.split(',');
        const toneRaw = await redis.get<string>(`chat:${chatId}:tone`);
        const tone = toneRaw ?? 'professional';
        const modelRaw = await redis.get<string>(`chat:${chatId}:model`);
        const model = modelRaw ?? 'gemini';
        
        const content = await generateContent(userId, msg.text, platforms, tone, 'English', model);
        
        // Save preview for confirmation
        await redis.set(`chat:${chatId}:preview`, JSON.stringify(content.generated), { ex: 1800 });
        
        bot.sendMessage(chatId, `Preview:\n\n${content.generated.twitter?.content || ''}\n\nConfirm and post?`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Yes, Post Now', callback_data: 'action_post' }],
              [{ text: '❌ Cancel', callback_data: 'action_cancel' }]
            ]
          }
        });
        await redis.set(`chat:${chatId}:state`, 'AWAITING_CONFIRMATION', { ex: 1800 });
      } catch (err: any) {
        bot.sendMessage(chatId, `Error generating content: ${err.message}`);
      }
    }
  });
}

// Handle unexpected shutdowns
process.once('SIGINT', () => stopBot());
process.once('SIGTERM', () => stopBot());