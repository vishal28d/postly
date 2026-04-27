import { Router } from 'express';
import { bot } from '../bot/telegramBot';

const router = Router();

router.post('/telegram', (req, res) => {
  if (bot) {
    bot.processUpdate(req.body);
  }
  res.sendStatus(200);
});

export default router;
