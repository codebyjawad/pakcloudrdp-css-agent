/**
 * Meta Sync Service
 *
 * Backfills customer conversations from Meta's WhatsApp Business Management API
 * so the Chats inbox reflects every conversation Meta actually has, even ones we
 * haven't received a webhook for yet.
 *
 * IMPORTANT (Meta constraint): this API only returns conversation METADATA
 * (id + timestamps), NOT message text. Full text is captured live via webhook.
 *
 * The `/conversations` endpoint requires the `whatsapp_business_management`
 * permission + the "WhatsApp Business Management API" product on the app. If it
 * is missing, we report a clear status so the dashboard can show setup steps.
 */
import { META_CONFIG } from '../config/metaConfig.js';
import { conversationStore } from './conversationStore.js';

class MetaSyncService {
  /**
   * Probe permission without making a full sync: calls /{WABA}/conversations?limit=1.
   * Returns { enabled, reason?, sample? }.
   */
  async status() {
    const c = META_CONFIG.whatsapp;
    const waba = c.wabaId;
    if (!waba || !c.accessToken) {
      return { enabled: false, reason: 'missing-config' };
    }
    return this._sync({ limit: 1, probe: true });
  }

  /**
   * Run a sync. Returns:
   *  - { enabled:false, reason:'no-permission', message } if the conversations
   *    field isn't accessible (permission missing).
   *  - { enabled:true, synced: n, total: n, boxes: [...] } on success.
   */
  async sync() {
    return this._sync({ limit: 100, probe: false });
  }

  async _sync({ limit, probe }) {
    const c = META_CONFIG.whatsapp;
    const waba = c.wabaId;
    const token = c.accessToken;
    const v = META_CONFIG.apiVersion;

    const url = `https://graph.facebook.com/${v}/${waba}/conversations?limit=${limit}&platform=whatsapp`;
    try {
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      const body = await res.text();
      if (!res.ok) {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch { /* ignore */ }
        const code = parsed?.error?.code;
        const subcode = parsed?.error?.error_subcode;
        // code 100 (nonexisting field) / 10 / 200 => permission/token scope issue
        const permissionIssue =
          (code === 100) || (code === 200) || (code === 10) ||
          /nonexisting field|permission|not (authorized|allowed)/i.test(parsed?.error?.message || '');

        return {
          enabled: false,
          reason: permissionIssue ? 'no-permission' : 'api-error',
          message: permissionIssue
            ? 'Meta requires the "WhatsApp Business Management" permission to list conversations. See the setup steps below.'
            : `Meta API error ${code}: ${String(parsed?.error?.message || body).slice(0, 200)}`,
          ...(parsed ? { metaError: { code, subcode, message: parsed?.error?.message } } : {})
        };
      }

      let data = null;
      try { data = JSON.parse(body); } catch { /* ignore */ }
      if (probe) {
        return { enabled: true, total: (data?.data || []).length };
      }

      const boxes = (data?.data || []).map((conv) => {
        const phone = String(conv.id || '').split(':').pop();
        const lastTime = conv.updated_at ? new Date(conv.updated_at * 1000).toISOString() : null;
        const existed = conversationStore.seedIfMissing(phone, {
          senderId: phone,
          channel: 'WhatsApp',
          lastTime
        });
        return { phone, lastTime, createdAt: conv.created_at || null, state: existed };
      });

      return {
        enabled: true,
        synced: boxes.filter((b) => b.state === 'created').length,
        alreadyHave: boxes.filter((b) => b.state === 'exists').length,
        total: boxes.length,
        boxes
      };
    } catch (err) {
      return { enabled: false, reason: 'network-error', message: err.message };
    }
  }
}

export const metaSyncService = new MetaSyncService();
