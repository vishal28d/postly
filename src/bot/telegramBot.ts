import TelegramBot from 'node-telegram-bot-api';
import { redis } from '../utils/redis';

const token = process.env.TELEGRAM_BOT_TOKEN || '';

export const bot = token ? new TelegramBot(token, { webHook: true }) : null;

if (bot) {
  bot.onText(/\/start/, async (msg) => {
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

  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, "Available commands:\n/start - Start a new post\n/status - Check last 5 posts\n/accounts - List linked accounts\n/help - Show this message");
  });

  bot.on('callback_query', async (query) => {
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
    }
  });

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const currentState = await redis.get(`chat:${chatId}:state`);
    
    if (currentState === 'AWAITING_IDEA') {
      await redis.set(`chat:${chatId}:idea`, msg.text, 'EX', 1800);
      bot.sendMessage(chatId, "Generating your content... ⚙️");
      
      bot.sendMessage(chatId, "Preview:\n(Generated Content Here)\n\nConfirm and post?", {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Yes, Post Now ✅', callback_data: 'action_post' }],
            [{ text: 'Cancel ❌', callback_data: 'action_cancel' }]
          ]
        }
      });
      await redis.set(`chat:${chatId}:state`, 'AWAITING_CONFIRMATION', 'EX', 1800);
    }
  });
}
