/**
 * SQLite persistence layer (Node built-in node:sqlite - no external dependency).
 * Stores orders, escalations, conversations and webhook logs so data survives restarts.
 */
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(dataDir, 'agent.db');

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT 'WhatsApp',
    plan TEXT NOT NULL,
    planId TEXT NOT NULL,
    region TEXT NOT NULL,
    regionId TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'PKR',
    paymentMethod TEXT NOT NULL DEFAULT 'Pending Selection',
    proof TEXT NOT NULL DEFAULT 'Pending',
    ownerVerification TEXT NOT NULL DEFAULT 'Pending',
    orderStatus TEXT NOT NULL DEFAULT 'Payment Pending',
    rdpDelivered TEXT NOT NULL DEFAULT 'No',
    rdpIp TEXT NOT NULL DEFAULT '',
    activation TEXT NOT NULL DEFAULT '',
    renewal TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS escalations (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL,
    customerName TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'WhatsApp',
    type TEXT NOT NULL,
    priority TEXT NOT NULL,
    reason TEXT NOT NULL,
    actionRequired TEXT NOT NULL,
    originalMessage TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_OWNER_REVIEW',
    ownerActionTaken TEXT,
    dispatchedMessage TEXT,
    resolutionNotes TEXT,
    timestamp TEXT NOT NULL,
    resolvedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS conversations (
    sessionId TEXT PRIMARY KEY,
    channel TEXT NOT NULL DEFAULT 'WhatsApp',
    history TEXT NOT NULL DEFAULT '[]',
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS webhook_logs (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    sender TEXT NOT NULL,
    senderId TEXT NOT NULL,
    inboundText TEXT,
    outboundText TEXT,
    intent TEXT,
    escalation TEXT,
    simulated INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS processed_webhook_events (
    dedup_key TEXT PRIMARY KEY,
    processedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gemini_cache (
    query_hash TEXT PRIMARY KEY,
    answer TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gemini_usage (
    day TEXT PRIMARY KEY,
    calls INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS broadcasts (
    id TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL,
    contactName TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT 'WhatsApp',
    templateName TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT NOT NULL DEFAULT '',
    metaMessageId TEXT NOT NULL DEFAULT '',
    sentAt TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcasts_session ON broadcasts(sessionId, templateName);
`);

// --- Lightweight, idempotent migrations ---
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

ensureColumn('conversations', 'contactName', 'contactName TEXT NOT NULL DEFAULT \'Customer\'');
ensureColumn('conversations', 'senderId', 'senderId TEXT NOT NULL DEFAULT \'\'');
ensureColumn('conversations', 'analysis', 'analysis TEXT');
ensureColumn('conversations', 'aiPaused', 'aiPaused INTEGER NOT NULL DEFAULT 0');
ensureColumn('conversations', 'notes', 'notes TEXT NOT NULL DEFAULT \'\'');
ensureColumn('webhook_logs', 'delivered', 'delivered INTEGER NOT NULL DEFAULT 0');
