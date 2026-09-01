/**
 * PAKCLOUDRDP CSS AGENT & META INTEGRATION SERVER
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import metaWebhookRouter from './routes/metaWebhook.js';
import chatRouter from './routes/chat.js';
import plansRouter from './routes/plans.js';
import ordersRouter from './routes/orders.js';
import escalationsRouter from './routes/escalations.js';
import chatsRouter from './routes/chats.js';
import metaSyncRouter from './routes/metaSync.js';
import { META_CONFIG } from './config/metaConfig.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
// Bind to loopback only. The app is exposed to the internet through nginx
// (agent.codebyjawad.com) which applies basic-auth on admin/dashboard routes.
// Binding to 127.0.0.1 prevents direct public access to :3000 that would
// bypass nginx auth entirely.
const HOST = process.env.HOST || '127.0.0.1';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend dashboard
app.use(express.static(path.join(__dirname, '../client')));

// Mount API Routes
app.use('/api/meta/webhook', metaWebhookRouter);
app.use('/api/chat', chatRouter);
app.use('/api/plans', plansRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/escalations', escalationsRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/meta/sync', metaSyncRouter);

// Health check endpoint
const isPlaceholder = (v) => !v || /your_|here|example|<|>|change/i.test(v) || v === 'your_facebook_page_id_here' || v === 'your_instagram_account_id_here';

// Privacy policy page (required for Meta App Review)
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/privacy.html'));
});

app.get('/api/health', (req, res) => {
  const w = META_CONFIG.whatsapp;
  const m = META_CONFIG.messenger;
  const i = META_CONFIG.instagram;

  const metaIntegration = {
    whatsapp: (!isPlaceholder(w.phoneNumberId) && !isPlaceholder(w.accessToken) && !isPlaceholder(w.wabaId))
      ? 'Configured' : 'Not configured / placeholder',
    messenger: (!isPlaceholder(m.pageId) && !isPlaceholder(m.pageAccessToken))
      ? 'Configured' : 'Not configured / placeholder',
    instagram: (!isPlaceholder(i.instagramAccountId) && !isPlaceholder(i.accessToken))
      ? 'Configured' : 'Not configured / placeholder'
  };

  res.json({
    status: 'healthy',
    service: 'PakCloudRDP CSS Agent Server',
    metaIntegration,
    note: 'Status reflects whether real Meta credentials are configured. It does not mean messages were live-tested against the Graph API.',
    timestamp: new Date().toISOString()
  });
});

// Fallback to index.html for SPA frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Start Server
app.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 PAKCLOUDRDP CSS AGENT SERVER RUNNING ON ${HOST}:${PORT} (nginx-protected)`);
  console.log(`======================================================`);
  console.log(`🌐 Dashboard UI:      http://localhost:${PORT}`);
  console.log(`📱 Meta Webhook URL:  http://localhost:${PORT}/api/meta/webhook`);
  console.log(`💬 Chat API:          http://localhost:${PORT}/api/chat/message`);
  console.log(`📋 Price Matrix API:  http://localhost:${PORT}/api/plans`);
  console.log(`======================================================\n`);
});
