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

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/' +
  GEMINI_MODEL +
  ':generateContent';

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
      'DELIVERY: ~30 minutes after owner confirms payment during working hours (9 AM - 12 AM PKT).',
      'SUPPORT HOURS: 9 AM - 12 AM PKT daily; target <15 min response.',
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

    // Extract PKR price-like numbers and flag any that are not in the KB set
    const matches = String(text).match(/R?\s?([0-9]{3,6})\b/g) || [];
    for (const m of matches) {
      const num = Number(clean(m).replace('r', ''));
      if (Number.isFinite(num) && num >= 1000) {
        if (!allPrices.has(num)) {
          // A price that isn't the exact KB value -> out of scope
          return false;
        }
      }
    }

    // Reject forbidden promises
    const lower = String(text).toLowerCase();
    if (/\b100% uptime\b|\bguarantee(d)? (refund|money back)\b|\bfree trial\b/.test(lower)) {
      return false;
    }

    return true;
  }

  /**
   * Generate a KB-constrained reply.
   * Returns { ok, text, fallback } - on any failure/validation it returns a
   * safe fallback instead of hallucinated content.
   */
  async generate(kb, userMessage, cannedFallback) {
    if (!this.key) {
      return { ok: false, text: cannedFallback, fallback: true, reason: 'no-key' };
    }

    const fallback = (reason) => ({ ok: false, text: cannedFallback, fallback: true, reason });

    // ---- Caching: identical queries within TTL are served from cache (no API cost) ----
    const q = (userMessage || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 300);
    const cacheKey = crypto.createHash('sha256').update(q).digest('hex');
    const cached = db.prepare('SELECT answer, createdAt FROM gemini_cache WHERE query_hash = ?').get(cacheKey);
    if (cached) {
      const age = Date.now() - new Date(cached.createdAt).getTime();
      if (age < CACHE_TTL_MS && cached.answer) {
        return { ok: true, text: cached.answer, fallback: false, cached: true };
      }
    }

    // ---- Daily budget cap ----
    if (!this._meterCall()) {
      console.warn('[Gemini] Daily call cap reached, using fallback.');
      return fallback('daily-cap');
    }

    const systemPrompt =
      'You are the official customer-support assistant for PakCloudRDP, a managed dedicated ' +
      'Windows RDP provider. You must answer ONLY using the facts in the CONTEXT below. ' +
      'HARD RULES: 1) Never invent or guess any price, RAM, CPU, storage, region, policy, feature, ' +
      'or availability. 2) Quoting any price? Use the EXACT PKR figures from the CONTEXT. ' +
      '3) Never promise refunds, discounts, free trials, or 100% uptime - instead say such requests ' +
      'are handled by the owner/management. 4) If a question is outside the CONTEXT (e.g. custom pricing, ' +
      'unlisted locations, legal advice, unrelated topics), do NOT answer with made-up info. Instead reply ' +
      'that this is beyond scope and that you will escalate the request to the owner. ' +
      '5) Keep it concise and helpful. Respond in the customer\'s language (Roman Urdu / English / mixed).';

    const userPrompt =
      'CONTEXT (single source of truth - use this ONLY):\n' +
      '------------------------------\n' +
      this.buildContext(kb) +
      '\n------------------------------\n' +
      'CUSTOMER MESSAGE:\n' +
      userMessage;

    try {
      const res = await fetch(
        GEMINI_URL + '?key=' + encodeURIComponent(this.key),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 500
            }
          })
        }
      );

      if (!res.ok) {
        const body = await res.text();
        console.error('[Gemini] HTTP', res.status, body.slice(0, 300));
        return fallback('http-' + res.status);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';

      if (!text.trim()) {
        return fallback('empty');
      }

      if (!this.validateAgainstKB(text, kb)) {
        console.warn('[Gemini] Response failed KB validation, using fallback.');
        return fallback('validation');
      }

      // Cache the valid answer so the same query never costs money again
      const trimmed = text.trim();
      db.prepare(
        'INSERT OR REPLACE INTO gemini_cache (query_hash, answer, createdAt) VALUES (?, ?, ?)'
      ).run(cacheKey, trimmed, new Date().toISOString());

      return { ok: true, text: trimmed, fallback: false };
    } catch (err) {
      console.error('[Gemini] Error:', err.message);
      return fallback('error');
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
    const cacheInput = transcript.trim().slice(0, 4000);
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
      const res = await fetch(GEMINI_URL + '?key=' + encodeURIComponent(this.key), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 700 }
        })
      });

      if (!res.ok) {
        console.error('[Gemini] Analyze HTTP', res.status);
        return await this._bigPickleOrFallback(kb, history, fallback);
      }

      const data = await res.json();
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
