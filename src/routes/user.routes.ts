import { Router } from 'express';
import { getMe, updateProfile, addSocialAccount, getSocialAccounts, deleteSocialAccount, updateAIKeys } from '../controllers/user.controller';
import { requireAuth } from '../middlewares/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/profile', getMe);
router.put('/profile', updateProfile);

router.post('/social-accounts', addSocialAccount);
router.get('/social-accounts', getSocialAccounts);
router.delete('/social-accounts/:id', deleteSocialAccount);

router.put('/ai-keys', updateAIKeys);

export default router;
