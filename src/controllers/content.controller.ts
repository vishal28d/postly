import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { generateContent } from '../services/ai.service';
import { z } from 'zod';

const generateSchema = z.object({
  idea: z.string().max(500),
  post_type: z.enum(['announcement', 'thread', 'story', 'promotional', 'educational', 'opinion']),
  platforms: z.array(z.enum(['twitter'])),
  tone: z.enum(['professional', 'casual', 'witty', 'authoritative', 'friendly']),
  language: z.string(),
  model: z.enum(['gemini'])
});

export const generate = async (req: AuthRequest, res: Response) => {
  try {
    const { idea, post_type, platforms, tone, language, model } = generateSchema.parse(req.body);
    
    // We pass idea and tone, post_type can be appended to idea to guide the model further
    const enhancedIdea = `Type: ${post_type}. ${idea}`;
    
    const result = await generateContent(req.user!.id, enhancedIdea, platforms, tone, language, model);
    
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: (error as any).errors });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
