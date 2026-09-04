/**
 * Webhook security helpers:
 *  - X-Hub-Signature-256 verification (protects against forged Meta events)
 *  - Idempotency/dedup so Meta retries don't double-process or double-send
 */
import crypto from 'crypto';
import { META_CONFIG } from '../config/metaConfig.js';
import { db } from './db.js';

/**
 * Verify a Meta webhook POST payload against the X-Hub-Signature-256 header.
 * When META_APP_SECRET is not configured, verification is disabled (return true)
 * so the integration keeps working until the operator sets the secret.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = META_CONFIG.appSecret;
  if (!secret) {
    // Previously this returned true, so with no app secret ANY caller could POST
    // a forged event and have the agent act on it. Refusing is the safe default:
    // a missing secret is a setup error, not a reason to trust the internet.
    console.error('[Meta Webhook] META_APP_SECRET is not set - rejecting event. Set it to accept webhooks.');
    return false;
  }
  if (!signatureHeader) {
    console.warn('[Meta Webhook] Missing X-Hub-Signature-256 header. Rejecting event.');
    return false;
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = String(signatureHeader).trim();
  // Constant-time comparison
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Record a processed event idempotency key. Returns true if this event was already
 * seen (should be skipped), false if it's new (process it).
 */
export function isDuplicateEvent(dedupKey) {
  if (!dedupKey) return false;
  const existing = db.prepare('SELECT processedAt FROM processed_webhook_events WHERE dedup_key = ?').get(dedupKey);
  if (existing) return true;
  // Insert and prune old keys (keep ~5000)
  db.prepare(
    'INSERT OR IGNORE INTO processed_webhook_events (dedup_key, processedAt) VALUES (?, ?)'
  ).run(dedupKey, new Date().toISOString());
  db.prepare(`
    DELETE FROM processed_webhook_events WHERE dedup_key IN (
      SELECT dedup_key FROM processed_webhook_events ORDER BY processedAt DESC LIMIT -1 OFFSET 5000
    )
  `).run();
  return false;
}
