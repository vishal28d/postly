import { Router } from 'express';
import { publishPost, schedulePost, retryPost, deletePost, getPosts, getPost, getDashboardStats } from '../controllers/post.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.post('/publish', publishPost);
router.post('/schedule', schedulePost);
router.post('/:id/retry', retryPost);
router.delete('/:id', deletePost);
router.get('/', getPosts);
router.get('/:id', getPost);

export default router;
