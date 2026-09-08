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
import { ownerAlertService } from './ownerAlertService.js';

const CONCURRENCY = Number(process.env.MSG_QUEUE_CONCURRENCY || 2);

// Sent when the agent throws. Saying nothing is the one thing that loses a
// customer; a holding reply keeps the conversation alive until the owner looks.
const AGENT_ERROR_REPLY =
  'Shukriya for your message! Hamari team abhi aapko detail se reply karegi. ' +
  'Aap apna requirement (plan / region) bhi bata dein taake foran quote de saken.';

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
  try {
    conversationStore.push(senderId, {
      sender: 'user',
      text: prefixedText,
      timestamp: new Date().toISOString()
    }, { channel, contactName: resolvedName, senderId });
  } catch (err) {
    console.error('[MsgQueue] Could not record inbound message for ' + senderId + ':', err.message);
  }

  if (conversationStore.isAiPaused(senderId)) {
    console.log(`[${channel}] AI is PAUSED for ${senderId}. Message recorded but no AI reply.`);
    return;
  }

  // The agent must never take the reply down with it. A throw here used to
  // reject processTask, which pump() merely console.error'd - so the customer
  // got nothing, Meta had already been sent its 200 and would never retry, and
  // webhookLogStore.add below never ran, so it did not even show as a failure.
  let agentResult;
  try {
    agentResult = await cssAgent.handleMessage(processText, {
      senderId,
      senderName: resolvedName,
      phone: senderId,
      channel,
      hasImageAttachment: hasImage,
      isComment: task.isComment,
      isMention: task.isMention,
      mediaId: task.mediaId
    });
  } catch (err) {
    console.error('[MsgQueue] Agent failed for ' + senderId + ':', err.message);
    agentResult = {
      replyText: AGENT_ERROR_REPLY,
      intent: 'AGENT_ERROR',
      escalation: { type: 'AGENT_ERROR', priority: 'HIGH', reason: err.message }
    };
  }

  const replyMsgId = 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  try {
    conversationStore.push(senderId, {
      id: replyMsgId,
      sender: 'agent',
      text: agentResult.replyText,
      intent: agentResult.intent,
      timestamp: new Date().toISOString(),
      deliveryStatus: 'sending'
    }, { channel, contactName: resolvedName, senderId });
  } catch (err) {
    // Losing the transcript row is bad. Losing the reply is worse. Keep going.
    console.error('[MsgQueue] Could not record agent reply for ' + senderId + ':', err.message);
  }

  const senderLabel = channel === 'WhatsApp'
    ? (resolvedName || '+' + senderId)
    : (resolvedName || channel + ' User (' + String(senderId).slice(-4) + ')');

  // Repeat-guard silence: an empty reply is intentional (REPEAT_SILENT) and
  // must never be pushed to Meta's API.
  if (!String(agentResult.replyText || '').trim()) {
    console.log(`[${channel}] Empty reply (${agentResult.intent}) for ${senderId} — not sending.`);
    return;
  }

  // Fire owner alert if the agent flagged an escalation (non-blocking).
  if (agentResult.escalation && agentResult.escalation !== '') {
    const esc = typeof agentResult.escalation === 'string'
      ? (() => { try { return JSON.parse(agentResult.escalation); } catch { return {}; } })()
      : agentResult.escalation;

    // Fetch the last 3 conversation turns for context in the alert
    let lastMessages = [{ sender: 'user', text: processText }];
    try {
      const conv = conversationStore.get(senderId);
      if (Array.isArray(conv) && conv.length) {
        lastMessages = conv.slice(-3).map((m) => ({ sender: m.sender, text: m.text }));
      }
    } catch {}

    ownerAlertService.notify({
      customerId: senderId,
      customerName: resolvedName,
      channel,
      escalationType: esc.type || 'ESCALATION',
      reason: esc.reason || esc.actionRequired || '',
      lastMessage: processText,
      lastMessages
    }).catch((err) => console.error('[OwnerAlert] notify() failed:', err.message));
  }

  const send = async () => {
    if (task.commentId) return MetaMessagingService.replyToInstagramComment(task.commentId, agentResult.replyText);
    if (channel === 'WhatsApp') return MetaMessagingService.sendWhatsAppMessage(senderId, agentResult.replyText);
    if (channel === 'Instagram') return MetaMessagingService.sendInstagramMessage(senderId, agentResult.replyText);
    return MetaMessagingService.sendMessengerMessage(senderId, agentResult.replyText);
  };

  let sendResult;
  try {
    sendResult = await send();
    // One retry covers a transient 5xx and the case where an expired token was
    // just evicted from the cache by the first attempt.
    if (!sendResult.success) {
      console.warn('[MsgQueue] Send failed for ' + senderId + ' (' + sendResult.error + ') - retrying once.');
      await new Promise((r) => setTimeout(r, 1500));
      sendResult = await send();
    }
  } catch (err) {
    sendResult = { success: false, error: err.message };
  }

  if (!sendResult.success) {
    // The most important line in this file: the only signal that a customer is
    // waiting on a reply that never arrived.
    console.error('[MsgQueue] REPLY NOT DELIVERED to ' + senderLabel + ' (' + senderId + ') on ' + channel + ': ' + sendResult.error);
    conversationStore.updateMessage(senderId, replyMsgId, {
      deliveryStatus: 'failed',
      deliveryError: sendResult.error || 'Delivery failed'
    });
  } else {
    conversationStore.updateMessage(senderId, replyMsgId, {
      deliveryStatus: 'delivered'
    });
  }

  const idPrefix = task.idPrefix || 'META';
  webhookLogStore.add({
    id: idPrefix + '-' + Date.now(),
    channel,
    sender: senderLabel,
    senderId,
    inboundText: prefixedText,
    outboundText: agentResult.replyText,
    intent: agentResult.intent,
    escalation: agentResult.escalation ? JSON.stringify(agentResult.escalation) : '',
    delivered: Boolean(sendResult.success),
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
