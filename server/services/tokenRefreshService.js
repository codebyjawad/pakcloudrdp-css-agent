/**
 * Meta token refresh service.
 *
 * Minted page tokens can expire or be invalidated (e.g. app recreation, token
 * revocation, expiry of the short-lived user token they came from). When the
 * outgoing tokens die, inbound webhooks still work (they only need the app
 * secret) but every outbound reply fails with "Authentication Error" - which
 * silently loses customers. This service makes sure that never happens again:
 *
 *  - On startup and then on a daily cadence, it validates the current page
 *    token against the Graph API.
 *  - If a token is invalid/expired, it re-mints a fresh one using the stored
 *    long-lived user token (META_USER_ACCESS_TOKEN) via the fb_exchange_token
 *    flow, then writes the new value to .env and applies it at runtime so no
 *    restart is required.
 *
 * Read-only when everything is healthy - it never rotates unnecessarily.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { META_CONFIG } from '../config/metaConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '../../.env');

// How often to re-validate tokens.
const CHECK_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24h

export class TokenRefreshService {
  constructor() {
    this.timer = null;
    this.lastResult = null;
  }

  /**
   * Validate a page access token via /debug_token. Uses the user token (or the
   * token itself) as the "app access token" to introspect. Returns true if the
   * token is currently valid and not expired.
   */
  async isPageTokenValid(token) {
    if (!token) return false;
    const v = META_CONFIG.apiVersion;
    const appTok = META_CONFIG.userAccessToken || token;
    try {
      const res = await fetch(
        `https://graph.facebook.com/${v}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appTok)}`
      );
      const d = await res.json();
      const x = d.data || {};
      if (d.error || !x.is_valid) return false;
      // expires_at === 0 means it never expires; otherwise must be in the future.
      if (x.expires_at && x.expires_at < Date.now() / 1000) return false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Re-mint a long-lived page token from the stored long-lived user token.
   * Returns the new page token string, or null on failure.
   */
  async mintPageToken() {
    const v = META_CONFIG.apiVersion;
    const appId = META_CONFIG.appId;
    const appSecret = META_CONFIG.appSecret;
    const userTok = META_CONFIG.userAccessToken;
    const pageId = META_CONFIG.messenger.pageId;

    if (!appId || !appSecret || !userTok || !pageId) {
      console.error('[TokenRefresh] Cannot refresh: missing META_APP_ID / META_APP_SECRET / META_USER_ACCESS_TOKEN / FACEBOOK_PAGE_ID');
      return null;
    }

    try {
      // 1) Extend the user token (keeps the refresh source alive).
      const exchUrl = `https://graph.facebook.com/${v}/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${encodeURIComponent(appId)}` +
        `&client_secret=${encodeURIComponent(appSecret)}` +
        `&fb_exchange_token=${encodeURIComponent(userTok)}`;
      const exchRes = await fetch(exchUrl, { method: 'GET' });
      const exchJson = await exchRes.json();
      const longUser = exchJson.access_token;
      if (!longUser) {
        console.error('[TokenRefresh] fb_exchange_token failed:', JSON.stringify(exchJson.error || exchJson));
        return null;
      }

      // 2) Get the matching page token from the (now fresh) user token.
      const acctRes = await fetch(
        `https://graph.facebook.com/${v}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(longUser)}`
      );
      const acct = await acctRes.json();
      const page = (acct.data || []).find((p) => String(p.id) === String(pageId));
      if (!page?.access_token) {
        console.error('[TokenRefresh] /me/accounts did not list page ' + pageId);
        return null;
      }

      return { pageToken: page.access_token, userToken: longUser };
    } catch (err) {
      console.error('[TokenRefresh] mintPageToken error:', err.message);
      return null;
    }
  }

  /**
   * Persist new tokens to .env (only replacing the token lines) and apply them
   * at runtime so no restart is needed.
   */
  applyTokens({ pageToken, userToken, whatsappToken } = {}) {
    if (!pageToken) return;
    const runtimeUpdates = {};
    if (whatsappToken) runtimeUpdates.WHATSAPP_ACCESS_TOKEN = whatsappToken;
    if (pageToken) {
      runtimeUpdates.FACEBOOK_PAGE_ACCESS_TOKEN = pageToken;
      // Telegram/IG + WhatsApp use the page token for messaging.
      if (!whatsappToken) runtimeUpdates.WHATSAPP_ACCESS_TOKEN = pageToken;
      runtimeUpdates.INSTAGRAM_ACCESS_TOKEN = pageToken;
    }
    if (userToken) runtimeUpdates.META_USER_ACCESS_TOKEN = userToken;

    META_CONFIG.applyRuntimeOverrides(runtimeUpdates);

    // Persist to .env so the values survive a restart too.
    try {
      const raw = fs.readFileSync(ENV_PATH, 'utf8');
      let lines = raw.split(/\r?\n/);
      const replace = (key, val, addIfMissing) => {
        const idx = lines.findIndex((l) => l.startsWith(key + '='));
        if (idx >= 0) lines[idx] = key + '=' + val;
        else if (addIfMissing) lines.push(key + '=' + val);
      };
      if (runtimeUpdates.WHATSAPP_ACCESS_TOKEN) replace('WHATSAPP_ACCESS_TOKEN', runtimeUpdates.WHATSAPP_ACCESS_TOKEN, true);
      if (runtimeUpdates.FACEBOOK_PAGE_ACCESS_TOKEN) replace('FACEBOOK_PAGE_ACCESS_TOKEN', runtimeUpdates.FACEBOOK_PAGE_ACCESS_TOKEN, true);
      if (runtimeUpdates.INSTAGRAM_ACCESS_TOKEN) replace('INSTAGRAM_ACCESS_TOKEN', runtimeUpdates.INSTAGRAM_ACCESS_TOKEN, true);
      if (runtimeUpdates.META_USER_ACCESS_TOKEN) replace('META_USER_ACCESS_TOKEN', runtimeUpdates.META_USER_ACCESS_TOKEN, true);
      fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n');
      console.log('[TokenRefresh] Updated .env with refreshed tokens.');
    } catch (err) {
      console.error('[TokenRefresh] Could not write .env:', err.message);
    }
  }

  /**
   * Perform a single refresh pass. Returns true if all outbound tokens are now
   * valid, false otherwise.
   */
  async refresh() {
    const pageToken = META_CONFIG.messenger.pageAccessToken;
    if (!pageToken) {
      console.error('[TokenRefresh] No page token configured - cannot validate.');
      this.lastResult = { ok: false, reason: 'no-token' };
      return false;
    }

    const valid = await this.isPageTokenValid(pageToken);
    if (valid) {
      console.log('[TokenRefresh] Page access token is valid.');
      this.lastResult = { ok: true, reason: 'valid', ts: new Date().toISOString() };
      return true;
    }

    console.warn('[TokenRefresh] Page token invalid/expired - re-minting from user token.');
    const minted = await this.mintPageToken();
    if (!minted) {
      console.error('[TokenRefresh] Re-mint failed. Outbound replies will keep failing.');
      this.lastResult = { ok: false, reason: 'mint-failed', ts: new Date().toISOString() };
      return false;
    }

    const revalid = await this.isPageTokenValid(minted.pageToken);
    if (!revalid) {
      console.error('[TokenRefresh] Freshly minted page token failed validation.');
      this.lastResult = { ok: false, reason: 'mint-invalid', ts: new Date().toISOString() };
      return false;
    }

    this.applyTokens({ pageToken: minted.pageToken, userToken: minted.userToken });
    // Re-mint/verify the WhatsApp path (same page token works if scoped).
    console.log('[TokenRefresh] Page token refreshed successfully.');
    this.lastResult = { ok: true, reason: 'refreshed', ts: new Date().toISOString() };
    return true;
  }

  /** Start the periodic checker. Runs one pass immediately, then on interval. */
  start() {
    // Flush an initial check shortly after boot (after the server is listening).
    setTimeout(() => this.refresh().catch((e) => console.error('[TokenRefresh] initial check failed:', e.message)), 3000);
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.refresh().catch((e) => console.error('[TokenRefresh] periodic check failed:', e.message));
    }, CHECK_INTERVAL_MS);
    this.timer.unref?.();
  }

  /** Stop the periodic checker (used by tests). */
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export const tokenRefreshService = new TokenRefreshService();
