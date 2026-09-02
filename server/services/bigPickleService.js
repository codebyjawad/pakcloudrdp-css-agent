/**
 * Big Pickle fallback AI service.
 *
 * When Gemini is unavailable, rate-limited, or returns unparseable output, the
 * chat "profit coach" falls back to the opencode big-pickle model via the shared
 * OpenAI-compatible endpoint. The endpoint + key are referenced from the agents
 * suite config (AGENTS.md: "reference it, don't duplicate it") so we never hardcode
 * the secret here.
 *
 * Produces the same structured shape as GeminiService.analyzeForNextMessage:
 *   { stage, signals[], objections[], upsell, suggestions[] }
 * Returns null on any failure so the caller can fall through to rule-based.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

function loadConfig() {
  try {
    const cfg = require('/root/projects/agents/config.js');
    return (cfg && cfg.ai) || null;
  } catch {
    return null;
  }
}

const FREE_MODELS = ['mimo-v2.5-free', 'deepseek-v4-flash-free', 'laguna-s-2.1-free'];

const SYS_PROMPT =
  'You are the sales manager for PakCloudRDP, a managed dedicated Windows RDP provider. ' +
  'Analyze the FULL customer transcript and tell the owner exactly what to type NEXT to close a ' +
  'profitable sale. Output ONLY a JSON object (no markdown, no extra text) with EXACTLY these keys:\n' +
  '{\n' +
  '  "stage": one of "WELCOME","INTEREST","COMPARISON","DECISION","NEGOTIATION","PAYMENT","OBJECTION","SUPPORT","DORMANT",\n' +
  '  "signals": [short strings describing why this customer may buy],\n' +
  '  "objections": [short strings describing what is blocking them],\n' +
  '  "upsell": one concise line on the most profitable next offer (exact plan name + exact PKR price from CONTEXT; never invent), or "no upsell window yet",\n' +
  '  "suggestions": [EXACTLY 3 SHORT READY-TO-SEND messages, under 45 words each, that advance the sale]\n' +
  '}\n' +
  'HARD RULES: 1) Use ONLY prices/plans/policies from CONTEXT. 2) Never promise refunds, discounts, or 100% uptime. ' +
  '3) If a discount/refund is appropriate, note that it requires owner approval. 4) Match the customer language (Roman Urdu / English / mixed). ' +
  '5) Suggestions must be CONCRETE, natural, ready-to-send messages the owner can copy verbatim (never coaching advice like "ask them X").';

export class BigPickleService {
  constructor() {
    const cfg = loadConfig();
    this.enabled = Boolean(cfg && cfg.apiKey && cfg.baseUrl);
    this.baseUrl = (cfg && cfg.baseUrl) || '';
    this.apiKey = (cfg && cfg.apiKey) || '';
  }

  isConfigured() {
    return this.enabled;
  }

  async analyzeForNextMessage(kb, history) {
    if (!this.enabled) return null;
    const transcript = (history || [])
      .map((m) => {
        const who = m.sender === 'user' ? 'CUSTOMER' : (m.sender === 'agent' ? 'AI' : 'OWNER');
        return who + ': ' + (m.text || '');
      })
      .join('\n');

    // Compact brand context (mirror of geminiService.buildContext essentials)
    const plans = (kb.plans || []).map((p) => `${p.name}: ${p.vcpu}/${p.ram}/${p.nvme}`).join('; ');
    const prices = Object.entries(kb.priceMatrix || {})
      .slice(0, 12)
      .map(([plan, byRegion]) => `${plan}: ${Object.entries(byRegion).map(([r, a]) => `${r} R${a}`).join(', ')}`)
      .join(' | ');

    const user =
      'CONTEXT (use this ONLY):\nPLANS: ' + plans + '\nPRICES (PKR monthly): ' + prices +
      '\nPOLICIES: prices fixed; never promise refunds/discounts/uptime; support 9 AM-12 AM PKT; deliver ~30 min after owner verifies payment.\n' +
      '------------------------------\nFULL CUSTOMER TRANSCRIPT (oldest to newest):\n' + (transcript || '(empty)');

    const messages = [
      { role: 'system', content: SYS_PROMPT },
      { role: 'user', content: user }
    ];

    // Try each free model with a short timeout — first working one wins
    for (const model of FREE_MODELS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        const res = await fetch(this.baseUrl + '/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.apiKey,
            'User-Agent': 'PakCloudRDP-Agent/1.0'
          },
          signal: controller.signal,
          body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 700 })
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const j = await res.json();
        const text = (j?.choices?.[0]?.message?.content || '').trim();
        if (!text) continue;
        const parsed = this._parse(text);
        if (parsed) {
          console.log(`[OpenAI] Free model ${model} succeeded.`);
          return parsed;
        }
      } catch (err) {
        console.warn(`[OpenAI] ${model} failed:`, err.message);
      }
    }
    return null;
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
