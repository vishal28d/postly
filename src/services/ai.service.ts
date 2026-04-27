import { GoogleGenerativeAI } from '@google/generative-ai';
import { decrypt } from '../utils/crypto';
import { prisma } from '../utils/db';

const getGeminiClient = async (userId: string): Promise<GoogleGenerativeAI> => {
  const aiKeys = await prisma.aIKey.findUnique({ where: { user_id: userId } });
  let apiKey = process.env.GEMINI_API_KEY;
  if (aiKeys?.gemini_key_enc) {
    apiKey = decrypt(aiKeys.gemini_key_enc);
  }
  if (!apiKey) throw new Error('Gemini API key not configured');
  return new GoogleGenerativeAI(apiKey);
};

const constructPrompt = (platform: string, idea: string, tone: string, language: string) => {
  let platformRules = '';
  if (platform === 'twitter') {
    platformRules = 'Max 280 characters. Include 2-3 relevant hashtags. Must have a punchy opener.';
  } else {
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
  
  if (model === 'gemini') {
    const genAI = await getGeminiClient(userId);
    const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    for (const platform of platforms) {
      if (platform !== 'twitter') continue; // Enforce Twitter only
      const prompt = constructPrompt(platform, idea, tone, language);
      const response = await geminiModel.generateContent(prompt);
      results[platform] = { content: response.response.text() };
    }
  } else {
    throw new Error('Unsupported AI model');
  }

  return {
    generated: results,
    model_used: model,
  };
};
