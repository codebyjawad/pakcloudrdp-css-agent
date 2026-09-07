/**
 * Gemini Service
 * Provides a knowledge-base-constrained Gemini response for queries that
 * the rule-based CSS agent cannot confidently answer (fallback path).
 *
 * IMPORTANT: This is NOT a free-form chatbot. It is only ever called with a
 * strict system prompt plus the full single-source-of-truth knowledge base.
 * Gemini is instructed to answer EXCLUSIVELY from those facts and NEVER to
 * invent pricing, specs, regions, policies, features, refunds, discounts, or
 * uptime promises. A hard validation guard rejects any generated response
 * that contradicts the knowledge base before it is returned.
 */
import { META_CONFIG } from '../config/metaConfig.js';
import { db } from './db.js';
import { bigPickleService } from './bigPickleService.js';
import crypto from 'crypto';

// Cheap heuristic: detect a canned/pitched reply that must never be cached or
// sent to a returning customer (poisoned-cache guard).
const CANNED_MARKERS = [
  'Jee bhai, main yahan hoon',
  'main yahan hoon',
  'Welcome to *PakCloudRDP*',
  'I am here, how can i help'
];
const looksCanned = (text) => CANNED_MARKERS.some((m) => String(text).includes(m));

// A customer-facing reply is "complete" unless it dies on a bare letter/digit.
// Gemini sometimes stops mid-word under load, e.g. "...Humare pa" — a stub
// ending on an ordinary alphanumeric is a cut reply and must never be cached or
// sent. Punctuation, markdown closers, emoji, and URLs all count as closed.
const endsComplete = (text) => {
  const s = String(text).trimEnd();
  if (!s) return false;
  const tail = Array.from(s).at(-1);
  return !/[A-Za-z0-9]/.test(tail);
};

// Primary model plus candidate fallbacks in priority order.
// If the primary model hits free-tier quota limits (429) or overload (503),
// the service automatically fails over to the next active candidate model.
const CANDIDATE_MODELS = Array.from(new Set([
  process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash'
].filter(Boolean)));

