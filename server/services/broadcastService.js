/**
 * Broadcast Service — one-time promotional ping to WhatsApp contacts who have
 * NOT (yet) purchased from PakCloudRDP.
 *
 * "Purchased" is determined from TWO sources:
 *   1. The RDP customer book  → /opt/new RDP/data/customers.csv (the real source
 *      of truth for sold boxes; matched by the customer's WhatsApp phone).
 *   2. The agent `orders` table → orders with rdpDelivered='Yes', matched to a
 *      conversation by normalized customer name (orders.phone is often empty).
 *
 * Delivery rules (Meta policy):
 *   - Every send goes through an APPROVED WhatsApp template (sendWhatsAppTemplate),
 *     because free-form text outside a 24h customer session is rejected by Meta.
 *   - Each session is recorded in `broadcasts` (unique per session+template) so a
 *     campaign is idempotent — no session is ever pinged twice with the same template.
 *   - Sends are paced (~1 per 2.5s) with a short retry to ride out transient errors.
 *
 * Safety rails:
 *   - Skips purchasers, owner/test numbers (from the book), any chat whose owner
 *     notes request opt-out, and AI-paused chats (owner manually handling).
 *   - `preview()` performs ZERO sends — always run it before the real thing.
 */
import { db } from './db.js';
import { conversationStore } from './conversationStore.js';
import { MetaMessagingService } from './metaMessagingService.js';
import fs from 'fs';

const CUSTOMERS_CSV = '/opt/new RDP/data/customers.csv';
const TEMPLATE_NAME = process.env.BROADCAST_TEMPLATE_NAME || 'pakcloudrdp_plans_r2';
const TEMPLATE_LANGUAGE = process.env.BROADCAST_LANGUAGE || 'en';
const PACING_MS = Number(process.env.BROADCAST_PACING_MS || 2500);

const normalize = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

/** Pull just the `contact` column (3rd field) out of customers.csv. */
function readBookPhones() {
  const phones = new Set();
  try {
    const text = fs.readFileSync(CUSTOMERS_CSV, 'utf8');
    const lines = text.split(/\r?\n/).slice(1);
    for (const line of lines) {
      if (!line.trim()) continue;
      // Quote-aware 3rd field: handle the case where the notes field contains commas.
      const parts = [];
      let cur = '';
      let inQ = false;
      for (const ch of line) {
        if (ch === '"') inQ = !inQ;
        else if (ch === ',' && !inQ) { parts.push(cur); cur = ''; }
        else cur += ch;
      }
      parts.push(cur);
      const contact = (parts[2] || '').trim();
      if (contact) phones.add(normalize(contact));
    }
  } catch (err) {
    console.warn('[Broadcast] Could not read customer book:', err.message);
  }
  return phones;
}

/** Delivered order customer names from the orders table. */
function readOrderNames() {
  const names = new Set();
  try {
    const rows = db.prepare(
      "SELECT customer FROM orders WHERE rdpDelivered='Yes' OR orderStatus='Delivered'"
    ).all();
    for (const r of rows) if (r.customer) names.add(normalize(r.customer));
  } catch (err) {
    console.warn('[Broadcast] Could not read orders:', err.message);
  }
  return names;
}

