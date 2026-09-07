/**
 * Broadcast API — owner-only promo endpoints.
 * Preview first (no sends), then run. The whole agent server is loopback-only
 * and admin-protected via nginx basic-auth (agent.codebyjawad.com), same trust
 * boundary as every other owner endpoint (/api/chats/:id/send, ...).
 */
import express from 'express';
import { broadcastService } from '../services/broadcastService.js';

const router = express.Router();

// Which WhatsApp contacts would receive the promo (performs NO sends)
router.get('/preview', (req, res) => {
  res.json(broadcastService.preview());
});

// Run the broadcast. Body {dryRun:true} (default) plans only; {dryRun:false} sends.
router.post('/run', async (req, res) => {
  const dryRun = req.body?.dryRun !== false;
  try {
    const result = await broadcastService.run({ dryRun, pacingMs: req.body?.pacingMs });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Prior broadcast attempts
router.get('/history', (req, res) => {
  res.json({ history: broadcastService.history(Number(req.query.limit || 50)) });
});

export default router;