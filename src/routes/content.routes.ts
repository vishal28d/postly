import { Router } from 'express';
import { generate } from '../controllers/content.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);
router.post('/generate', generate);

export default router;
