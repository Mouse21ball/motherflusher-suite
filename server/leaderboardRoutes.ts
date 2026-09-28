import type { Express } from 'express';
import { storage } from './storage';
import { requireAuth } from './middleware/auth';
import { generalApiRateLimit } from './middleware/rateLimits';

export function registerLeaderboardRoute(app: Express): void {
  app.get('/api/leaderboard', requireAuth, generalApiRateLimit, async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await storage.getLeaderboard(req.sessionPlayerId!));
    } catch (error) {
      console.error('Leaderboard fetch error:', error);
      res.status(500).json({ error: 'Failed to load leaderboard' });
    }
  });
}