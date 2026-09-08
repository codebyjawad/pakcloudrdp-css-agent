/**
 * Owner Alert Service
 * Sends WhatsApp escalation notifications to the owner's personal number.
 * Stores alert records so incoming owner replies can be routed back to the customer.
 */
import { db } from './db.js';
import { MetaMessagingService } from './metaMessagingService.js';

// Owner's personal WhatsApp number (no leading +)
export const OWNER_PHONE = (process.env.OWNER_PHONE || '966543644817').replace(/[^0-9]/g, '');

// Ensure the owner_alerts table exists (idempotent)
db.exec(`
  CREATE TABLE IF NOT EXISTS owner_alerts (
    id TEXT PRIMARY KEY,
    waMessageId TEXT,
    customerId TEXT NOT NULL,
    customerName TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'WhatsApp',
    status TEXT NOT NULL DEFAULT 'OPEN',
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_owner_alerts_wamid ON owner_alerts(waMessageId);
  CREATE INDEX IF NOT EXISTS idx_owner_alerts_customer ON owner_alerts(customerId, status);
`);

export const ownerAlertService = {
  /**
   * Send an escalation alert to the owner's personal WA.
   * De-duplicates: skips if an OPEN alert already exists for this customer.
   */
  async notify({ customerId, customerName, channel, escalationType, reason, lastMessage, lastMessages }) {
    // Don't spam: if an OPEN alert for this customer already exists, skip
    const existing = db.prepare(
      `SELECT id FROM owner_alerts WHERE customerId = ? AND status = 'OPEN' LIMIT 1`
    ).get(customerId);

    if (existing) {
      console.log(`[OwnerAlert] Open alert already exists for ${customerId}, skipping duplicate.`);
      return null;
    }

    const channelEmoji = { WhatsApp: '📱', Messenger: '💬', Instagram: '📸' }[channel] || '📩';
    const shortId = String(customerId).slice(-10);

    // Build last-messages section (up to 3 most recent turns)
    const messages = Array.isArray(lastMessages) && lastMessages.length
      ? lastMessages
      : lastMessage ? [{ sender: 'user', text: lastMessage }] : [];
    const recent = messages.slice(-3);
    const msgLines = recent.map((m) => {
      const prefix = m.sender === 'user' ? '👤' : '🤖';
      const label  = m.sender === 'user' ? customerName : 'AI Agent';
      const body   = String(m.text || '').slice(0, 180);
      return `${prefix} *${label}:* ${body}`;
    });

    const alertText = [
      `🚨 *ESCALATION ALERT* — PakCloudRDP`,
      ``,
      `👤 Customer: ${customerName} (${channel === 'WhatsApp' ? '+' : ''}${shortId})`,
      `${channelEmoji} Channel: ${channel}`,
      `🔥 Type: ${escalationType || 'URGENT'}`,
      `📋 Reason: ${reason || 'Customer needs immediate assistance'}`,
      ``,
      `Last ${recent.length} message${recent.length !== 1 ? 's' : ''}:`,
      ...msgLines,
      ``,
      `Reply to this message to respond directly to the customer.`,
      `Ref: ${customerId}`
    ].join('\n');

    console.log(`[OwnerAlert] Sending alert to owner (+${OWNER_PHONE}) for customer ${customerId}`);

    let waMessageId = null;
    try {
      const result = await MetaMessagingService.sendWhatsAppMessage(OWNER_PHONE, alertText);
      if (result?.success && result?.data?.messages?.[0]?.id) {
        waMessageId = result.data.messages[0].id;
      }
      if (!result?.success) {
        console.error('[OwnerAlert] Failed to send alert to owner:', result?.error);
      }
    } catch (err) {
      console.error('[OwnerAlert] Exception sending alert:', err.message);
    }

    // Store alert record regardless (so we can still route freeform replies)
    const alertId = 'ALERT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    db.prepare(`
      INSERT INTO owner_alerts (id, waMessageId, customerId, customerName, channel, status, createdAt)
      VALUES (?, ?, ?, ?, ?, 'OPEN', ?)
    `).run(alertId, waMessageId, customerId, customerName, channel, new Date().toISOString());

    console.log(`[OwnerAlert] Alert recorded: ${alertId} (waMessageId=${waMessageId})`);
    return alertId;
  },

  /** Look up open alert by WA context message ID (owner replied by quoting alert). */
  findByWaMessageId(waMessageId) {
    if (!waMessageId) return null;
    return db.prepare(
      `SELECT * FROM owner_alerts WHERE waMessageId = ? AND status = 'OPEN' LIMIT 1`
    ).get(waMessageId) || null;
  },

  /** Fallback: oldest open alert when owner replies without quoting. */
  findOldestOpen() {
    return db.prepare(
      `SELECT * FROM owner_alerts WHERE status = 'OPEN' ORDER BY createdAt ASC LIMIT 1`
    ).get() || null;
  },

  /** Mark an alert resolved after the owner has replied. */
  markReplied(alertId) {
    db.prepare(`UPDATE owner_alerts SET status = 'REPLIED' WHERE id = ?`).run(alertId);
  },

  /** True if a phone number belongs to the owner. */
  isOwner(phone) {
    const clean = String(phone || '').replace(/[^0-9]/g, '');
    return clean === OWNER_PHONE || clean === OWNER_PHONE.replace(/^966/, '0');
  }
};
