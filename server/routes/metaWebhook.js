/**
 * Meta Unified Webhook Route (WhatsApp, Facebook Messenger, Instagram)
 */
import express from 'express';
import { META_CONFIG } from '../config/metaConfig.js';
import { cssAgent } from '../agents/cssAgent.js';
import { webhookLogStore } from '../services/webhookLogStore.js';
import { conversationStore } from '../services/conversationStore.js';
import { verifyWebhookSignature, isDuplicateEvent } from '../services/webhookSecurity.js';
import { enqueue } from '../services/messageQueue.js';

const router = express.Router();

// Keep a small in-memory mirror for immediate dashboard reads; source of truth is SQLite.
export const webhookActivityLogs = [];

// WhatsApp sometimes delivers contacts[0].profile.name as a placeholder ('.',
// 'null', 'unknown') or blank. Collapse those to a meaningful fallback so the
// dashboard never shows a bare '.' or empty contact name.
function cleanName(name, fallback) {
  const trimmed = String(name == null ? '' : name).trim();
  const placeholders = new Set(['', '.', 'null', 'undefined', 'unknown', 'n/a', 'na']);
  return placeholders.has(trimmed.toLowerCase()) ? fallback : trimmed;
}

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
    for (const entry of body.entry || []) {
      // Diagnostic: log what object type each webhook event is
      const hasMessaging = Boolean(entry.messaging && entry.messaging[0]);
      const hasChanges = Boolean(entry.changes && entry.changes[0]);
      const changeField = hasChanges ? entry.changes[0].field : null;
      console.log(`[Meta Webhook] object=${body.object} hasMessaging=${hasMessaging} hasChanges=${hasChanges} changeField=${changeField}`);

      // --- CASE A: WhatsApp Cloud API Message ---
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.value?.messages) {
            const changeVal = change.value;
            const messageObj = changeVal.messages[0];

            if (!messageObj) continue;

            const senderPhone = messageObj.from;
            const contactObj = changeVal.contacts?.[0] || {};

            // Idempotency: skip if this message was already processed (Meta retry)
            const dedupKey = `wa:${messageObj.id || ''}:${senderPhone}`;
            if (isDuplicateEvent(dedupKey)) {
              console.log('[Meta Webhook] Duplicate WhatsApp event skipped (idempotency).');
              continue;
            }

            const senderName = cleanName(contactObj.profile?.name, `+${senderPhone}`);
            const messageType = messageObj.type;
            let textContent = '';
            let hasImage = false;

            if (messageType === 'text') {
              textContent = messageObj.text?.body || '';
            } else if (messageType === 'image') {
              textContent = messageObj.image?.caption || '[📷 Sent an image / payment screenshot]';
              hasImage = true;
            } else if (messageType === 'audio') {
              // WhatsApp Cloud API doesn't deliver inbound voice-note transcription,
              // so surface a clear label instead of a generic placeholder.
              const voice = messageObj.audio?.voice;
              textContent = (voice ? '[🎤 Voice note sent]' : '[🎵 Audio sent]');
            } else if (messageType === 'video') {
              textContent = messageObj.video?.caption || '[🎥 Video sent]';
            } else if (messageType === 'document') {
              textContent = `[📎 Document sent${messageObj.document?.filename ? `: ${messageObj.document.filename}` : ''}]`;
            } else if (messageType === 'location') {
              textContent = '[📍 Location shared]';
            } else if (messageType === 'contacts') {
              textContent = '[📄 Contact card shared]';
            } else if (messageType === 'sticker') {
              textContent = '[😀 Sticker sent]';
            } else if (messageType === 'button') {
              textContent = '[🔘 Button reply sent]';
            } else if (messageType === 'interactive') {
              textContent = '[🖱️ Interactive reply sent]';
            } else if (messageType === 'reaction') {
              textContent = '[👍 Reaction sent]';
            } else {
              textContent = `[Received ${messageType} message]`;
            }

            console.log(`[WhatsApp Inbound] From ${senderName} (${senderPhone}): "${textContent}"`);

            // Handle paused chats inline (just record, no reply) - cheap.
            if (conversationStore.isAiPaused(senderPhone)) {
              conversationStore.push(senderPhone, {
                sender: 'user',
                text: textContent,
                timestamp: new Date().toISOString()
              }, { channel: 'WhatsApp', contactName: senderName, senderId: senderPhone });
              console.log(`[WhatsApp] AI is PAUSED for ${senderPhone}. Message recorded but no AI reply.`);
              webhookLogStore.add({
                id: 'WH-PAUSED-' + Date.now(),
                channel: 'WhatsApp',
                sender: senderName,
                senderId: senderPhone,
                inboundText: textContent,
                outboundText: '[AI paused — owner to reply manually]',
                intent: 'paused',
                escalation: '',
                timestamp: new Date().toISOString()
              });
              continue;
            }

            // Enqueue full processing (persist -> AI -> send -> log) off the
            // request path so one slow AI/API call can't delay other messages.
            enqueue({
              channel: 'WhatsApp',
              senderId: senderPhone,
              senderName,
              prefixedText: textContent,
              processText: textContent,
              hasImage,
              idPrefix: 'WH'
            });
          }

          // --- CASE A2: Instagram Comments & Mentions (via entry.changes) ---
          if (body.object === 'instagram' && change.field) {
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
                continue;
              }

              console.log(`[Instagram Comment] From ${commenterName} (${commenterId}) on media ${mediaId}: "${commentText}"`);

              enqueue({
                channel: 'Instagram',
                senderId: commenterId,
                senderName: commenterName,
                prefixedText: `[Comment on post] ${commentText}`,
                processText: commentText,
                hasImage: false,
                idPrefix: 'IG-COMMENT',
                commentId,
                mediaId,
                isComment: true
              });
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
                continue;
              }

              console.log(`[Instagram Mention] From ${mentionerName} (${mentionerId}) on media ${mediaId}: "${mentionText}"`);

              enqueue({
                channel: 'Instagram',
                senderId: mentionerId,
                senderName: mentionerName,
                prefixedText: `[Mention] ${mentionText}`,
                processText: mentionText,
                hasImage: false,
                idPrefix: 'IG-MENTION',
                commentId: mentionId,
                mediaId,
                isMention: true
              });
            }
          }
        }
      }

      // --- CASE B: Facebook Messenger or Instagram Direct Message ---
      if (entry.messaging) {
        for (const messagingEvent of entry.messaging) {
          const senderId = messagingEvent.sender?.id;
          // Fix #3: Drop the length heuristic — Meta always sets body.object correctly
          const isInstagram = body.object === 'instagram';
          const channel = isInstagram ? 'Instagram' : 'Messenger';

          if (!messagingEvent.message || messagingEvent.message.is_echo) {
            continue; // Ignore bot echoes / read receipts
          }

          // Idempotency: skip if this message was already processed (Meta retry)
          const dedupKey = `ma:${messagingEvent.message.mid || ''}:${senderId}`;
          if (isDuplicateEvent(dedupKey)) {
            console.log(`[Meta Webhook] Duplicate ${channel} event skipped (idempotency).`);
            continue;
          }

          const textContent = messagingEvent.message.text || '[Attachment sent]';
          const hasImage = Boolean(messagingEvent.message.attachments?.some(a => a.type === 'image'));

          console.log(`[${channel} Inbound] From ID ${senderId}: "${textContent}"`);

          // Fetch real name from Meta Graph API (falls back to "Messenger User (XXXX)").
          // Done off the request path in the queue - here we use a fallback label.
          let senderName = `${channel} User (${senderId.slice(-4)})`;

          // Check if AI is paused for this chat (cheap inline path).
          if (conversationStore.isAiPaused(senderId)) {
            conversationStore.push(senderId, {
              sender: 'user',
              text: textContent,
              timestamp: new Date().toISOString()
            }, { channel, contactName: senderName, senderId });
            console.log(`[${channel}] AI is PAUSED for ${senderId}. Message recorded but no AI reply.`);
            webhookLogStore.add({
              id: 'META-PAUSED-' + Date.now(),
              channel,
              sender: senderName,
              senderId,
              inboundText: textContent,
              outboundText: '[AI paused — owner to reply manually]',
              intent: 'paused',
              escalation: '',
              timestamp: new Date().toISOString()
            });
            continue;
          }

          // Enqueue full processing (name-fetch -> AI -> send -> log) off the
          // request path. The profile-name fetch is done lazily inside the
          // worker so it never blocks the webhook response.
          enqueue({
            channel,
            senderId,
            senderName,
            prefixedText: textContent,
            processText: textContent,
            hasImage,
            idPrefix: 'META'
          });
        }
      }
      else if (!entry.changes) {
        console.log(`[Meta Webhook] UNMATCHED event: object=${body.object} entry_keys=${Object.keys(entry)} messaging=${Boolean(entry.messaging)} changes=${JSON.stringify(entry.changes?.[0]?.field)}`);
      }
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
