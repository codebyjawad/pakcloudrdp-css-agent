/**
 * Meta Unified Webhook Route (WhatsApp, Facebook Messenger, Instagram)
 */
import express from 'express';
import { META_CONFIG } from '../config/metaConfig.js';
import { cssAgent } from '../agents/cssAgent.js';
import { MetaMessagingService } from '../services/metaMessagingService.js';
import { webhookLogStore } from '../services/webhookLogStore.js';
import { conversationStore } from '../services/conversationStore.js';
import { verifyWebhookSignature, isDuplicateEvent } from '../services/webhookSecurity.js';

const router = express.Router();

// Keep a small in-memory mirror for immediate dashboard reads; source of truth is SQLite.
export const webhookActivityLogs = [];

/**
 * 1. Webhook Verification (GET /api/meta/webhook)
 * Meta calls this when you configure your Webhook in Meta App Dashboard
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log(`[Meta Webhook GET] Verification request received. Mode: ${mode}, Token: ${token}`);

  if (mode === 'subscribe' && token === META_CONFIG.webhookVerifyToken) {
    console.log('[Meta Webhook GET] Verification successful! Responding with challenge.');
    return res.status(200).send(challenge);
  } else {
    console.warn('[Meta Webhook GET] Verification failed. Token mismatch.');
    return res.sendStatus(403);
  }
});

/**
 * 2. Incoming Event Ingestion (POST /api/meta/webhook)
 * Receives messages from WhatsApp, Messenger, and Instagram
 */
