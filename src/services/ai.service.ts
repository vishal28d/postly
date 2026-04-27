import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { decrypt } from '../utils/crypto';
import { prisma } from '../utils/db';

const getOpenAIClient = async (userId: string): Promise<OpenAI> => {
  const aiKeys = await prisma.aIKey.findUnique({ where: { user_id: userId } });
  let apiKey = process.env.OPENAI_API_KEY;
  if (aiKeys?.openai_key_enc) {
    apiKey = decrypt(aiKeys.openai_key_enc);
  }
  if (!apiKey) throw new Error('OpenAI API key not configured');
  return new OpenAI({ apiKey });
};

const getAnthropicClient = async (userId: string): Promise<Anthropic> => {
  const aiKeys = await prisma.aIKey.findUnique({ where: { user_id: userId } });
  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (aiKeys?.anthropic_key_enc) {
    apiKey = decrypt(aiKeys.anthropic_key_enc);
  }
  if (!apiKey) throw new Error('Anthropic API key not configured');
  return new Anthropic({ apiKey });
};

const constructPrompt = (platform: string, idea: string, tone: string, language: string) => {
  let platformRules = '';
  switch (platform) {
    case 'twitter':
      platformRules = 'Max 280 characters. Include 2-3 relevant hashtags. Must have a punchy opener.';
      break;
    case 'linkedin':
      platformRules = '800-1300 characters. Professional tone (regardless of base tone). 3-5 hashtags. Use line breaks for readability.';
      break;
    case 'instagram':
      platformRules = 'Caption style. Emoji-friendly. Include 10-15 hashtags at the end.';
      break;
    case 'threads':
      platformRules = 'Max 500 characters. Conversational and engaging.';
      break;
    default:
      platformRules = 'Standard social media post.';
  }

  return `Generate a ${platform} post based on this idea: "${idea}".
Tone: ${tone}
Language: ${language}
Platform Constraints: ${platformRules}

Provide only the content. Do not wrap in quotes or add preamble.`;
};

export const generateContent = async (userId: string, idea: string, platforms: string[], tone: string, language: string, model: string) => {
  const results: any = {};
  
  if (model === 'openai') {
    const openai = await getOpenAIClient(userId);
    for (const platform of platforms) {
      const prompt = constructPrompt(platform, idea, tone, language);
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: prompt }]
      });
      results[platform] = { content: response.choices[0].message.content };
    }
  } else if (model === 'anthropic') {
    const anthropic = await getAnthropicClient(userId);
    for (const platform of platforms) {
      const prompt = constructPrompt(platform, idea, tone, language);
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      });
      // @ts-ignore
      results[platform] = { content: response.content[0].text };
    }
  } else {
    throw new Error('Unsupported AI model');
  }

  return {
    generated: results,
    model_used: model,
  };
};
