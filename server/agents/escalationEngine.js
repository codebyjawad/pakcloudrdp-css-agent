/**
 * Escalation Engine for PakCloudRDP CSS Agent - SQLite backed.
 * Detects customer requests that MUST be escalated to the Owner based on the Cheat Sheet.
 */
import { db } from '../services/db.js';

const INSERT = db.prepare(`
  INSERT INTO escalations (
    id, customerId, customerName, channel, type, priority, reason,
    actionRequired, originalMessage, status, ownerActionTaken,
    dispatchedMessage, resolutionNotes, timestamp, resolvedAt
  ) VALUES (
    @id, @customerId, @customerName, @channel, @type, @priority, @reason,
    @actionRequired, @originalMessage, @status, @ownerActionTaken,
    @dispatchedMessage, @resolutionNotes, @timestamp, @resolvedAt
  )
`);

class EscalationEngine {
  constructor() {
  }

  /**
   * Check if a message requires Owner Escalation
   */
  evaluate(text, context = {}) {
    const lower = text.toLowerCase();

    // 1. Payment Verification Proof
    if (
      lower.includes('screenshot') ||
      lower.includes('receipt') ||
      lower.includes('payment bhej di') ||
      lower.includes('paise send kar diye') ||
      lower.includes('payment done') ||
      lower.includes('jazzcash kar diya') ||
      lower.includes('nayapay kar diya') ||
      lower.includes('slip') ||
      lower.includes('paid') ||
      context.hasImageAttachment
    ) {
      return {
        type: 'PAYMENT_VERIFICATION',
        priority: 'URGENT',
        reason: 'Customer submitted payment proof. Only Owner is authorized to verify and confirm payment.',
        actionRequired: 'Owner must verify bank/wallet deposit before RDP deployment.'
      };
    }

    // 2. Discount / Bargaining / Long-term Inquiries
    if (
      lower.includes('discount') ||
      lower.includes('kam karo') ||
      lower.includes('kuch kam') ||
      lower.includes('kam rate') ||
      lower.includes('concession') ||
      lower.includes('bargain') ||
      lower.includes('bulk discount') ||
      lower.includes('long term') ||
      lower.includes('longterm') ||
      lower.includes('3 months') ||
      lower.includes('6 months') ||
      lower.includes('yearly') ||
      lower.includes('annual') ||
      lower.includes('advance payment')
    ) {
      return {
        type: 'DISCOUNT_REQUEST',
        priority: 'MEDIUM',
        reason: 'Prices are fixed monthly. Long-term (3/6/12 mo) or bulk discounts require Owner approval.',
        actionRequired: 'Review if custom long-term package applies or re-affirm fixed price.'
      };
    }

    // 3. Refund Demands
    if (
      lower.includes('refund') ||
      lower.includes('paise wapis') ||
      lower.includes('money back') ||
      lower.includes('return money')
    ) {
      return {
        type: 'REFUND_REQUEST',
        priority: 'HIGH',
        reason: 'Strict Policy: Never promise a refund. Must be escalated directly to Owner.',
        actionRequired: 'Owner to handle refund dispute.'
      };
    }

    // 4. Trial Exceptions
    if (
      lower.includes('trial') ||
      lower.includes('test machine') ||
      lower.includes('pehle chala ke') ||
      lower.includes('free demo')
    ) {
      if (lower.includes('chahiye') || lower.includes('do') || lower.includes('must') || lower.includes('insist')) {
        return {
          type: 'TRIAL_EXCEPTION',
          priority: 'LOW',
          reason: 'Trials are unavailable. If customer insists, escalate to Owner.',
          actionRequired: 'Owner discretion if demo/trial can be provided.'
        };
      }
    }

    // 5. Custom Software & Advanced Server Setup
    if (
      lower.includes('custom software') ||
      lower.includes('install software') ||
      lower.includes('custom os') ||
      lower.includes('port forwarding') ||
      lower.includes('nested virtualization') ||
      lower.includes('gpu setup') ||
      lower.includes('custom iso')
    ) {
      return {
        type: 'CUSTOM_CONFIGURATION',
        priority: 'MEDIUM',
        reason: 'Custom installation & advanced config are not standard support and may incur an extra fee.',
        actionRequired: 'Owner to quote custom fee and assess technical feasibility.'
      };
    }

    // 6. Machine Down / Severe Connectivity
    if (
      lower.includes('rdp down') ||
      lower.includes('rdp is down') ||
      lower.includes('rdp not working') ||
      lower.includes('not connecting') ||
      lower.includes('cant connect') ||
      lower.includes('can\'t connect') ||
      lower.includes('cannot connect') ||
      lower.includes('connect nahi') ||
      lower.includes('login issue') ||
      lower.includes('login problem') ||
      lower.includes('machine band') ||
      lower.includes('machine down') ||
      lower.includes('server down') ||
      lower.includes('not working') ||
      lower.includes('offline') ||
      lower.includes('server unreachable')
    ) {
      return {
        type: 'TECHNICAL_OUTAGE',
        priority: 'HIGH',
        reason: 'Customer reports RDP machine down / unreachable.',
        actionRequired: 'Check server node status and IP connectivity.'
      };
    }

    return null;
  }

