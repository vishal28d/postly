import { Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/db';
import { hashPassword, verifyPassword } from '../utils/hash';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    const password_hash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, password_hash, name },
    });
    return res.status(201).json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: (error as any).errors });
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

const generateTokens = (userId: string, email: string) => {
  const accessToken = jwt.sign({ id: userId, email }, process.env.JWT_ACCESS_SECRET || '', { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: userId, email }, process.env.JWT_REFRESH_SECRET || '', { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const { accessToken, refreshToken } = generateTokens(user.id, user.email);
    
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 7);
    
    await prisma.session.create({
      data: {
        user_id: user.id,
        refresh_token: refreshToken,
        expires_at
      }
    });

    return res.status(200).json({ accessToken, refreshToken });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const refresh = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
    
    const session = await prisma.session.findUnique({ where: { refresh_token: refreshToken }, include: { user: true } });
    if (!session || session.expires_at < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    
    try {
      jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || '');
    } catch {
      return res.status(401).json({ error: 'Invalid refresh token signature' });
    }
    
    await prisma.session.delete({ where: { id: session.id } });
    
    const tokens = generateTokens(session.user_id, session.user.email);
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 7);
    
    await prisma.session.create({
      data: {
        user_id: session.user_id,
        refresh_token: tokens.refreshToken,
        expires_at
      }
    });
    
    return res.status(200).json(tokens);
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });
    
    await prisma.session.deleteMany({ where: { refresh_token: refreshToken } });
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
