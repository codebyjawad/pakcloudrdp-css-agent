/**
 * Big Pickle fallback AI service — powered by the free opencode Zen tier.
 *
 * When Gemini is unavailable, rate-limited, or returns unparseable output, the
 * helpdesk replies and the sales "coach" fall back to a free Zen model
 * (default `big-pickle`) via the documented OpenAI-compatible endpoint.
 *
 * The Zen gateway serves the free (`*-free` / big-pickle) models from the
 * "Console" profile, which requires the request to present the same client
 * fingerprint the official OpenCode client uses:
 *   - `User-Agent: opencode/<version>`
 *   - a stable `x-opencode-session` id (also gives sticky provider routing)
 * Without the session header the gateway returns `MissingSessionID:
 * free tier can only be used in OpenCode`.
 *
 * Paid/balance-backed models are not gated by the fingerprint, but this
 * workspace has no payment method yet, so only the free models are used.
 *
 * Produces the same structured shape as GeminiService.analyzeForNextMessage:
 *   { stage, signals[], objections[], upsell, suggestions[] }
 */
import { createRequire } from 'module';
import { CUSTOMER_SYS_PROMPT } from '../config/aiPrompts.js';

const require = createRequire(import.meta.url);
const sharedConfig = require('/root/projects/agents/config.js');
const ZEN_AI = (sharedConfig && sharedConfig.ai) || {};

const BASE_URL = process.env.OPENCODE_ZEN_BASE_URL || ZEN_AI.baseUrl || 'https://opencode.ai/zen/v1';
const API_KEY = process.env.OPENCODE_ZEN_API_KEY || ZEN_AI.apiKey || '';
const CLIENT_VERSION = process.env.OPENCODE_ZEN_VERSION || '1.18.29';
const SESSION_ID = process.env.OPENCODE_ZEN_SESSION || 'pakcloud-rdp-agent';
const MODELS = [
  process.env.OPENCODE_ZEN_MODEL || 'big-pickle',
  'mimo-v2.5-free',
  'nemotron-3-ultra-free',
];
const DEFAULT_TIMEOUT_MS = Number(process.env.OPENCODE_ZEN_TIMEOUT_MS) || 30000;
const BREAKER_CONSECUTIVE_FAILURES = 3;
const BREAKER_COOLDOWN_MS = Number(process.env.OPENCODE_ZEN_COOLDOWN_MS) || 10 * 60 * 1000;

const SYS_PROMPT =
  'You are the sales manager for PakCloudRDP, a managed dedicated Windows RDP provider. ' +
  'Analyze the FULL customer transcript and tell the owner exactly what to type NEXT to close a ' +
  'profitable sale. Output ONLY a JSON object (no markdown, no extra text) with EXACTLY these keys:\n' +
  '{\n' +
  '  "stage": one of "WELCOME","INTEREST","COMPARISON","DECISION","NEGOTIATION","PAYMENT","OBJECTION","SUPPORT","DORMANT",\n' +
  '  "signals": [short strings describing why this customer may buy],\n' +
  '  "objections": [short strings describing what is blocking them],\n' +
  '  "upsell": one concise line on the most profitable next offer (exact plan name + exact PKR price from CONTEXT; never invent), or "no upsell window yet",\n' +
  '  "suggestions": [EXACTLY 3 SHORT READY-TO-SEND messages, under 45 words each, in the customer language, that advance the sale]\n' +
  '}\n' +
  'HARD RULES: 1) Use ONLY prices/plans/policies from CONTEXT. 2) Never promise refunds, discounts, or 100% uptime. ' +
  '3) If a discount/refund is appropriate, note that it requires owner approval. 4) Match the customer language (Roman Urdu / English / mixed). ' +
  '5) Suggestions must be CONCRETE, natural, ready-to-send messages the owner can copy verbatim (never coaching advice like "ask them X").';

class BigPickleService {
  constructor() {
    this.enabled = Boolean(API_KEY);
    this._chain = Promise.resolve();
    this._consecutiveFailures = 0;
    this._cooldownUntil = 0;
    this._deadModels = new Set();
  }

  isConfigured() {
    if (!this.enabled) return false;
    if (this._cooldownUntil > Date.now()) return false;
    return true;
  }

