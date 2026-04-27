import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import contentRoutes from './routes/content.routes';
import botRoutes from './routes/bot.routes';
import postRoutes from './routes/post.routes';
import { getDashboardStats } from './controllers/post.controller';
import { requireAuth } from './middlewares/auth.middleware';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/webhook', botRoutes);
app.use('/api/posts', postRoutes);
app.get('/api/dashboard/stats', requireAuth, getDashboardStats);

// Global Error Handler
app.use(errorHandler);

export default app;
