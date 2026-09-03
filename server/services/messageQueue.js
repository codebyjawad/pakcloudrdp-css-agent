/**
 * Background message processing queue.
 *
 * The Meta webhook previously processed each inbound message fully inline and
 * synchronously inside the HTTP request: a blocking Graph API name-fetch, an
 * inline AI generation call, and the outbound send were all `await`ed serially.
 * On a slow/rate-limited AI response (Gemini 429 etc.) that stalled Node's
 * single thread, so OTHER customers' incoming messages were also delayed.
 *
 * This module provides a small, fire-and-forget FIFO worker with bounded
 * concurrency. The webhook handler enqueues a task and returns immediately;
 * the worker processes each message's full pipeline off the request path.
 * Per-sender ordering is optional and disabled by default.
 */
import { webhookLogStore } from './webhookLogStore.js';
import { conversationStore } from './conversationStore.js';
import { cssAgent } from '../agents/cssAgent.js';
import { MetaMessagingService } from './metaMessagingService.js';

const CONCURRENCY = Number(process.env.MSG_QUEUE_CONCURRENCY || 2);

const queue = [];
let active = 0;
let drainedResolver = null;

/**
 * Enqueue a message task. Returns immediately.
 * @param {object} task
 *   @param {string} task.channel         'WhatsApp' | 'Messenger' | 'Instagram'
 *   @param {string} task.senderId        Phone or page-scoped user id
 *   @param {string} task.senderName      Best-known display name (fallback ok)
 *   @param {string} task.prefixedText    Full display text to persist (may include
 *                                        '[Comment on post]' etc.)
 *   @param {string} task.processText     Text to feed the CSS agent (raw message)
 *   @param {boolean} task.hasImage
 *   @param {string} [task.idPrefix]      Log id prefix (WH-/META-/IG-...)
 *   @param {string} [task.commentId]     If set, reply to an Instagram comment
 *   @param {string} [task.mediaId]       Instagram media/mention context
 *   @param {boolean} [task.isComment]
 *   @param {boolean} [task.isMention]
 */
export function enqueue(task) {
  queue.push(task);
  setImmediate(pump);
}

/**
 * Start pumping the queue at bounded concurrency. A single in-flight chain is
 * enough to keep pulling tasks; extra pump() calls are harmless no-ops.
 */
async function pump() {
  while (active < CONCURRENCY && queue.length > 0) {
    const task = queue.shift();
    active++;
    processTask(task)
      .catch((err) => console.error('[MsgQueue] Task error:', err))
      .finally(() => {
        active--;
        if (queue.length === 0 && active === 0 && drainedResolver) {
          drainedResolver();
          drainedResolver = null;
        }
        setImmediate(pump);
      });
  }
}

/**
 * Full processing pipeline for one inbound message. Keep it non-throwing so a
 * failure in one step doesn't drop ordering of the remaining queue.
 */
async function processTask(task) {
  const { channel, senderId, senderName, prefixedText, processText, hasImage } = task;

  // Best-effort real name enrichment for Messenger/Instagram. Doing this here
  // (in the worker) keeps the blocking Graph API call off the webhook request
  // path so it can never delay message receipt.
  let resolvedName = senderName;
  if (channel === 'Messenger' || channel === 'Instagram') {
    try {
      const realName = await MetaMessagingService.getUserProfile(channel, senderId);
      if (realName) resolvedName = realName;
    } catch {}
  }

  // Persist the user message first (always, even if AI is paused).
  conversationStore.push(senderId, {
    sender: 'user',
    text: prefixedText,
    timestamp: new Date().toISOString()
  }, { channel, contactName: resolvedName, senderId });

  if (conversationStore.isAiPaused(senderId)) {
    console.log(`[${channel}] AI is PAUSED for ${senderId}. Message recorded but no AI reply.`);
    return;
  }

  const agentResult = await cssAgent.handleMessage(processText, {
    senderId,
    senderName: resolvedName,
    phone: senderId,
    channel,
    hasImageAttachment: hasImage,
    isComment: task.isComment,
    isMention: task.isMention,
    mediaId: task.mediaId
  });

  conversationStore.push(senderId, {
    sender: 'agent',
    text: agentResult.replyText,
    intent: agentResult.intent,
    timestamp: new Date().toISOString()
  }, { channel, contactName: resolvedName, senderId });

  // Send the outbound reply on the appropriate Meta channel.
  let sendResult = { success: false, simulated: true };
  let senderLabel = resolvedName || `${channel} User (${String(senderId).slice(-4)})`;

  if (task.commentId) {
    sendResult = await MetaMessagingService.replyToInstagramComment(task.commentId, agentResult.replyText);
  } else if (channel === 'WhatsApp') {
    senderLabel = resolvedName || `+${senderId}`;
    sendResult = await MetaMessagingService.sendWhatsAppMessage(senderId, agentResult.replyText);
  } else if (channel === 'Instagram') {
    sendResult = await MetaMessagingService.sendInstagramMessage(senderId, agentResult.replyText);
  } else {
    sendResult = await MetaMessagingService.sendMessengerMessage(senderId, agentResult.replyText);
  }

  const idPrefix = task.idPrefix || 'META';
  webhookLogStore.add({
    id: `${idPrefix}-` + Date.now(),
    channel,
    sender: senderLabel,
    senderId,
    inboundText: prefixedText,
    outboundText: agentResult.replyText,
    intent: agentResult.intent,
    escalation: agentResult.escalation ? JSON.stringify(agentResult.escalation) : '',
    delivered: sendResult.success && !sendResult.simulated,
    timestamp: new Date().toISOString()
  });
}

/**
 * Test/utility: wait until the queue drains (used by stress tests).
 */
export function waitForDrain() {
  if (queue.length === 0 && active === 0) return Promise.resolve();
  return new Promise((resolve) => { drainedResolver = resolve; });
}

export const messageQueue = { enqueue, waitForDrain, get length() { return queue.length; } };
