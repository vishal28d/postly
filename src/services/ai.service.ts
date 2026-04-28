import https from 'https';
import { decrypt } from '../utils/crypto';
import { prisma } from '../utils/db';

const callNvidiaNim = async (prompt: string): Promise<string> => {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA API key not configured');
  
  const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";

  const payload = JSON.stringify({
    "model": "google/gemma-3-27b-it",
    "messages": [{ "role": "user", "content": prompt }],
    "max_tokens": 16384,
    "temperature": 0.7,
    "top_p": 0.95,
    "stream": false,
    "chat_template_kwargs": {"enable_thinking":true}
  });

  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const req = https.request(invokeUrl, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            resolve(json.choices[0].message.content);
          } catch (e) {
            reject(new Error('Failed to parse NVIDIA response'));
          }
        } else {
          reject(new Error(`NVIDIA API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`HTTPS Request Error: ${err.message}`)));
    req.write(payload);
    req.end();
  });
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
  
  // We now use NVIDIA NIM for all requests as requested
  for (const platform of platforms) {
    if (platform !== 'twitter') continue; // Enforce Twitter only as per original logic
    const prompt = constructPrompt(platform, idea, tone, language);
    const content = await callNvidiaNim(prompt);
    results[platform] = { content };
  }

  return {
    generated: results,
    model_used: 'nvidia-gemma',
  };
};
