/**
 * Webhook activity log store - SQLite backed.
 * Survives restarts (previously lost on every pm2 restart).
 */
import { db } from './db.js';

const INSERT = db.prepare(`
  INSERT INTO webhook_logs (
    id, channel, sender, senderId, inboundText, outboundText,
    intent, escalation, simulated, timestamp
  ) VALUES (
    @id, @channel, @sender, @senderId, @inboundText, @outboundText,
    @intent, @escalation, @simulated, @timestamp
  )
`);

export const webhookLogStore = {
  /**
   * Add a log entry and keep only the latest MAX logs (default 200) to bound DB size.
   */
  add(entry, max = 200) {
    INSERT.run({
      id: entry.id,
      channel: entry.channel || 'WhatsApp',
      sender: String(entry.sender || ''),
      senderId: String(entry.senderId || ''),
      inboundText: entry.inboundText ?? '',
      outboundText: entry.outboundText ?? '',
      intent: entry.intent || '',
      escalation: entry.escalation || '',
      simulated: entry.simulated ? 1 : 0,
      timestamp: entry.timestamp || new Date().toISOString()
    });

    // Trim to most recent MAX by timestamp (keeps DB bounded)
    db.prepare(`
      DELETE FROM webhook_logs WHERE id IN (
        SELECT id FROM webhook_logs ORDER BY timestamp DESC LIMIT -1 OFFSET @max
      )
    `).run({ max });
  },

  latest(limit = 50) {
    return db.prepare('SELECT * FROM webhook_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
  }
};