const OPT_OUT_HINT = /(stop|opt\s?out|unsubscrib|don'?t\s*(message|contact)|no\s+promo)/i;

function seenBroadcast(sessionId) {
  const row = db.prepare(
    'SELECT id FROM broadcasts WHERE sessionId=? AND templateName=?'
  ).get(sessionId, TEMPLATE_NAME);
  return Boolean(row);
}

/** Target WhatsApp chats that have never purchased and have never received this template. */
function getCandidates() {
  const bookPhones = readBookPhones();
  const orderNames = readOrderNames();
  const rows = db.prepare(
    "SELECT sessionId, contactName, senderId, aiPaused, notes, updatedAt FROM conversations WHERE channel='WhatsApp'"
  ).all();

  const candidates = [];
  const skipped = { purchased: [], alreadySent: [], aiPaused: [], optedOut: [] };

  for (const r of rows) {
    const phone = normalize(r.senderId || r.sessionId);

    if (bookPhones.has(phone)) { skipped.purchased.push(r); continue; }
    if (orderNames.has(normalize(r.contactName))) { skipped.purchased.push(r); continue; }
    if (seenBroadcast(r.sessionId)) { skipped.alreadySent.push(r); continue; }
    if (r.notes && OPT_OUT_HINT.test(r.notes)) { skipped.optedOut.push(r); continue; }
    if (r.aiPaused) { skipped.aiPaused.push(r); continue; }

    const lastActiveDays = Math.round((Date.now() - new Date(r.updatedAt).getTime()) / 864e5);
    candidates.push({
      sessionId: r.sessionId,
      contactName: r.contactName || 'Customer',
      phone,
      lastActiveDays
    });
  }

  candidates.sort((a, b) => a.lastActiveDays - b.lastActiveDays);
  return { candidates, skipped, bookPhones: bookPhones.size };
}

function templateComponentsFor(candidate) {
  const first = (candidate.contactName || 'there').split(' ')[0];
  return [{ type: 'body', parameters: [{ type: 'text', text: first }] }];
}

function record(sessionId, contactName, status, { error = '', metaMessageId = '' } = {}) {
  db.prepare(`
    INSERT OR REPLACE INTO broadcasts
      (id, sessionId, contactName, channel, templateName, status, error, metaMessageId, sentAt)
    VALUES (?, ?, ?, 'WhatsApp', ?, ?, ?, ?, ?)
  `).run(
    'BC-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    sessionId, contactName, TEMPLATE_NAME, status, error, metaMessageId,
    status === 'sent' ? new Date().toISOString() : null
  );
}

/**
 * Show exactly who WOULD receive the broadcast, and who is excluded (no sends).
 */
function preview() {
  const { candidates, skipped } = getCandidates();
  return {
    templateName: TEMPLATE_NAME,
    language: TEMPLATE_LANGUAGE,
    recipients: candidates,
    recipientCount: candidates.length,
    skipped: {
      purchased: skipped.purchased.length,
      alreadySent: skipped.alreadySent.length,
      aiPaused: skipped.aiPaused.length,
      optedOut: skipped.optedOut.length,
    },
    note: 'Preview only — no messages were sent.'
  };
}

/**
 * Run the broadcast.
 * @param {object} opts
 *   @param {boolean} [opts.dryRun=true]  dryRun performs sends marked as simulated? No —
 *                                        dryRun sends NOTHING, just returns the plan.
 *   @param {number}  [opts.pacingMs]     pause between sends (default PACING_MS)
 * @returns {Promise<object>} summary with per-recipient results
 */
async function run({ dryRun = true, pacingMs = PACING_MS } = {}) {
  const { candidates, skipped } = getCandidates();
  const results = [];

  if (dryRun) {
    return {
      dryRun: true,
      templateName: TEMPLATE_NAME,
      planned: candidates.length,
      recipients: candidates,
      skipped: {
        purchased: skipped.purchased.length,
        alreadySent: skipped.alreadySent.length,
        aiPaused: skipped.aiPaused.length,
        optedOut: skipped.optedOut.length,
      },
      note: 'Dry run — nothing was sent.'
    };
  }

  if (candidates.length === 0) {
    return { success: true, sent: 0, failed: 0, message: 'No candidates.' };
  }

  for (const c of candidates) {
    const res = await MetaMessagingService.sendWhatsAppTemplate(c.phone, {
      templateName: TEMPLATE_NAME,
      language: TEMPLATE_LANGUAGE,
      components: templateComponentsFor(c),
    });

    if (!res.success) {
      // One retry (transient errors / just-rotated token).
      await new Promise((r) => setTimeout(r, 1500));
      const retry = await MetaMessagingService.sendWhatsAppTemplate(c.phone, {
        templateName: TEMPLATE_NAME,
        language: TEMPLATE_LANGUAGE,
        components: templateComponentsFor(c),
      });
      Object.assign(res, retry);
    }

    const ok = Boolean(res.success);
    const mid = ((res.data || {}).messages || [{}])[0]?.id || '';
    record(c.sessionId, c.contactName, ok ? 'sent' : 'failed', {
      error: ok ? '' : (res.error || 'send failed'),
      metaMessageId: mid,
    });

    results.push({ sessionId: c.sessionId, contactName: c.contactName, ok, error: res.error || '', metaMessageId: mid });

    if (!ok) {
      console.error(`[Broadcast] FAILED to ${c.phone} (${c.contactName}): ${res.error}`);
    } else {
      console.log(`[Broadcast] sent ${TEMPLATE_NAME} -> ${c.contactName} (${c.phone})`);
    }

    if (pacingMs > 0) await new Promise((r) => setTimeout(r, pacingMs));
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  return {
    success: true,
    sent,
    failed,
    total: results.length,
    templateName: TEMPLATE_NAME,
    results,
    skipped: {
      purchased: skipped.purchased.length,
      alreadySent: skipped.alreadySent.length,
      aiPaused: skipped.aiPaused.length,
      optedOut: skipped.optedOut.length,
    },
  };
}

/** History of prior broadcast attempts (for the owner). */
function history(limit = 50) {
  return db.prepare(
    'SELECT * FROM broadcasts WHERE templateName=? ORDER BY sentAt DESC LIMIT ?'
  ).all(TEMPLATE_NAME, limit);
}

export const broadcastService = { TEMPLATE_NAME, preview, run, history };