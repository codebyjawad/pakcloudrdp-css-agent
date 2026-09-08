/**
 * Conversation store - SQLite backed.
 * Persists message history per session so it survives restarts.
 */
import { db } from './db.js';
import crypto from 'crypto';

const MAX_HISTORY = 200;

const GET = db.prepare('SELECT * FROM conversations WHERE sessionId = ?');
const UPSERT = db.prepare(`
  INSERT INTO conversations (sessionId, channel, history, contactName, senderId, updatedAt)
  VALUES (@sessionId, @channel, @history, @contactName, @senderId, @updatedAt)
  ON CONFLICT(sessionId) DO UPDATE SET
    channel=@channel, history=@history, contactName=@contactName,
    senderId=@senderId, updatedAt=@updatedAt
`);
const DELETE = db.prepare('DELETE FROM conversations WHERE sessionId = ?');
const UPDATE_META = db.prepare(
  'UPDATE conversations SET contactName=@contactName, senderId=@senderId WHERE sessionId=@sessionId'
);
const UPDATE_ANALYSIS = db.prepare(
  'UPDATE conversations SET analysis=@analysis, updatedAt=updatedAt WHERE sessionId=@sessionId'
);
const UPDATE_AI_PAUSED = db.prepare(
  'UPDATE conversations SET aiPaused=@aiPaused WHERE sessionId=@sessionId'
);
const UPDATE_NOTES = db.prepare(
  'UPDATE conversations SET notes=@notes WHERE sessionId=@sessionId'
);
const GET_NOTES = db.prepare('SELECT notes FROM conversations WHERE sessionId = ?');
const GET_AI_PAUSED = db.prepare('SELECT aiPaused FROM conversations WHERE sessionId = ?');