router.post('/', async (req, res) => {
  const body = req.body;

  // Verify the event is genuinely from Meta (HMAC SHA-256) before processing.
  const signature = req.headers['x-hub-signature-256'];
  const rawForVerify = req.rawBody || JSON.stringify(body);
  const mconf = await import('../config/metaConfig.js');
  const crypto = (await import('node:crypto')).default;
  const computed = 'sha256=' + crypto.createHmac('sha256', mconf.META_CONFIG.appSecret || '').update(rawForVerify).digest('hex');
  console.log('[Diag] POST UA=' + (req.headers['user-agent']||'?') + ' sig=' + (signature||'?') + ' rawLen=' + String(req.rawBody||'').length + ' computed=' + computed + ' match=' + verifyWebhookSignature(rawForVerify, signature));
  if (!verifyWebhookSignature(rawForVerify, signature)) {
    console.warn('[Meta Webhook] Signature verification FAILED. Event rejected. sig=' + (signature||'?') + ' computed=' + computed + ' rawHead=' + String(rawForVerify).slice(0,80));
    console.warn('[Meta Webhook] Signature verification FAILED. Event rejected.');
    return res.sendStatus(403);
  }

  // Immediately acknowledge receipt to Meta to prevent duplicate retries
  res.status(200).send('EVENT_RECEIVED');

  try {
    const entry = body.entry?.[0];
    if (!entry) return;

    // Diagnostic: log what object type each webhook event is
    const hasMessaging = Boolean(entry.messaging && entry.messaging[0]);
    const hasChanges = Boolean(entry.changes && entry.changes[0]);
    const changeField = hasChanges ? entry.changes[0].field : null;
    console.log(`[Meta Webhook] object=${body.object} hasMessaging=${hasMessaging} hasChanges=${hasChanges} changeField=${changeField}`);

    // --- CASE A: WhatsApp Cloud API Message ---
    if (entry.changes && entry.changes[0]?.value?.messages) {
      const changeVal = entry.changes[0].value;
      const messageObj = changeVal.messages[0];

      if (!messageObj) return;

      const senderPhone = messageObj.from;
      const contactObj = changeVal.contacts?.[0] || {};

      // Idempotency: skip if this message was already processed (Meta retry)
      const dedupKey = `wa:${messageObj.id || ''}:${senderPhone}`;
      if (isDuplicateEvent(dedupKey)) {
        console.log('[Meta Webhook] Duplicate WhatsApp event skipped (idempotency).');
        return;
      }

      const senderName = contactObj.profile?.name || `Customer (+${senderPhone})`;
      const messageType = messageObj.type;
      let textContent = '';
      let hasImage = false;

      if (messageType === 'text') {
        textContent = messageObj.text?.body || '';
      } else if (messageType === 'image') {
        textContent = messageObj.image?.caption || '[Sent an image / payment screenshot]';
        hasImage = true;
      } else {
        textContent = `[Received ${messageType} message]`;
      }

      console.log(`[WhatsApp Inbound] From ${senderName} (${senderPhone}): "${textContent}"`);

      // Process via CSS Agent
      const agentResult = await cssAgent.handleMessage(textContent, {
        senderId: senderPhone,
        senderName: senderName,
        phone: senderPhone,
        channel: 'WhatsApp',
        hasImageAttachment: hasImage
      });

      // Persist the conversation history FIRST (so messages are never lost)
      conversationStore.push(senderPhone, {
        sender: 'user',
        text: textContent,
        timestamp: new Date().toISOString()
      }, { channel: 'WhatsApp', contactName: senderName, senderId: senderPhone });
      conversationStore.push(senderPhone, {
        sender: 'agent',
        text: agentResult.replyText,
        intent: agentResult.intent,
        timestamp: new Date().toISOString()
      }, { channel: 'WhatsApp', contactName: senderName, senderId: senderPhone });

      // Log activity (persisted to SQLite) — stringify escalation object for SQLite
      const logEntry = {
        id: 'WH-' + Date.now(),
        channel: 'WhatsApp',
        sender: senderName,
        senderId: senderPhone,
        inboundText: textContent,
        outboundText: agentResult.replyText,
        intent: agentResult.intent,
        escalation: agentResult.escalation ? JSON.stringify(agentResult.escalation) : '',
        timestamp: new Date().toISOString()
      };
      webhookLogStore.add(logEntry);
      webhookActivityLogs.unshift(logEntry);

      // Send outbound response via WhatsApp Cloud API
      await MetaMessagingService.sendWhatsAppMessage(senderPhone, agentResult.replyText);
    }

    // --- CASE A2: Instagram Comments & Mentions (via entry.changes) ---
    else if (body.object === 'instagram' && entry.changes && entry.changes[0]) {
      const change = entry.changes[0];
      const field = change.field;
      const value = change.value;

      if (field === 'comments' && value) {
        const commentText = value.text || '';
        const commenterId = value.from?.id || '';
        const commenterName = value.from?.username || commenterId.slice(-4);
        const mediaId = value.media_id || '';
        const commentId = value.comment_id || '';

        const dedupKey = `ig-comment:${commentId}:${commenterId}`;
        if (isDuplicateEvent(dedupKey)) {
          console.log('[Meta Webhook] Duplicate Instagram comment skipped.');
          return;
        }

        console.log(`[Instagram Comment] From ${commenterName} (${commenterId}) on media ${mediaId}: "${commentText}"`);

        const agentResult = await cssAgent.handleMessage(commentText, {
          senderId: commenterId,
          senderName: commenterName,
          channel: 'Instagram',
          isComment: true,
          mediaId: mediaId
        });

        conversationStore.push(commenterId, {
          sender: 'user',
          text: `[Comment on post] ${commentText}`,
          timestamp: new Date().toISOString()
        }, { channel: 'Instagram', contactName: commenterName, senderId: commenterId });
        conversationStore.push(commenterId, {
          sender: 'agent',
          text: agentResult.replyText,
          intent: agentResult.intent,
          timestamp: new Date().toISOString()
        }, { channel: 'Instagram', contactName: commenterName, senderId: commenterId });

        webhookLogStore.add({
          id: 'IG-COMMENT-' + Date.now(),
          channel: 'Instagram',
          sender: commenterName,
          senderId: commenterId,
          inboundText: `[Comment] ${commentText}`,
          outboundText: agentResult.replyText,
          intent: agentResult.intent,
          escalation: agentResult.escalation ? JSON.stringify(agentResult.escalation) : '',
          timestamp: new Date().toISOString()
        });

        // Reply to the comment via Instagram API
        if (commentId) {
          await MetaMessagingService.replyToInstagramComment(commentId, agentResult.replyText);
        }
      }

      if (field === 'mentions' && value) {
        const mentionText = value.text || '';
        const mentionerId = value.from?.id || '';
        const mentionerName = value.from?.username || mentionerId.slice(-4);
        const mediaId = value.media_id || '';
        const mentionId = value.mention_id || '';

        const dedupKey = `ig-mention:${mentionId}:${mentionerId}`;
        if (isDuplicateEvent(dedupKey)) {
          console.log('[Meta Webhook] Duplicate Instagram mention skipped.');
          return;
        }

        console.log(`[Instagram Mention] From ${mentionerName} (${mentionerId}) on media ${mediaId}: "${mentionText}"`);

        const agentResult = await cssAgent.handleMessage(mentionText, {
          senderId: mentionerId,
          senderName: mentionerName,
          channel: 'Instagram',
          isMention: true,
          mediaId: mediaId
        });

        conversationStore.push(mentionerId, {
          sender: 'user',
          text: `[Mention] ${mentionText}`,
          timestamp: new Date().toISOString()
        }, { channel: 'Instagram', contactName: mentionerName, senderId: mentionerId });
        conversationStore.push(mentionerId, {
          sender: 'agent',
          text: agentResult.replyText,
          intent: agentResult.intent,
          timestamp: new Date().toISOString()
        }, { channel: 'Instagram', contactName: mentionerName, senderId: mentionerId });

        webhookLogStore.add({
          id: 'IG-MENTION-' + Date.now(),
          channel: 'Instagram',
          sender: mentionerName,
          senderId: mentionerId,
          inboundText: `[Mention] ${mentionText}`,
          outboundText: agentResult.replyText,
          intent: agentResult.intent,
          escalation: agentResult.escalation ? JSON.stringify(agentResult.escalation) : '',
          timestamp: new Date().toISOString()
        });

        // Reply to the mention comment
        if (mentionId) {
          await MetaMessagingService.replyToInstagramComment(mentionId, agentResult.replyText);
        }
      }
    }

    // --- CASE B: Facebook Messenger or Instagram Direct Message ---
    else if (entry.messaging && entry.messaging[0]) {
      const messagingEvent = entry.messaging[0];
      const senderId = messagingEvent.sender?.id;
      const isInstagram = body.object === 'instagram' || Boolean(entry.id && entry.id.length > 15);
      const channel = isInstagram ? 'Instagram' : 'Messenger';

      if (!messagingEvent.message || messagingEvent.message.is_echo) {
        return; // Ignore bot echoes / read receipts
      }

      // Idempotency: skip if this message was already processed (Meta retry)
      const dedupKey = `ma:${messagingEvent.message.mid || ''}:${senderId}`;
      if (isDuplicateEvent(dedupKey)) {
        console.log(`[Meta Webhook] Duplicate ${channel} event skipped (idempotency).`);
        return;
      }

      const textContent = messagingEvent.message.text || '[Attachment sent]';
      const hasImage = Boolean(messagingEvent.message.attachments?.some(a => a.type === 'image'));

      console.log(`[${channel} Inbound] From ID ${senderId}: "${textContent}"`);

      // Fetch real name from Meta Graph API (falls back to "Messenger User (XXXX)")
      let senderName = `${channel} User (${senderId.slice(-4)})`;
      try {
        const realName = await MetaMessagingService.getUserProfile(channel, senderId);
        if (realName) senderName = realName;
      } catch {}

      // Process via CSS Agent
      const agentResult = await cssAgent.handleMessage(textContent, {
        senderId: senderId,
        senderName: senderName,
        channel: channel,
        hasImageAttachment: hasImage
      });

      // Persist the conversation history FIRST (so messages are never lost)
      conversationStore.push(senderId, {
        sender: 'user',
        text: textContent,
        timestamp: new Date().toISOString()
      }, { channel, contactName: senderName, senderId });
      conversationStore.push(senderId, {
        sender: 'agent',
        text: agentResult.replyText,
        intent: agentResult.intent,
        timestamp: new Date().toISOString()
      }, { channel, contactName: senderName, senderId });

      // Log activity (persisted to SQLite) — stringify escalation object for SQLite
      const logEntry = {
        id: 'META-' + Date.now(),
        channel: channel,
        sender: `${channel} User`,
        senderId: senderId,
        inboundText: textContent,
        outboundText: agentResult.replyText,
        intent: agentResult.intent,
        escalation: agentResult.escalation ? JSON.stringify(agentResult.escalation) : '',
        timestamp: new Date().toISOString()
      };
      webhookLogStore.add(logEntry);
      webhookActivityLogs.unshift(logEntry);

      // Send outbound reply
      if (channel === 'Instagram') {
        await MetaMessagingService.sendInstagramMessage(senderId, agentResult.replyText);
      } else {
        await MetaMessagingService.sendMessengerMessage(senderId, agentResult.replyText);
      }
    }
    else {
      console.log(`[Meta Webhook] UNMATCHED event: object=${body.object} entry_keys=${Object.keys(entry)} messaging=${Boolean(entry.messaging)} changes=${JSON.stringify(entry.changes?.[0]?.field)}`);
    }
  } catch (err) {
    console.error('[Meta Webhook POST] Error processing event:', err);
  }
});

