import { Router } from 'express';
import { register, login, refresh, logout } from '../controllers/auth.controller';
import { requireAuth, AuthRequest } from '../middlewares/auth.middleware';
import { redis } from '../utils/redis';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);

// Telegram linking endpoint
router.get('/telegram-link', requireAuth, async (req: AuthRequest, res) => {
  const { token, chatId } = req.query;
  
  // Validate parameters
  if (!token || typeof token !== 'string' || !chatId || typeof chatId !== 'string') {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  // Verify the token exists and is valid (not expired)
  const verificationKey = `telegram_link:${token}`;
  const verificationData = await redis.get(verificationKey);
  
  if (!verificationData) {
    return res.status(400).send(`
      <html>
        <body>
          <h1>Invalid or expired link</h1>
          <p>The linking token is invalid or has expired. Please generate a new link from your Telegram bot.</p>
        </body>
      </html>
    `);
  }

  const verificationDataStr = verificationData as string;
  const { chatId: storedChatId } = JSON.parse(verificationDataStr);
  
  // Verify chatId matches
  if (storedChatId !== chatId) {
    return res.status(400).send(`
      <html>
        <body>
          <h1>Invalid link</h1>
          <p>The chat ID does not match the verification request.</p>
        </body>
      </html>
    `);
  }

  // Store the mapping: telegram chatId -> userId
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).send(`
      <html>
        <body>
          <h1>Authentication error</h1>
          <p>Could not determine user identity.</p>
        </body>
      </html>
    `);
  }

  // Store the mapping
  await redis.set(`telegram:${chatId}:userId`, userId);
  
  // Clean up the verification token
  await redis.del(verificationKey);
  
  res.send(`
    <html>
      <body>
        <h1>Telegram Account Linked Successfully!</h1>
        <p>You can now return to Telegram and continue using the bot.</p>
        <p>This window can be closed.</p>
      </body>
    </html>
  `);
});

export default router;