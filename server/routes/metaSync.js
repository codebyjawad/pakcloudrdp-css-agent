/**
 * Meta Sync API endpoints
 */
import express from 'express';
import { metaSyncService } from '../services/metaSyncService.js';

const router = express.Router();

// Check whether Meta conversation sync is enabled (permission probe)
router.get('/status', async (req, res) => {
  const st = await metaSyncService.status();
  res.json(st);
});

// Run a full backfill of conversations from Meta
router.post('/', async (req, res) => {
  const result = await metaSyncService.sync();
  res.json(result);
});

export default router;
