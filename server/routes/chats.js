/**
 * Per-User Chat Inbox API
 * Lists all customer conversations, reads a single thread, and lets the owner
 * send direct replies (bypassing the AI) or correct an AI-generated message.
 */
import express from 'express';
import { conversationStore } from '../services/conversationStore.js';
import { MetaMessagingService } from '../services/metaMessagingService.js';
import { geminiService } from '../services/geminiService.js';
import { KNOWLEDGE_BASE } from '../config/knowledgeBase.js';
import { escalationEngine } from '../agents/escalationEngine.js';

const router = express.Router();

// Active escalations indexed by customerId, so chats can surface them.
function escalationsByCustomer() {
  const map = {};
  for (const e of escalationEngine.getAllActive()) {
    const key = e.customerId || '';
    (map[key] = map[key] || []).push(e);
  }
  return map;
}

// List all chats (customers) with last message preview + active escalations
router.get('/', (req, res) => {
  const escMap = escalationsByCustomer();
  const chats = conversationStore.list().map((c) => {
    // Match escalations by sessionId or senderId
    const active = escMap[c.sessionId] || escMap[c.senderId] || [];
    return { ...c, escalations: active };
  });
  res.json({ chats });
});

// Get full thread for one chat + its active escalations
router.get('/:id', (req, res) => {
  const sessionId = req.params.id;
  const history = conversationStore.get(sessionId);
  const meta = conversationStore.getMeta(sessionId);
  const active = escalationEngine.getActiveByCustomer(sessionId)
    .concat(meta.senderId && meta.senderId !== sessionId ? escalationEngine.getActiveByCustomer(meta.senderId) : []);
  res.json({ chat: { sessionId, ...meta, history, escalations: active } });
});

// AI "profit coach": analyze the FULL chat and recommend the best NEXT message
// for the owner to send. Cost-aware: only calls Gemini when the chat fingerprint
// changed since the last analysis (send force:true to re-analyze on demand).
// Owner-facing only; never auto-sends.
router.post('/:id/suggest', async (req, res) => {
  const sessionId = req.params.id;
  const force = Boolean(req.body && req.body.force);

  const history = conversationStore.get(sessionId);
  const fp = conversationStore.fingerprint(sessionId);
  const stored = conversationStore.getAnalysis(sessionId);

  // Cache hit: chat unchanged since last analysis -> no Gemini call.
  if (!force && stored && stored.fingerprint === fp && stored.suggestions && stored.suggestions.length) {
    return res.json({ success: true, cached: true, analysis: stored, suggestions: stored.suggestions });
  }

  const analysis = await geminiService.analyzeForNextMessage(KNOWLEDGE_BASE, history);
  const result = { ...analysis, fingerprint: fp, analyzedAt: new Date().toISOString() };
  conversationStore.setAnalysis(sessionId, result);

  res.json({ success: true, cached: false, analysis: result, suggestions: result.suggestions });
});

/**
 * Owner direct reply: bypasses the AI, sends straight to the customer on their
 * channel, and logs it as an 'owner' message in the thread.
 */
router.post('/:id/send', async (req, res) => {
  const sessionId = req.params.id;
  const { text, senderName = 'Owner' } = req.body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }
  if (text.length > 2000) {
    return res.status(400).json({ error: 'Message too long (max 2000 chars).' });
  }

  const meta = conversationStore.getMeta(sessionId);
  const recipientId = meta.senderId || sessionId;
  const channel = meta.channel || 'WhatsApp';

  // Append to thread BEFORE dispatch so the thread always has the message
  conversationStore.push(sessionId, {
    sender: 'owner',
    text: text,
    timestamp: new Date().toISOString(),
    channel
  }, { channel, contactName: meta.contactName, senderId: recipientId });

  // Dispatch to the customer on their original channel
  let dispatchResult;
  try {
    dispatchResult = await MetaMessagingService.dispatch(channel, recipientId, text);
  } catch (err) {
    dispatchResult = { success: false, error: err.message };
  }

  res.json({
    success: true,
    dispatchResult,
    history: conversationStore.get(sessionId)
  });
});

/**
 * Correct an AI-generated message: overwrite its text in the thread and resend
 * the corrected text to the customer. Returns 404 if the message isn't found.
 */
router.post('/:id/correct', async (req, res) => {
  const sessionId = req.params.id;
  const { messageId, text } = req.body;

  if (!messageId || !text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'messageId and text are required.' });
  }

  const history = conversationStore.editMessage(sessionId, messageId, text);
  if (!history) {
    return res.status(404).json({ error: 'Message not found in this chat.' });
  }

  const meta = conversationStore.getMeta(sessionId);
  const recipientId = meta.senderId || sessionId;
  const channel = meta.channel || 'WhatsApp';

  // Resend the corrected text to the customer
  let dispatchResult;
  try {
    dispatchResult = await MetaMessagingService.dispatch(channel, recipientId, text);
  } catch (err) {
    dispatchResult = { success: false, error: err.message };
  }

  res.json({ success: true, dispatchResult, history });
});

// Delete a chat thread
router.delete('/:id', (req, res) => {
  const ok = conversationStore.clear(req.params.id);
  res.json({ success: ok });
});

export default router;