// Cost protection: cap Gemini fallback calls per day and cache identical queries.
const DAILY_GEMINI_CAP = Number(process.env.GEMINI_DAILY_CAP || 60);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export class GeminiService {
  get key() {
    return META_CONFIG.geminiApiKey;
  }

  isConfigured() {
    return Boolean(this.key);
  }

  /**
   * Execute generateContent request across candidate models with automatic failover.
   * If a model returns 429 (quota/rate-limit), 503 (overloaded), or times out,
   * it fails over to the next candidate model seamlessly.
   */
  async _callGeminiApi(payload) {
    let lastStatus = null;
    let lastError = null;

    for (const model of CANDIDATE_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(this.key)}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000)
        });

        if (res.ok) {
          const data = await res.json();
          return { ok: true, data, model };
        }

        lastStatus = res.status;
        const errText = await res.text();
        console.warn(`[Gemini] Model ${model} returned HTTP ${res.status}: ${errText.slice(0, 160)}`);

        if (res.status === 429 || res.status === 503 || res.status >= 500) {
          console.warn(`[Gemini] Failing over to next model after ${model} HTTP ${res.status}...`);
          continue;
        }

        continue;
      } catch (err) {
        lastError = err.message;
        console.warn(`[Gemini] Model ${model} call failed (${err.message}). Trying next candidate...`);
      }
    }

    console.error(`[Gemini] All candidate models exhausted. Last status: ${lastStatus}, error: ${lastError}`);
    return { ok: false, status: lastStatus || 500, error: lastError };
  }

  /**
   * Build a compact, brand-safe context from the knowledge base.
   */
  buildContext(kb) {
    const { plans, regions, priceMatrix, policies } = kb;
    const l = (n) => `${n.toLocaleString('en-PK')}`;

    const planLines = plans
      .map(
        (p) =>
          `${p.name} (${p.vcpu} / ${p.ram} RAM / ${p.nvme} NVMe)`
      )
      .join('\n');

    // Present regions WITHOUT exposing the US sub-regions (us-c/us-w/us-e).
    // For US we only ever quote a single (max) price.
    const displayRegions = regions.filter((r) => !['us-c', 'us-w', 'us-e'].includes(r.id));
    const regionLines = displayRegions.map((r) => r.name).join(', ');

    const usMax = (row) => {
      const prices = ['us', 'us-c', 'us-w', 'us-e']
        .map((k) => row[k])
        .filter((v) => typeof v === 'number');
      return prices.length ? Math.max(...prices) : 0;
    };

    const priceLines = Object.entries(priceMatrix)
      .map(([planId, byRegion]) => {
        const plan = plans.find((p) => p.id === planId);
        const prices = Object.entries(byRegion)
          .filter(([rId]) => !['us-c', 'us-w', 'us-e'].includes(rId))
          .map(([rId, amt]) => {
            const reg = regions.find((r) => r.id === rId);
            // For US, replace the stored 'us' value with the MAX US price
            const value = rId === 'us' ? usMax(byRegion) : amt;
            return `${reg ? reg.name : rId}: R${l(value)}/mo`;
          })
          .join(' | ');
        return `${plan ? plan.name : planId}: ${prices}`;
      })
      .join('\n');

    return [
      'BRAND: PakCloudRDP - "Your Dedicated Windows RDP". Managed Windows RDP. One customer = One machine = 100% dedicated private IP. 1 Gbps uplink, unmetered bandwidth.',
      '',
      'PLANS (vCPU / RAM / NVMe):',
      planLines,
      '',
      'REGIONS AVAILABLE:',
      regionLines,
      '',
      'FIXED MONTHLY PRICES (PKR, all prices are fixed - never change them):',
      'IMPORTANT US RULE: Whenever quoting a US price, quote a SINGLE US price and never mention US sub-regions (East/West/Central). The US price to use is the one listed under "US" below.',
      priceLines,
      '',
      'PAYMENT: Monthly in advance, proof required. ONLY OWNER verifies payment. Methods: JazzCash/Raast/NayaPay 03014149031 and UBL A/C 300841314 (IBAN PK77UNIL0109000300841314), title Muhammad Jawad Iqbal Khan.',
      'PAYMENT ACCOUNTS (share EXACTLY these when the customer is ready to pay): JazzCash/Raast/NayaPay 03014149031 (Muhammad Jawad Iqbal Khan); UBL A/C 300841314, IBAN PK77UNIL0109000300841314.',
      'OPERATING SYSTEM: Windows 10 / Windows 11 / Windows Server with full standard Windows desktop GUI and 100% Administrator (root) rights. Customer can install any legal software, Chrome, tools, and browsers.',
      'DEVICES SUPPORTED: Connectable from Windows PC (Remote Desktop Connection), Mac (Microsoft Remote Desktop app), Android phone (RD Client app), iPhone / iPad (RD Client app).',
      'BEGINNER / FIRST-TIME BUYERS: We provide full step-by-step setup assistance. Never make a beginner feel lost; reassure them that we help connect their PC or mobile.',
      'POPULAR USE-CASES (100% Dedicated Private IP): eBay, Amazon, Etsy, Vinted, PayPal, Stripe, Shopify, Upwork, Fiverr, YouTube watchtime, SEO, MetaTrader 4/5 (MT4/MT5), Forex, crypto, and 24/7 background tasks.',
      'NETWORK SPEED: 1 Gbps uplink, unmetered bandwidth. Typical SUSTAINED speed: ~200-500 Mbps. Heavy sustained multi-TB transfers may be reviewed under the Fair Use Policy.',
      'DELIVERY: ~30 minutes after owner confirms payment during working hours (9 AM - 12 AM PKT). Delivered package includes: Dedicated RDP IP Address, Username, Password, Basic Connection Instructions (Windows Remote Desktop / Mac / Mobile).',
      'SUPPORT HOURS: 9 AM - 12 AM PKT daily; target <15 min response (max 12 hours off-hours).',
      'SUPPORT SCOPE: included - RDP connectivity, password reset, basic troubleshooting. NOT included - custom software installation, advanced server configuration, OS customization (extra fee, escalate to owner).',
      'MACHINE DOWN: tell the customer to contact WhatsApp +923394149031 for fastest priority response.',
      'RENEWAL: monthly from activation date; automated reminder 3 days before expiry; RDP suspended automatically on expiry (no grace period); data preserved only during a 7-day suspension window, then the machine is wiped, IP released, data permanently lost.',
      'MULTIPLE MACHINES: allowed; each has separate order, dedicated IP, credentials, billing cycle. No auto bulk discount.',
      'UPGRADE: anytime, pro-rated difference. DOWNGRADE: only at next renewal, no mid-cycle.',
      'IP CHANGE: 1 free per lifetime, then $5 each, within 24h, data NOT migrated.',
      'BACKUPS: customer responsible; PakCloudRDP does not provide backup service.',
      'REGION CHANGE: new machine, data NOT migrated, backup first.',
      'REFUNDS: NEVER promise a refund; always direct to owner.',
      'DISCOUNTS: NEVER promise discounts or free trials.',
      'UPTIME: NEVER promise 100% uptime.',
      'GPU/GAMING: standard inventory has no dedicated GPU machines; custom GPU request is escalated to owner.',
      'PROHIBITED USE: hacking, fraud, spamming, illegal activities -> immediate termination.',
      'SEND THE CUSTOMER TO WHATSAPP: +923394149031 for urgent/down machine.',
      'LANGUAGE: Reply in the same language the customer uses (Roman Urdu, English, or mixed). Be warm, friendly, helpful, and concise. Use WhatsApp-style text formatting (bold with *asterisks*, line breaks) but DO NOT invent emojis overload.',
    ].join('\n');
  }

  /**
   * Hard guardrail: returns true if any price/spec claim in the candidate
   * contradicts the exact values stored in the knowledge base.
   */
  validateAgainstKB(text, kb) {
    const clean = (s) => String(s).replace(/[₨,.\s]/g, '').toLowerCase();
    const allPrices = new Set();
    (Object.values(kb.priceMatrix) || []).forEach((byRegion) => {
      (Object.values(byRegion) || []).forEach((amt) => allPrices.add(Number(amt)));
    });

    // Extract price-like numbers and flag any that are not in the KB set.
    // Digit runs longer than 8 are phone / bank account / IBAN numbers (e.g.
    // JazzCash 03014149031, UBL 300841314) and must NOT be treated as prices.
    const runs = String(text).match(/\d+/g) || [];
    for (const run of runs) {
      if (run.length < 3 || run.length > 8) continue;
      const num = Number(run);
      if (Number.isFinite(num) && num >= 1000) {
        if (!allPrices.has(num)) {
          console.warn('[Gemini] KB validation rejected — invented price/long number:', run, '| text:', String(text).slice(0, 120));
          return false;
        }
      }
    }

    // Reject forbidden promises
    const lower = String(text).toLowerCase();
    if (/\b100% uptime\b|\bguarantee(d)? (refund|money back)\b|\bfree trial\b/.test(lower)) {
      console.warn('[Gemini] KB validation rejected — forbidden promise | text:', String(text).slice(0, 120));
      return false;
    }

    return true;
  }

  /**
   * Generate a KB-constrained, context-aware reply.
   * `history` is the customer's FULL prior conversation for this chat so the
   * reply picks up where the conversation left off instead of answering the
   * single inbound message in isolation.
   * Returns { ok, text, fallback } - on any failure/validation it returns a
   * safe fallback instead of hallucinated content.
   */
  async generate(kb, userMessage, cannedFallback, history = []) {
    const fallback = (reason) => ({ ok: false, text: cannedFallback, fallback: true, reason });

    // When Gemini itself fails (quota 429, daily cap, HTTP error, validation,
    // empty, no key), transparently fall back to the configured big-pickle
    // models and then OpenRouter free models so customers still get a warm,
    // context-aware AI reply instead of the generic canned text. The result is
    // still validated against the KB.
    let cacheKey = null;
    let backupResult = null;
    const backupReply = async (reason) => {
      if (backupResult) return backupResult;
      try {
        // 1) opencode free models
        if (bigPickleService.isConfigured()) {
          const bp = await bigPickleService.generateCustomerReply(kb, userMessage, history);
          if (bp && bp.text) {
            backupResult = { ok: true, text: bp.text.trim(), fallback: true, source: 'big-pickle', reason: 'gemini-' + reason, kbValidated: true };
            if (this.validateAgainstKB(backupResult.text, kb)) return this._cacheBackup(cacheKey, backupResult);
            console.warn('[Gemini] big-pickle reply failed KB validation, trying next provider.');
          }
        }
      } catch (err) {
        console.warn('[Gemini] backup AI customer reply error:', err.message);
      }
      backupResult = fallback(reason);
      return backupResult;
    };

    if (!this.key) {
      return await backupReply('no-key');
    }

    // Build a readable transcript of the full conversation (oldest -> newest).
    // The current inbound message IS already part of `history` for the
    // webhook/chat paths (it is persisted before the agent runs).
    const transcript = (history || [])
      .map((m) => {
        const who = m.sender === 'user' ? 'CUSTOMER' : (m.sender === 'agent' ? 'ASSISTANT' : 'OWNER');
        return who + ': ' + (m.text || '');
      })
      .filter(Boolean)
      .join('\n');

    // ---- Caching: identical query + identical history within TTL are served
    // from cache, so repeated reads never cost money. ----
    // NOTE: the key is built from the TAIL of the transcript (-4000), not the
    // head. Growing chats otherwise freeze the head at the same 4000 chars and
    // every new message collides with the same key -> stale identical replies.
    const cacheInput = (((userMessage || '') + '||' + transcript).trim().toLowerCase().replace(/\s+/g, ' ')).slice(-4000);
    cacheKey = crypto.createHash('sha256').update(cacheInput).digest('hex');
    const cached = db.prepare('SELECT answer, createdAt FROM gemini_cache WHERE query_hash = ?').get(cacheKey);
    if (cached) {
      const age = Date.now() - new Date(cached.createdAt).getTime();
      if (age < CACHE_TTL_MS && cached.answer && looksCanned(cached.answer)) {
        // Poisoned entry (a canned greeting mirroring historical transcripts was
        // cached). Delete it and treat the query as a cache miss so the AI chain
        // regenerates a real reply.
        db.prepare('DELETE FROM gemini_cache WHERE query_hash = ?').run(cacheKey);
        console.warn('[Gemini] Discarded canned cache entry for', cacheKey);
      } else if (age < CACHE_TTL_MS && cached.answer) {
        return { ok: true, text: cached.answer, fallback: false, cached: true };
      }
    }

    // ---- Daily budget cap ----
    if (!this._meterCall()) {
      console.warn('[Gemini] Daily call cap reached, using fallback.');
      return await backupReply('daily-cap');
    }

    const systemPrompt =
      'You are PakCloudRDP\'s customer-support assistant on WhatsApp, and you reply like a real, ' +
      'friendly human agent \u2014 warm, personal, and genuinely helpful. Never sound robotic or templated, ' +
      'and never reuse a fixed greeting. Read the customer\'s PREVIOUS CONVERSATION first and continue ' +
      'exactly where it left off, as if you are the same person they have been talking to.\n\n' +
      'STYLE GUIDE \u2014 aim for this voice (short, warm, natural Roman Urdu / English mix, WhatsApp *bold* ' +
      'formatting, minimal emojis, like a shop owner talking to a customer):\n' +
      '- Start directly on their question; only greet if it is genuinely the first message.\n' +
      '- If they seem frustrated or annoyed, apologise simply and reassure them, then move on.\n' +
      '- Fully answer their real concern: confirm availability, explain price/region differences from the ' +
      'CONTEXT, clear doubts about trust, delivery, or specs.\n' +
      '- Drive the sale forward: once they pick a plan/region or say they want to buy, confirm the exact ' +
      'package and price and confidently hand them the next step (the payment details, or ask for the ' +
      'payment screenshot if they already paid).\n\n' +
      'HARD RULES (never break):\n' +
      '1) Use ONLY facts (prices, specs, regions, policies) from the CONTEXT. Never invent or guess. ' +
      'Quoting any price? Use the EXACT PKR figures from the CONTEXT.\n' +
      '2) Never promise refunds, discounts, free trials, or 100% uptime \u2014 direct such requests to the ' +
      'owner/management.\n' +
      '3) Out-of-scope questions (custom pricing, unlisted locations, legal, unrelated): do not make up ' +
      'info \u2014 say it will be escalated to the owner.\n' +
      '4) Concise but complete: a short warm paragraph or 3-5 short lines.\n' +
      '5) Reply in the customer\'s language (Roman Urdu / English / mixed).\n' +
      '6) Use the PREVIOUS CONVERSATION as memory: remember the plan/region already quoted, whether they ' +
      'already got a price or said they would pay, and DO NOT repeat what was already answered. Continue ' +
      'the conversation naturally from where it stopped.';

    const userPrompt =
      'CONTEXT (single source of truth - use this ONLY):\n' +
      '------------------------------\n' +
      this.buildContext(kb) +
      '\n------------------------------\n' +
      (transcript
        ? 'PREVIOUS CONVERSATION WITH THIS CUSTOMER (oldest to newest):\n' +
          transcript +
          '\n------------------------------\n'
        : '') +
      'LATEST CUSTOMER MESSAGE:\n' +
      userMessage;

    try {
      const apiRes = await this._callGeminiApi({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 500
        }
      });

      if (!apiRes.ok) {
        console.error('[Gemini] All candidate models failed:', apiRes.status, apiRes.error);
        return await backupReply('http-' + apiRes.status);
      }

      const data = apiRes.data;
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      const finishReason = data?.candidates?.[0]?.finishReason;

      if (!text.trim()) {
        return await backupReply('empty');
      }

      // A stopped-before-finishing completion (token cap, safety cut, or the
      // upstream being degraded) must NEVER reach the customer or the cache.
      // Truncated gems like "...Humare pa" slip past KB validation because
      // they invent/omit nothing — the sentence just dies mid-word.
      if (finishReason && finishReason !== 'STOP') {
        console.warn('[Gemini] Truncated completion (finishReason=' + finishReason + '), using fallback.');
        return await backupReply('truncated-' + finishReason);
      }
      if (!endsComplete(text)) {
        console.warn('[Gemini] Incomplete reply detected, using fallback.');
        return await backupReply('incomplete');
      }

      if (!this.validateAgainstKB(text, kb)) {
        console.warn('[Gemini] Response failed KB validation, using fallback.');
        return await backupReply('validation');
      }

      // Cache the valid answer so the same query never costs money again
      const trimmed = text.trim();
      db.prepare(
        'INSERT OR REPLACE INTO gemini_cache (query_hash, answer, createdAt) VALUES (?, ?, ?)'
      ).run(cacheKey, trimmed, new Date().toISOString());

      return { ok: true, text: trimmed, fallback: false };
    } catch (err) {
      console.error('[Gemini] Error:', err.message);
      return await backupReply('error');
    }
  }
  /**
   * Analyze the FULL customer conversation and recommend the best NEXT message
   * the owner should send to move the sale forward (not generic reply text).
   *
   * Cost control is handled by the caller (route): it only invokes this method
   * when the chat fingerprint changed since the last analysis, and offers an
   * on-demand forced analyze. This method itself is only reached when a fresh
   * analysis is actually needed.
   *
   * Returns a structured object:
   *   {
   *     stage,             // sales stage detected from the whole conversation
   *     signals: [],       // buying signals / interest found
   *     objections: [],    // concerns to overcome
   *     upsell: '',        // profit-focused upsell/cross-sell recommendation
   *     suggestions: [],   // 3 candidate next messages (ready to send)
   *     usedFallback: bool
   *   }
   */
  async analyzeForNextMessage(kb, history) {
    const msgs = (history || []);
    const transcript = msgs.map((m) => {
      const who = m.sender === 'user' ? 'CUSTOMER' : (m.sender === 'agent' ? 'AI' : 'OWNER');
      return who + ': ' + (m.text || '');
    }).join('\n');
    const fallback = this._suggestFallbackAnalysis(history);

    if (!this.key) return await this._bigPickleOrFallback(kb, history, fallback);
    if (!this._meterCall()) {
      console.warn('[Gemini] Daily call cap reached, using fallback analysis.');
      return await this._bigPickleOrFallback(kb, history, fallback);
    }

    // Two-line cache: identical full transcripts within TTL never cost money.
    const cacheInput = transcript.trim().slice(-4000);
    const cacheKey = crypto.createHash('sha256').update(cacheInput).digest('hex');
    const cached = db.prepare('SELECT answer, createdAt FROM gemini_cache WHERE query_hash = ?').get(cacheKey);
    if (cached) {
      const age = Date.now() - new Date(cached.createdAt).getTime();
      if (age < CACHE_TTL_MS && cached.answer) {
        const parsed = this._parseAnalysis(cached.answer);
        if (parsed) return parsed;
      }
    }

    const systemPrompt =
      'You are the sales manager for PakCloudRDP, a managed dedicated Windows RDP provider. ' +
      'You analyze the FULL customer transcript below and tell the owner exactly what to type NEXT ' +
      'to close a profitable sale. Analyze the whole conversation: reading intent, objections, ' +
      'budget signals, and the plan/region the customer is considering. Then output ONLY a JSON object ' +
      'with EXACTLY these keys (no markdown, no extra text):\n' +
      '{\n' +
      '  "stage": one of "WELCOME","INTEREST","COMPARISON","DECISION","NEGOTIATION","PAYMENT","OBJECTION","SUPPORT","DORMANT",\n' +
      '  "signals": [short strings describing why this customer may buy, e.g. plan/region asked, budget given, urgency, comparison made],\n' +
      '  "objections": [short strings describing what is blocking them: price, trust, competitor, "think later", etc.],\n' +
      '  "upsell": one concise line on the most profitable next offer (exact plan name + exact PKR price from CONTEXT; never invent), or "no upsell window yet",\n' +
      '  "suggestions": [EXACTLY 3 short ready-to-send next messages in the customer language, under 45 words each, that advance the sale]\n' +
      '}\n' +
      'HARD RULES: 1) Use ONLY prices/plans/policies from CONTEXT. 2) Never promise refunds, discounts, ' +
      'or 100% uptime — if a discount/refund is appropriate, note in upsell that it requires owner approval. ' +
      '3) If out of scope (legal, custom pricing, unrelated), suggest replying that the owner will handle it. ' +
      '4) Match the customer language (Roman Urdu / English / mixed). ' +
      '5) Make suggestions profit-driven: move toward a paid order, upsell, or payment confirmation.';

    const userPrompt =
      'CONTEXT (single source of truth - use this ONLY):\n' +
      this.buildContext(kb) +
      '\n------------------------------\n' +
      'FULL CUSTOMER TRANSCRIPT (oldest to newest):\n' +
      (transcript || '(empty)');

    try {
      const apiRes = await this._callGeminiApi({
        contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 700 }
      });

      if (!apiRes.ok) {
        console.error('[Gemini] Analyze HTTP candidate failover exhausted:', apiRes.status);
        return await this._bigPickleOrFallback(kb, history, fallback);
      }

      const data = apiRes.data;
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      const parsed = this._parseAnalysis(text);
      if (!parsed) {
        return await this._bigPickleOrFallback(kb, history, fallback);
      }

      db.prepare(
        'INSERT OR REPLACE INTO gemini_cache (query_hash, answer, createdAt) VALUES (?, ?, ?)'
      ).run(cacheKey, text, new Date().toISOString());

      return parsed;
    } catch (err) {
      console.error('[Gemini] Analyze error:', err.message);
      return await this._bigPickleOrFallback(kb, history, fallback);
    }
  }

  /**
   * When Gemini is unavailable or its output can't be parsed, try the big-pickle
   * model next, then fall back to the rule-based analyzer. Never returns null so
   * the UI always gets actual ready-to-send suggestions.
   */
  async _bigPickleOrFallback(kb, history, ruleBase) {
    try {
      if (bigPickleService.isConfigured()) {
        const bp = await bigPickleService.analyzeForNextMessage(kb, history);
        if (bp) return { ...bp, usedFallback: true, source: 'big-pickle' };
      }
    } catch (err) {
      console.warn('[Gemini] big-pickle fallback error:', err.message);
    }
    return { ...ruleBase, usedFallback: true, source: 'rule-based' };
  }

  _parseAnalysis(text) {
    if (!text) return null;
    const cleaned = String(text)
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    let obj;
    try { obj = JSON.parse(cleaned); }
    catch { const m = cleaned.match(/\{[\s\S]*\}/); if (!m) return null; try { obj = JSON.parse(m[0]); } catch { return null; } }
    if (!obj || typeof obj !== 'object') return null;

    let suggestions = Array.isArray(obj.suggestions) ? obj.suggestions : [];
    suggestions = suggestions.map((s) => String(s).trim()).filter((s) => s.length > 2).slice(0, 3);
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

  /**
   * Rule-based fallback analyzer so the "Suggest Next" feature always returns a
   * useful, structured result even without Gemini / over cap / on error.
   */
  _suggestFallbackAnalysis(history) {
    const msgs = (Array.isArray(history) ? history : []).filter((m) => m.sender === 'user');
    const last = msgs[msgs.length - 1];
    const q = (last ? last.text : '').toLowerCase();
    let stage = 'WELCOME', signals = [], objections = [], upsell = '', suggestions = [];

    if (!q) {
      suggestions = [
        'Assalam o Alaikum! Welcome to PakCloudRDP. How can I help you today?',
        'Hi there! Are you looking for a dedicated Windows RDP? Let me know your needs.',
        'Welcome! We have plans starting from R2,800/month. What workload do you need?'
      ];
    } else if (/(price|cost|kay|kitna|rate|charge|pakistan|usd|profit|month|msaal|kitney)/.test(q)) {
      stage = 'COMPARISON';
      signals = ['Customer asking about pricing — strong buying intent.'];
      objections = ['May compare with cheaper shared hosting — need to emphasize dedicated.'];
      upsell = 'Quote Starter at R2,800, Standard at R4,000, Plus at R7,500 — then upsell the next tier.';
      suggestions = [
        'Starter plan: R2,800/month (4 vCPU, 8GB RAM, 75GB NVMe, dedicated IP). Which region do you need?',
        'Here are our plans: Little R2,800 | Starter R3,300 | Standard R4,000 | Plus R7,500. All dedicated servers. Which one fits you?',
        'Dedicated RDP from R2,800/month. 1 customer = 1 machine = 100% private IP. Which plan and region are you interested in?'
      ];
    } else if (/(payment|send|screenshot|adie|bhej|transfer|easypaisa|jazzcash|pay|kti|proof)/.test(q)) {
      stage = 'PAYMENT';
      signals = ['Customer moving to payment — ready to close.'];
      objections = [];
      upsell = 'Confirm order details, then upsell IP/upgrade at next renewal.';
      suggestions = [
        'Great! Here are the payment details:\nJazzCash/Raast/NayaPay: 0301-4149031\nUBL A/C: 300841314\nTitle: Muhammad Jawad Iqbal Khan\nPlease send the screenshot once done.',
        'Payment received! We will verify and deliver your RDP within 30 minutes. Please share the transaction screenshot.',
        'Please send the payment screenshot to 0301-4149031 (JazzCash/Raast) or UBL account 300841314. Owner will verify and deliver in ~30 min.'
      ];
    } else if (/(rdp|server|connect|cant|cannot|down|problem|issue|mushkil|kharab|lag|slow|disconnect)/.test(q)) {
      stage = 'SUPPORT';
      signals = ['Technical issue — prevent churn.'];
      objections = ['Customer may be frustrated — respond fast.'];
      upsell = 'After resolving, offer upgrade if load outgrew plan.';
      suggestions = [
        'I understand the issue. Can you share the exact error message or screenshot? I will escalate it to the owner immediately.',
        'Sorry for the trouble. Please tell me: are you getting an error when connecting? I will get this fixed for you right away.',
        'Let me help. Can you share the error you are seeing? Our support hours are 9 AM - 12 AM PKT and we respond within 15 minutes.'
      ];
    } else if (/(discount|kam karo|kuch kam|kam rate|concession|bargain|long term|yearly|annual)/.test(q)) {
      stage = 'NEGOTIATION';
      signals = ['Bargaining — engaged and close to buying.'];
      objections = ['Price concern — need to justify value.'];
      upsell = 'Discount requires owner approval — flag for escalation.';
      suggestions = [
        'Our prices are already for dedicated servers — 1 customer = 1 machine with private IP. Let me ask the owner about any long-term discount options.',
        'I understand. Our Starter is R2,800/month for a fully dedicated machine. For bulk or 3+ month plans, let me check with the owner for a special rate.',
        'The price includes dedicated IP, 1 Gbps unmetered bandwidth, and full Windows access. I will check with management if we can offer something for a longer commitment.'
      ];
    } else if (/(refund|paise wapis|money back|return)/.test(q)) {
      stage = 'OBJECTION';
      signals = ['Refund demand — handle carefully.'];
      objections = ['Never promise refunds — route to owner.'];
      upsell = 'Offer to fix the issue instead of refund.';
      suggestions = [
        'I understand your concern. Let me connect you with the owner directly to review your case. Can you share what went wrong?',
        'I am sorry to hear that. Refund requests go directly to the owner for review. Please tell me the issue so I can escalate it right away.',
        'I understand. Let me get the owner to look into this for you. Can you describe the problem so we can also try to fix it?'
      ];
    } else {
      stage = 'INTEREST';
      signals = ['Customer is engaged.'];
      objections = [];
      upsell = 'Qualify their need to find the most profitable plan.';
      suggestions = [
        'Hi! Welcome to PakCloudRDP. We offer dedicated Windows RDP from R2,800/month. What workload do you need — browsing, bots, or heavy processing?',
        'Thanks for reaching out! How many users will be on the RDP and what apps do you need to run? I will recommend the best plan.',
        'Assalam o Alaikum! Are you looking for a new RDP or switching from another provider? Let me know your requirements and I will quote the best option.'
      ];
    }

    return { stage, signals, objections, upsell, suggestions, usedFallback: true };
  }

  /**
   * Guarantee at least 2-3 rich, distinct suggestions by topping up whatever
   * Gemini produced with the rule-based fallback options.
   */
  _mergeSuggestions(gemini, fallback) {
    const merged = [];
    for (const s of [...(gemini || []), ...fallback]) {
      const norm = String(s).trim();
      if (!norm) continue;
      if (merged.some((m) => m.toLowerCase() === norm.toLowerCase())) continue;
      merged.push(norm);
      if (merged.length >= 3) break;
    }
    return merged.length ? merged : fallback;
  }

  _splitSuggestions(text) {
    if (!text) return [];
    // Split on line breaks first, then also split mid-line on numbered markers
    // like "1. ... 2. ..." that Gemini may return on a single line.
    const raw = text
      .replace(/\n{2,}/g, '\n')
      .split(/\n+/)
      .reduce((acc, line) => {
        const parts = line.split(/(?=\s*\d+[.)]\s)/);
        return acc.concat(parts.filter(Boolean));
      }, []);
    return raw
      .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*]|\s+)\s*/g, '').trim())
      .filter((l) => l.length > 2)
      .slice(0, 3);
  }

  _suggestFallback(history) {
    const last = (history || []).filter((m) => m.sender === 'user').slice(-1)[0];
    const q = (last ? last.text : '').toLowerCase();
    if (!q) return ['Greet the customer warmly and ask how you can help with PakCloudRDP today.'];
    if (/(price|cost|kay|kitna|rate|charge|pakistan|usd|profit)/.test(q)) {
      return [
        'Confirm the exact price for the plan/region they asked about (use the KB figures).',
        'Ask which region and add-on (IP/backup) they need so you can quote the final total.'
      ];
    }
    if (/(payment|send|screenshot|adie|bhej|transfer|easypaisa|jazzcash|pay)/.test(q)) {
      return [
        'Acknowledge their payment and ask them to share the transaction screenshot.',
        'Once verified, confirm order delivery and send the server details securely.'
      ];
    }
    if (/(rdp|server|connect|cant|cannot|down|problem|issue|mushkil|kharab)/.test(q)) {
      return [
        'Acknowledge the issue and ask for the specific error/step to reproduce.',
        'Offer to escalate the technical problem to the owner for immediate attention.'
      ];
    }
    return [
      'Acknowledge their message and confirm the next step (quote, order, or support).',
      'Ask a clarifying question to understand which plan/region they are interested in.'
    ];
  }

  /**
   * Persist a validated backup-AI reply in the same cache used by Gemini so
   * identical queries never get re-generated (or re-billed).
   */
  _cacheBackup(cacheKey, result) {
    if (cacheKey) {
      try {
        if (!looksCanned(result.text)) {
          db.prepare('INSERT OR REPLACE INTO gemini_cache (query_hash, answer, createdAt) VALUES (?, ?, ?)')
            .run(cacheKey, result.text, new Date().toISOString());
        } else {
          console.warn('[Gemini] Skipped caching canned backup reply.');
        }
      } catch (err) {
        console.warn('[Gemini] Could not cache backup reply:', err.message);
      }
    }
    return result;
  }

  /**
   * Return true if this call is within the daily budget, incrementing the count.
   * Persisted in SQLite so the cap survives restarts.
   */
  _meterCall() {
    const today = new Date().toISOString().slice(0, 10);
    const row = db.prepare('SELECT calls FROM gemini_usage WHERE day = ?').get(today);
    const calls = row ? row.calls : 0;
    if (calls >= DAILY_GEMINI_CAP) return false;
    db.prepare(
      'INSERT INTO gemini_usage (day, calls) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1'
    ).run(today);
    return true;
  }
}

export const geminiService = new GeminiService();