export const conversationStore = {
  get(sessionId) {
    if (!sessionId) return [];
    const row = GET.get(sessionId);
    if (!row) return [];
    try {
      const arr = JSON.parse(row.history);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  },

  /**
   * List all conversations (chats) ordered by most recent, with a lightweight
   * preview (last message + time + contact name + count).
   */
  list() {
    const rows = db.prepare('SELECT * FROM conversations ORDER BY updatedAt DESC').all();
    return rows.map((r) => {
      let history = [];
      try { history = JSON.parse(r.history); } catch { history = []; }
      const last = history[history.length - 1] || null;
      const customerCount = history.filter((m) => m.sender === 'user').length;
      const aiCount = history.filter((m) => m.sender === 'agent').length;
      return {
        sessionId: r.sessionId,
        channel: r.channel || 'WhatsApp',
        contactName: r.contactName || 'Customer',
        senderId: r.senderId || r.sessionId,
        aiPaused: Boolean(r.aiPaused),
        notes: r.notes || '',
        messageCount: history.length,
        customerCount,
        aiCount,
        lastMessage: last ? last.text : '',
        lastSender: last ? last.sender : '',
        lastTime: r.updatedAt || last?.timestamp || ''
      };
    });
  },

  getMeta(sessionId) {
    const row = GET.get(sessionId);
    if (!row) return { contactName: 'Customer', senderId: '', notes: '' };
    return {
      contactName: row.contactName || 'Customer',
      senderId: row.senderId || '',
      channel: row.channel || 'WhatsApp',
      notes: row.notes || ''
    };
  },

  setMeta(sessionId, { contactName, senderId } = {}) {
    const cur = this.getMeta(sessionId);
    UPDATE_META.run({
      sessionId,
      contactName: contactName || cur.contactName || 'Customer',
      senderId: senderId || cur.senderId || ''
    });
  },

  /**
   * Return the stored AI profit-coach analysis for this chat, or null.
   * Shape: { fingerprint, analyzedAt, stage, signals[], objections[], upsell, suggestions[] }
   */
  getAnalysis(sessionId) {
    const row = GET.get(sessionId);
    if (!row || !row.analysis) return null;
    try { return JSON.parse(row.analysis); } catch { return null; }
  },

  /** Persist the analysis object for this chat. */
  setAnalysis(sessionId, analysis) {
    UPDATE_ANALYSIS.run({ sessionId, analysis: JSON.stringify(analysis) });
  },

  /** Check if AI is paused for this chat. */
  isAiPaused(sessionId) {
    const row = GET_AI_PAUSED.get(sessionId);
    return row ? Boolean(row.aiPaused) : false;
  },

  /** Toggle or set AI pause state for this chat. Returns new state. */
  setAiPaused(sessionId, paused) {
    UPDATE_AI_PAUSED.run({ sessionId, aiPaused: paused ? 1 : 0 });
    return Boolean(paused);
  },

  /** Get the owner note for a chat (empty string if none). */
  getNotes(sessionId) {
    const row = GET_NOTES.get(sessionId);
    return row ? (row.notes || '') : '';
  },

  /** Persist the owner note for a chat. Returns the new note text. */
  setNotes(sessionId, notes) {
    UPDATE_NOTES.run({ sessionId, notes: notes || '' });
    return notes || '';
  },

  /**
   * Deterministic fingerprint of the full (normalized) conversation. Any change
   * in message text or sender changes the fingerprint, so re-analysis only
   * happens when the chat actually changed — reopening an unchanged chat is free.
   */
  fingerprint(sessionId) {
    const history = this.get(sessionId);
    const norm = history
      .map((m) => `${m.timestamp || ''}|${m.sender}|${String(m.text || '')}`)
      .join('~~~');
    return crypto.createHash('sha256').update(norm).digest('hex');
  },

  /**
   * push a new message. Returns the new full history.
   */
  push(sessionId, message, channelOrOpts = {}) {
    const opts = typeof channelOrOpts === 'string' ? { channel: channelOrOpts } : (channelOrOpts || {});
    const channel = opts.channel || 'WhatsApp';
    const history = this.get(sessionId);
    const msg = { ...message, id: message.id || this._id() };
    history.push(msg);
    const trimmed = history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
    UPSERT.run({
      sessionId,
      channel,
      history: JSON.stringify(trimmed),
      contactName: opts.contactName || this.getMeta(sessionId).contactName,
      senderId: opts.senderId || this.getMeta(sessionId).senderId,
      updatedAt: new Date().toISOString()
    });
    return trimmed;
  },

  /**
   * Update fields (e.g. deliveryStatus, deliveryError) on a specific message by id.
   */
  updateMessage(sessionId, messageId, patch = {}) {
    const history = this.get(sessionId);
    let found = false;
    for (let i = 0; i < history.length; i++) {
      if (history[i].id === messageId) {
        Object.assign(history[i], patch);
        found = true;
        break;
      }
    }
    if (!found) return null;
    const meta = this.getMeta(sessionId);
    UPSERT.run({
      sessionId,
      channel: meta.channel || 'WhatsApp',
      history: JSON.stringify(history),
      contactName: meta.contactName,
      senderId: meta.senderId,
      updatedAt: new Date().toISOString()
    });
    return history;
  },

  /**
   * Edit (correct) a specific message by id. Returns the updated history, or
   * null if the message id was not found.
   */
  editMessage(sessionId, messageId, newText) {
    const history = this.get(sessionId);
    let found = false;
    for (let i = 0; i < history.length; i++) {
      if (history[i].id === messageId) {
        history[i].text = newText;
        history[i].corrected = true;
        found = true;
        break;
      }
    }
    if (!found) return null;
    const meta = this.getMeta(sessionId);
    UPSERT.run({
      sessionId,
      channel: meta.channel || 'WhatsApp',
      history: JSON.stringify(history),
      contactName: meta.contactName,
      senderId: meta.senderId,
      updatedAt: new Date().toISOString()
    });
    return history;
  },

  set(sessionId, history, channel = 'WhatsApp') {
    const trimmed = history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
    const meta = this.getMeta(sessionId);
    UPSERT.run({
      sessionId,
      channel,
      history: JSON.stringify(trimmed),
      contactName: meta.contactName,
      senderId: meta.senderId,
      updatedAt: new Date().toISOString()
    });
    return trimmed;
  },

  clear(sessionId) {
    return DELETE.run(sessionId).changes > 0;
  },

  /**
   * Seed a minimal chat row if it doesn't already exist. Used by the Meta sync
   * backfill so a conversation Meta reports is never silently missing from the
   * inbox, even if we have no captured message text yet.
   * Returns 'exists', 'created', or 'ignored'.
   */
  seedIfMissing(sessionId, { contactName = 'Customer', senderId = '', channel = 'WhatsApp', lastTime = null } = {}) {
    if (!sessionId) return 'ignored';
    const existing = GET.get(sessionId);
    if (existing) return 'exists';
    const now = new Date().toISOString();
    UPSERT.run({
      sessionId,
      channel,
      history: JSON.stringify([{
        id: 'sys_' + this._id(),
        sender: 'system',
        text: 'Conversation synced from Meta — no message text yet. New messages will appear here automatically.',
        timestamp: lastTime || now
      }]),
      contactName,
      senderId: senderId || sessionId,
      updatedAt: lastTime || now
    });
    return 'created';
  },

  _id() {
    return 'm_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
  }
};
