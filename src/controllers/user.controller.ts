import { Response } from 'express';
import { prisma } from '../utils/db';
import { AuthRequest } from '../middlewares/auth.middleware';
import { encrypt } from '../utils/crypto';

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, name: true, bio: true, default_tone: true, default_language: true }
    });
    return res.status(200).json({ user });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { name, bio, default_tone, default_language } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { name, bio, default_tone, default_language },
      select: { id: true, email: true, name: true, bio: true, default_tone: true, default_language: true }
    });
    return res.status(200).json({ user });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const addSocialAccount = async (req: AuthRequest, res: Response) => {
  try {
    const { platform, access_token, refresh_token, handle } = req.body;
    if (!platform || !access_token) {
      return res.status(400).json({ error: 'Platform and access_token are required' });
    }
    const access_token_enc = encrypt(access_token);
    const refresh_token_enc = refresh_token ? encrypt(refresh_token) : null;
    
    const account = await prisma.socialAccount.create({
      data: {
        user_id: req.user!.id,
        platform,
        access_token_enc,
        refresh_token_enc,
        handle
      }
    });
    return res.status(201).json({ message: 'Account connected successfully', id: account.id });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getSocialAccounts = async (req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.socialAccount.findMany({
      where: { user_id: req.user!.id },
      select: { id: true, platform: true, handle: true, connected_at: true }
    });
    return res.status(200).json({ accounts });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const deleteSocialAccount = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.socialAccount.delete({
      where: { id }
    });
    return res.status(200).json({ message: 'Account disconnected successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateAIKeys = async (req: AuthRequest, res: Response) => {
  try {
    const { openai_key, anthropic_key } = req.body;
    
    const openai_key_enc = openai_key ? encrypt(openai_key) : undefined;
    const anthropic_key_enc = anthropic_key ? encrypt(anthropic_key) : undefined;
    
    const data: any = {};
    if (openai_key_enc) data.openai_key_enc = openai_key_enc;
    if (anthropic_key_enc) data.anthropic_key_enc = anthropic_key_enc;
    
    const aiKeys = await prisma.aIKey.upsert({
      where: { user_id: req.user!.id },
      update: data,
      create: {
        user_id: req.user!.id,
        ...data
      }
    });
    
    return res.status(200).json({ message: 'AI keys updated successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
