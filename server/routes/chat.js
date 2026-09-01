/**
 * Chat Route for CSS Agent & Live Dashboard
 */
import express from 'express';
import { cssAgent } from '../agents/cssAgent.js';
import { KNOWLEDGE_BASE } from '../config/knowledgeBase.js';
import { conversationStore } from '../services/conversationStore.js';

const router = express.Router();

// Simple in-memory sliding-window rate limiter to protect the agent (and Gemini budget)
const rateBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);

  // Periodically prune stale buckets to prevent unbounded growth
  if (rateBuckets.size > 10000) {
    for (const [k, b] of rateBuckets) {
      if (Date.now() > b.resetAt) rateBuckets.delete(k);
    }
  }
  return bucket.count > max;
}

const MAX_MESSAGE_LENGTH = 2000;
const CHAT_RATE_MAX = 20;
const CHAT_RATE_WINDOW_MS = 60000;

/**
 * Send a message to the CSS Agent
 */
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId = 'default-session', senderName = 'Customer', channel = 'WhatsApp' } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message must be a string under ${MAX_MESSAGE_LENGTH} characters.` });
    }

    // Rate limit per session to protect the agent + Gemini spend
    const clientKey = `sess:${String(sessionId)}`;
    if (rateLimit(clientKey, CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS)) {
      return res.status(429).json({ error: 'Too many messages. Please wait a moment and try again.' });
    }

    // Get or initialize conversation history (SQLite persisted)
    const history = conversationStore.get(sessionId);

    // Add customer message
    conversationStore.push(sessionId, {
      sender: 'user',
      text: message,
      timestamp: new Date().toISOString()
    }, { channel, contactName: senderName, senderId: sessionId });

    // Run CSS Agent
    const agentResponse = await cssAgent.handleMessage(message, {
      senderId: sessionId,
      senderName,
      channel
    });

    // Add agent message
    conversationStore.push(sessionId, {
      sender: 'agent',
      text: agentResponse.replyText,
      intent: agentResponse.intent,
      escalation: agentResponse.escalation,
      suggestedActions: agentResponse.suggestedActions,
      timestamp: new Date().toISOString()
    }, { channel, contactName: senderName, senderId: sessionId });

    const historyResponse = conversationStore.get(sessionId);

    res.json({
      success: true,
      reply: agentResponse.replyText,
      intent: agentResponse.intent,
      escalation: agentResponse.escalation,
      detectedPlan: agentResponse.detectedPlan,
      detectedRegion: agentResponse.detectedRegion,
      suggestedActions: agentResponse.suggestedActions,
      history: historyResponse
    });
  } catch (err) {
    console.error('Error in /api/chat/message:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

/**
 * Get conversation history for a session
 */
router.get('/history/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const history = conversationStore.get(sessionId);
  res.json({ history });
});

/**
 * Clear conversation history
 */
router.delete('/history/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  conversationStore.clear(sessionId);
  res.json({ success: true, message: 'Conversation cleared' });
});

/**
 * Append a message sent by the owner into the conversation.
 * @param {string} sessionId - customer/session key
 * @param {string} text - message body
 * @param {string} channel - WhatsApp | Messenger | Instagram
 * @param {string} sender - 'owner' (direct reply from Chat inbox) or
 *   'owner_escalation' (reply dispatched from an escalation action)
 */
export function appendOwnerMessageToConversation(sessionId, text, channel = 'WhatsApp', sender = 'owner') {
  conversationStore.push(sessionId, {
    sender,
    text: text,
    channel: channel,
    timestamp: new Date().toISOString()
  }, channel);
}

/**
 * Get Cheat Sheet Canned Quick Replies
 */
router.get('/quick-replies', (req, res) => {
  res.json({ cannedReplies: KNOWLEDGE_BASE.cannedReplies });
});

export default router;