  /**
   * Log an escalation incident (persisted to SQLite)
   */
  logEscalation(customer, channel, trigger, messageText) {
    const escalation = {
      id: 'ESC-' + Date.now().toString(36).toUpperCase(),
      customerId: customer.id || customer.phone || 'Unknown',
      customerName: customer.name || 'WhatsApp Customer',
      channel: channel || 'WhatsApp',
      type: trigger.type,
      priority: trigger.priority || 'MEDIUM',
      reason: trigger.reason || '',
      actionRequired: trigger.actionRequired || trigger.reason || 'Owner review required',
      originalMessage: messageText,
      status: 'PENDING_OWNER_REVIEW',
      ownerActionTaken: null,
      dispatchedMessage: null,
      resolutionNotes: null,
      timestamp: new Date().toISOString(),
      resolvedAt: null
    };

    INSERT.run(escalation);
    return escalation;
  }

  getAll() {
    return db.prepare('SELECT * FROM escalations ORDER BY timestamp DESC').all();
  }

  getById(id) {
    return db.prepare('SELECT * FROM escalations WHERE id = ?').get(id) || null;
  }

  /**
   * Active (not resolved) escalations for a given customer key. Matches on
   * customerId, which is set from the senderId/phone at creation time.
   */
  getActiveByCustomer(customerKey) {
    if (!customerKey) return [];
    return db.prepare(
      `SELECT * FROM escalations
       WHERE customerId = ? AND status != 'RESOLVED'
       ORDER BY timestamp DESC`
    ).all(String(customerKey));
  }

  getAllActive() {
    return db.prepare(
      `SELECT * FROM escalations WHERE status != 'RESOLVED' ORDER BY timestamp DESC`
    ).all();
  }

  resolve(id, notes = '') {
    const esc = this.getById(id);
    if (!esc) return null;
    const resolvedAt = new Date().toISOString();
    db.prepare(
      "UPDATE escalations SET status='RESOLVED', resolvedAt=?, resolutionNotes=? WHERE id=?"
    ).run(resolvedAt, notes, id);
    return this.getById(id);
  }

  /**
   * Owner Review Action & Customer Notification Dispatcher
   */
  processOwnerAction(id, actionType, params = {}) {
    const esc = this.getById(id);
    if (!esc) return null;

    let responseMessage = '';
    let resolutionSummary = '';

    switch (actionType) {
      case 'APPROVE_PAYMENT':
        responseMessage = `✅ *Payment Verified by Owner!*

Shukriya! Aapki payment confirm ho chuki hai. Hamari team aapka *Dedicated Windows RDP* prepare kar rahi hai.
⏱️ Target delivery: *30 minutes* k andar aapko dedicated IP, username aur password deliver ho jayein ge! 🚀`;
        resolutionSummary = 'Payment Verified by Owner. Order moved to RDP Preparation.';
        break;

      case 'OFFER_DISCOUNT':
        responseMessage = `🎉 *Special Update from Management!*

Owner ne aapki request review kar k aapke liye special approved price set kar di hai:
💰 *₨${params.discountPrice || 'Special Rate'}/month*

Agar aap agree karte hain toh batayein taake payment accounts share karein aur order confirm karein! 🚀`;
        resolutionSummary = `Owner approved custom rate of ₨${params.discountPrice || 'Special Rate'}.`;
        break;

      case 'REJECT_REQUEST':
        responseMessage = `Hamari team ne aapki request review ki hai. Policy k mutabiq hamari prices fixed monthly rates par set hain jo best dedicated machine performance provide karti hain.
Aap hamara budget-friendly plan *Little EU (₨1,500/mo)* ya *Starter EU (₨2,800/mo)* choose kar sakte hain. 😊`;
        resolutionSummary = 'Request declined per standard policy.';
        break;

      case 'CUSTOM_REPLY':
      default:
        responseMessage = `📢 *Message from PakCloudRDP Management:*

${params.customMessage || 'Thank you for contacting PakCloudRDP.'}`;
        resolutionSummary = 'Custom reply sent to customer by Owner.';
        break;
    }

    const resolvedAt = new Date().toISOString();
    db.prepare(
      `UPDATE escalations SET status='RESOLVED', resolvedAt=?, resolutionNotes=?,
       ownerActionTaken=?, dispatchedMessage=? WHERE id=?`
    ).run(resolvedAt, resolutionSummary, actionType, responseMessage, id);

    const escalation = this.getById(id);
    return {
      escalation,
      responseMessage,
      resolutionSummary
    };
  }
}

export const escalationEngine = new EscalationEngine();