/**
 * 3. Activity Logs endpoint for Dashboard
 */
router.get('/logs', (req, res) => {
  res.json({ logs: webhookLogStore.latest(50) });
});

/**
 * 4. Webhook Test Simulator endpoint
 * Allows testing Meta webhook payloads directly from the web interface
 */
router.post('/simulate', async (req, res) => {
  const { channel, senderName, senderPhone, messageText, hasImage } = req.body;

  const agentResult = await cssAgent.handleMessage(messageText, {
    senderId: senderPhone || '923001234567',
    senderName: senderName || 'Test Customer',
    phone: senderPhone || '923001234567',
    channel: channel || 'WhatsApp',
    hasImageAttachment: Boolean(hasImage)
  });

  const logEntry = {
    id: 'SIM-' + Date.now(),
    channel: channel || 'WhatsApp',
    sender: senderName || 'Simulated Customer',
    senderId: senderPhone || '923001234567',
    inboundText: messageText,
    outboundText: agentResult.replyText,
    intent: agentResult.intent,
    escalation: agentResult.escalation,
    timestamp: new Date().toISOString(),
    simulated: true
  };

  webhookLogStore.add(logEntry);
  webhookActivityLogs.unshift(logEntry);

  res.json({
    success: true,
    agentResult,
    log: logEntry
  });
});

export default router;