  _markSuccess() {
    this._consecutiveFailures = 0;
  }

  _markFailure() {
    this._consecutiveFailures += 1;
    if (this._consecutiveFailures >= BREAKER_CONSECUTIVE_FAILURES) {
      this._cooldownUntil = Date.now() + BREAKER_COOLDOWN_MS;
      console.warn(
        '[BigPickle] ' + BREAKER_CONSECUTIVE_FAILURES + ' consecutive failures — opencode zen ' +
        'suspended for ' + (BREAKER_COOLDOWN_MS / 60000) + ' min (falls through to Gemini/canned).'
      );
      this._consecutiveFailures = 0;
    }
  }

  /**
   * One chat-completions call to the Zen HTTP API. Tries each free model in
   * order until one returns usable text. Serialized so free-tier sessions
   * never contend.
   */
  _run(systemPrompt, userPrompt) {
    if (!this.isConfigured()) return Promise.resolve(null);
    const run = this._chain.then(() => this._callApi(systemPrompt, userPrompt));
    this._chain = run.catch(() => {});
    return run;
  }

  async _callApi(systemPrompt, userPrompt) {
    const budgetMs = Number(process.env.OPENCODE_ZEN_TOTAL_BUDGET_MS) || 25000;
    const deadline = Date.now() + budgetMs;
    const models = MODELS.filter((m) => !this._deadModels.has(m));
    if (!models.length) {
      this._markFailure();
      throw new Error('all opencode zen models are banned');
    }
    let lastErr = null;
    for (const model of models) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      try {
        const text = await this._chatOnce(model, systemPrompt, userPrompt, remaining);
        if (text) {
          this._markSuccess();
          return text;
        }
        lastErr = new Error(model + ' returned empty text');
      } catch (err) {
        lastErr = err;
      }
    }
    this._markFailure();
    throw lastErr || new Error('all opencode zen models failed');
  }

  async _chatOnce(model, systemPrompt, userPrompt, remaining) {
    const timeoutMs = Math.max(1500, Math.min(remaining || DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(BASE_URL + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + API_KEY,
          'User-Agent': 'opencode/' + CLIENT_VERSION,
          'x-opencode-session': SESSION_ID,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 2000,
          temperature: 0.4,
        }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const errType = body && body.error ? body.error.type : '';
        const errMsg = body && body.error ? body.error.message : (res.statusText || res.status);
        const combined = (errType ? errType + ': ' : '') + String(errMsg).slice(0, 160);
        if (/MissingSessionID|Model is unavailable|Model not found|not deployed|inaccessible|server_error/i.test(combined)) {
          this._deadModels.add(model);
        }
        throw new Error(combined);
      }
      const text = (body && body.choices && body.choices[0] && body.choices[0].message &&
                    body.choices[0].message.content || '').trim();
      return text || null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Sales-coach analysis. Returns the structured object or null.
   */
  async analyzeForNextMessage(kb, history) {
    if (!this.isConfigured()) return null;
    const transcript = (history || [])
      .map((m) => {
        const who = m.sender === 'user' ? 'CUSTOMER' : (m.sender === 'agent' ? 'AI' : 'OWNER');
        return who + ': ' + (m.text || '');
      })
      .join('\n');

    const plans = (kb.plans || []).map((p) => `${p.name}: ${p.vcpu}/${p.ram}/${p.nvme}`).join('; ');
    const prices = Object.entries(kb.priceMatrix || {})
      .slice(0, 12)
      .map(([plan, byRegion]) => `${plan}: ${Object.entries(byRegion).map(([r, a]) => `${r} R${a}`).join(', ')}`)
      .join(' | ');
    const payAccts = (kb.payment?.accounts || [])
      .map((a) => `${a.method}: ${a.number || a.accountNumber || a.id || a.iban}`)
      .join(' | ');

    const user =
      'CONTEXT (use this ONLY):\nPLANS: ' + plans + '\nPRICES (PKR monthly): ' + prices +
      '\nNETWORK: 1 Gbps uplink, unmetered; typical sustained speed ~200-500 Mbps (Fair Use on multi-TB heavy transfer).' +
      '\nPOLICIES: prices fixed; never promise refunds/discounts/uptime; support 9 AM-12 AM PKT (target <15 min); deliver ~30 min after owner verifies payment; renewal monthly, suspends on expiry, 7-day data window; multiple machines allowed (no auto bulk discount).' +
      '\nPAYMENT ACCOUNTS (share EXACTLY these when the customer is ready to pay): ' + (payAccts || 'N/A') +
      '\n------------------------------\nFULL CUSTOMER TRANSCRIPT (oldest to newest):\n' + (transcript || '(empty)');

    try {
      const text = await this._run(SYS_PROMPT, user);
      if (!text) return null;
      const parsed = this._parse(text);
      if (parsed) console.log('[BigPickle] coach analysis OK.');
      return parsed;
    } catch (err) {
      console.warn('[BigPickle] coach fallback error:', err.message);
      return null;
    }
  }

  /**
   * Warm, KB-constrained customer reply (WhatsApp). Returns { ok, text } or null.
   */
  async generateCustomerReply(kb, userMessage, history = []) {
    if (!this.isConfigured()) return null;

    const transcript = (history || [])
      .map((m) => {
        const who = m.sender === 'user' ? 'CUSTOMER' : (m.sender === 'agent' ? 'ASSISTANT' : 'OWNER');
        return who + ': ' + (m.text || '');
      })
      .filter(Boolean)
      .join('\n');

    const plans = (kb.plans || []).map((p) => `${p.name}: ${p.vcpu}/${p.ram}/${p.nvme}`).join('; ');
    const prices = Object.entries(kb.priceMatrix || {})
      .slice(0, 12)
      .map(([plan, byRegion]) => `${plan}: ${Object.entries(byRegion).map(([r, a]) => `${r} R${a}`).join(', ')}`)
      .join(' | ');
    const payAccts = (kb.payment?.accounts || [])
      .map((a) => `${a.method}: ${a.number || a.accountNumber || a.id || a.iban}${a.title ? ' (' + a.title + ')' : ''}`)
      .join(' | ');

    const user =
      'CONTEXT (use this ONLY):\nPLANS: ' + plans + '\nPRICES (PKR monthly): ' + prices +
      '\nNETWORK: 1 Gbps uplink, unmetered; typical sustained speed ~200-500 Mbps (Fair Use on multi-TB heavy transfer).' +
      '\nPOLICIES: prices fixed; never promise refunds/discounts/uptime; support 9 AM-12 AM PKT (target <15 min); deliver ~30 min after owner verifies payment; renewal monthly, suspends on expiry, 7-day data window; multiple machines allowed (no auto bulk discount).' +
      '\nPAYMENT ACCOUNTS (use these EXACT details when giving payment info): ' + (payAccts || 'N/A') +
      '\n------------------------------\n' +
      (transcript
        ? 'PREVIOUS CONVERSATION WITH THIS CUSTOMER (oldest to newest):\n' + transcript + '\n------------------------------\n'
        : '') +
      'LATEST CUSTOMER MESSAGE:\n' + userMessage;

    try {
      const text = await this._run(CUSTOMER_SYS_PROMPT, user);
      if (!text) return null;
      console.log('[BigPickle] opencode customer reply OK.');
      return { ok: true, text };
    } catch (err) {
      console.warn('[BigPickle] opencode customer reply error:', err.message);
      return null;
    }
  }

  _parse(text) {
    const cleaned = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    let obj;
    try { obj = JSON.parse(cleaned); }
    catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) return null;
      try { obj = JSON.parse(m[0]); } catch { return null; }
    }
    if (!obj || typeof obj !== 'object') return null;

    const suggestions = (Array.isArray(obj.suggestions) ? obj.suggestions : [])
      .map((s) => String(s).trim()).filter((s) => s.length > 2).slice(0, 3);
    if (!suggestions.length) return null;

    return {
      stage: String(obj.stage || 'INTEREST'),
      signals: Array.isArray(obj.signals) ? obj.signals.slice(0, 6).map(String) : [],
      objections: Array.isArray(obj.objections) ? obj.objections.slice(0, 6).map(String) : [],
      upsell: String(obj.upsell || ''),
      suggestions,
      usedFallback: false
    };
  }
}

export const bigPickleService = new BigPickleService();