import TelegramBot from 'node-telegram-bot-api';
import { redis } from '../utils/redis';
import { prisma } from '../utils/db';
import { generateContent } from '../services/ai.service';
import { publishQueue, publishWorker } from '../queues/publish.queue';

if (bot) {
  publishWorker.on('completed', (job) => {
    const { chatId, platform } = job.data;
    if (chatId) {
      bot.sendMessage(chatId, `🚀 SUCCESS! Your post has been published to ${platform}.`);
    }
  });

  publishWorker.on('failed', (job, err) => {
    if (job) {
      const { chatId, platform } = job.data;
      if (chatId) {
        bot.sendMessage(chatId, `❌ FAILED! Could not publish to ${platform}: ${err.message}`);
      }
    }
  });
}

const token = process.env.TELEGRAM_BOT_TOKEN || '';

export const bot = token ? new TelegramBot(token, { 
  polling: {
    autoStart: true,
    params: { timeout: 10 }
  } 
}) : null;

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

if (bot) {
  bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
    const chatId = msg.chat.id;
    await redis.set(`chat:${chatId}:state`, 'AWAITING_POST_TYPE', 'EX', 1800);
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
    bot.sendMessage(msg.chat.id, "Available commands:\n/start - Start a new post\n/status - Check last 5 posts\n/accounts - List linked accounts\n/help - Show this message");
  });

  bot.on('callback_query', async (query: TelegramBot.CallbackQuery) => {
    if (!query.message) return;
    const chatId = query.message.chat.id;
    const data = query.data || '';

    if (data.startsWith('type_')) {
      const type = data.split('_')[1];
      await redis.set(`chat:${chatId}:post_type`, type, 'EX', 1800);
      await redis.set(`chat:${chatId}:state`, 'AWAITING_PLATFORMS', 'EX', 1800);

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
        await redis.set(`chat:${chatId}:state`, 'AWAITING_TONE', 'EX', 1800);
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
        const existing = await redis.get(`chat:${chatId}:platforms`) || '';
        const pl = existing ? existing.split(',') : [];
        if (!pl.includes(plat)) pl.push(plat);
        await redis.set(`chat:${chatId}:platforms`, pl.join(','), 'EX', 1800);
        bot.answerCallbackQuery(query.id, { text: `Added ${plat}` });
      }
    } else if (data.startsWith('tone_')) {
      const tone = data.split('_')[1];
      await redis.set(`chat:${chatId}:tone`, tone, 'EX', 1800);
      await redis.set(`chat:${chatId}:state`, 'AWAITING_MODEL', 'EX', 1800);

      bot.sendMessage(chatId, "Which AI model do you want to use?", {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Gemini (Google)', callback_data: 'mod_gemini' }]
          ]
        }
      });
    } else if (data.startsWith('mod_')) {
      const mod = data.split('_')[1];
      await redis.set(`chat:${chatId}:model`, mod, 'EX', 1800);
      await redis.set(`chat:${chatId}:state`, 'AWAITING_IDEA', 'EX', 1800);

      bot.sendMessage(chatId, "Tell me the idea or core message — keep it brief.");
    } else if (data === 'action_post') {
      let user = await prisma.user.findFirst();
      if (!user) {
        user = await prisma.user.create({ data: { email: 'botuser@test.com', password_hash: 'xyz', name: 'Bot User' } });
      }

      const idea = await redis.get(`chat:${chatId}:idea`) || '';
      const post_type = await redis.get(`chat:${chatId}:post_type`) || 'announcement';
      const tone = await redis.get(`chat:${chatId}:tone`) || 'professional';
      const model = await redis.get(`chat:${chatId}:model`) || 'gemini';
      const platformsStr = await redis.get(`chat:${chatId}:platforms`) || 'twitter';
      const platforms = platformsStr.split(',');
      const previewRaw = await redis.get(`chat:${chatId}:preview`);
      const generated_content = previewRaw ? JSON.parse(previewRaw) : {};

      const post = await prisma.post.create({
        data: {
          user_id: user.id,
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
        await publishQueue.add('publish', { platformPostId: pPost.id, platform, userId: user.id, chatId }, {
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
    const currentState = await redis.get(`chat:${chatId}:state`);

    if (currentState === 'AWAITING_IDEA') {
      await redis.set(`chat:${chatId}:idea`, msg.text, 'EX', 1800);
      bot.sendMessage(chatId, "Generating your content using Gemini... ⚙️");

      try {
        let user = await prisma.user.findFirst();
        if (!user) {
          user = await prisma.user.create({ data: { email: 'botuser@test.com', password_hash: 'xyz', name: 'Bot User' } });
        }
        const userId = user.id;

        const post_type = await redis.get(`chat:${chatId}:post_type`) || 'announcement';
        const platformsStr = await redis.get(`chat:${chatId}:platforms`) || 'twitter';
        const platforms = platformsStr.split(',');
        const tone = await redis.get(`chat:${chatId}:tone`) || 'professional';
        const model = await redis.get(`chat:${chatId}:model`) || 'gemini';

        const content = await generateContent(userId, msg.text, platforms, tone, 'English', model);

        // Save preview for confirmation
        await redis.set(`chat:${chatId}:preview`, JSON.stringify(content.generated), 'EX', 1800);

        bot.sendMessage(chatId, `Preview:\n\n${content.generated.twitter?.content || ''}\n\nConfirm and post?`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Yes, Post Now', callback_data: 'action_post' }],
              [{ text: '❌ Cancel', callback_data: 'action_cancel' }]
            ]
          }
        });
        await redis.set(`chat:${chatId}:state`, 'AWAITING_CONFIRMATION', 'EX', 1800);
      } catch (err: any) {
        bot.sendMessage(chatId, `Error generating content: ${err.message}`);
      }
    }
  });
}

// Handle unexpected shutdowns
process.once('SIGINT', () => stopBot());
process.once('SIGTERM', () => stopBot());
