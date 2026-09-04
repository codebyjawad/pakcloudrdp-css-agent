/**
 * Unified Meta Messaging Service
 * Connects with WhatsApp Cloud API, Facebook Messenger API, and Instagram Messaging API
 */
import { META_CONFIG } from '../config/metaConfig.js';

export class MetaMessagingService {
  /**
   * Send WhatsApp message via Meta Cloud API
   * @param {string} toPhoneNumber - Recipient phone number (e.g. 923001234567)
   * @param {string} messageText - Formatted message text
   */
  static async sendWhatsAppMessage(toPhoneNumber, messageText) {
    const { phoneNumberId, accessToken } = META_CONFIG.whatsapp;

    if (!phoneNumberId || !accessToken) {
      console.error('[Meta WhatsApp] NOT CONFIGURED - reply NOT sent. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.');
      return { success: false, error: 'WhatsApp not configured', channel: 'WhatsApp', to: toPhoneNumber };
    }

    const cleanPhone = toPhoneNumber.replace(/[^0-9]/g, '');
    const url = `https://graph.facebook.com/${META_CONFIG.apiVersion}/${phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: messageText
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Meta WhatsApp API error');
      }

      console.log(`[Meta WhatsApp] Message sent successfully to ${cleanPhone}:`, data);
      return { success: true, data };
    } catch (err) {
      console.error('[Meta WhatsApp] Error sending message:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Fetch and cache the page-scoped access token for the configured Facebook page.
   * Messenger & Instagram sending MUST use a page access token (a system-user token
   * cannot send messages as a page). Falls back to the configured page token if
   * already page-scoped, otherwise exchanges the configured token via /me/accounts.
   */
  static _pageTokenCache = null;

  static async _getPageToken() {
    if (this._pageTokenCache) return this._pageTokenCache;

    const { pageId, pageAccessToken } = META_CONFIG.messenger;
    if (!pageId || !pageAccessToken) return null;

    const v = META_CONFIG.apiVersion;
    try {
      const res = await fetch(
        `https://graph.facebook.com/${v}/me/accounts?fields=id,name,access_token&access_token=${pageAccessToken}`
      );
      const data = await res.json();
      const page = (data.data || []).find((p) => String(p.id) === String(pageId));
      if (page?.access_token) {
        this._pageTokenCache = page.access_token;
        console.log('[Meta] Page token obtained via /me/accounts exchange for page', pageId);
        return this._pageTokenCache;
      }
      console.warn('[Meta] /me/accounts did not list this page — treating FACEBOOK_PAGE_ACCESS_TOKEN as an already page-scoped token.');
    } catch (err) {
      console.warn('[Meta] /me/accounts exchange failed, falling back to configured token directly:', err.message);
    }
    // Fallback: assume the configured token is already the page token.
    this._pageTokenCache = pageAccessToken;
    return this._pageTokenCache;
  }

  /**
   * Fetch the real name of a Messenger or Instagram user via the Graph API.
   * Returns the full name string, or null on failure / missing permission.
   */
  static async getUserProfile(channel, userId) {
    const pageToken = await this._getPageToken();
    if (!pageToken || !userId) return null;

    const v = META_CONFIG.apiVersion;
    const fields = channel === 'Instagram' ? 'name' : 'first_name,last_name';
    const url = `https://graph.facebook.com/${v}/${userId}?fields=${fields}&access_token=${pageToken}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        console.warn(`[Meta] getUserProfile error for ${userId}:`, data.error.message);
        return null;
      }
      if (data.first_name && data.last_name) {
        return `${data.first_name} ${data.last_name}`;
      }
      return data.name || null;
    } catch (err) {
      console.warn(`[Meta] getUserProfile fetch failed for ${userId}:`, err.message);
      return null;
    }
  }

  /**
   * Send Facebook Messenger response
   * @param {string} recipientPsid - Page-Scoped User ID
   * @param {string} messageText - Message text
   */
  static async sendMessengerMessage(recipientPsid, messageText) {
    const pageToken = await this._getPageToken();
    if (!pageToken) {
      // Previously this returned success:true, so a missing FACEBOOK_PAGE_ID or
      // FACEBOOK_PAGE_ACCESS_TOKEN silently swallowed every reply: the customer
      // got nothing, the dashboard logged a delivery, and nothing looked wrong.
      console.error('[Meta Messenger] NO PAGE TOKEN - reply NOT sent. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN.');
      return { success: false, error: 'No page access token configured', channel: 'Messenger', to: recipientPsid };
    }

    const url = `https://graph.facebook.com/${META_CONFIG.apiVersion}/me/messages?access_token=${pageToken}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientPsid },
          message: { text: messageText },
          messaging_type: 'RESPONSE'
        })
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.error?.code === 190 || data.error?.type === 'OAuthException') {
          this._pageTokenCache = null;
        }
        throw new Error(data.error?.message || 'Meta Messenger API error');
      }

      console.log(`[Meta Messenger] Message sent to ${recipientPsid}:`, data);
      return { success: true, data };
    } catch (err) {
      console.error('[Meta Messenger] Error sending message:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send Instagram Direct Message
   * @param {string} recipientIgsid - Instagram Scoped User ID
   * @param {string} messageText - Message text
   */
  static async sendInstagramMessage(recipientIgsid, messageText) {
    const pageToken = await this._getPageToken();
    if (!pageToken) {
      console.error('[Meta Instagram] NO PAGE TOKEN - reply NOT sent. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN.');
      return { success: false, error: 'No page access token configured', channel: 'Instagram', to: recipientIgsid };
    }

    const url = `https://graph.facebook.com/${META_CONFIG.apiVersion}/me/messages?access_token=${pageToken}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientIgsid },
          message: { text: messageText }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.error?.code === 190 || data.error?.type === 'OAuthException') {
          this._pageTokenCache = null;
        }
        throw new Error(data.error?.message || 'Meta Instagram API error');
      }

      console.log(`[Meta Instagram] Message sent to ${recipientIgsid}:`, data);
      return { success: true, data };
    } catch (err) {
      console.error('[Meta Instagram] Error sending message:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Reply to an Instagram comment
   * @param {string} commentId - The ID of the comment to reply to
   * @param {string} messageText - Reply text
   */
  static async replyToInstagramComment(commentId, messageText) {
    const pageToken = await this._getPageToken();
    if (!pageToken) {
      console.warn('[Meta Instagram] No page token available. Cannot reply to comment.');
      return { success: false, error: 'No page token' };
    }

    const url = `https://graph.facebook.com/${META_CONFIG.apiVersion}/${commentId}/replies?access_token=${pageToken}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText })
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.error?.code === 190 || data.error?.type === 'OAuthException') {
          this._pageTokenCache = null;
        }
        throw new Error(data.error?.message || 'Instagram comment reply API error');
      }

      console.log(`[Meta Instagram] Comment reply sent to ${commentId}:`, data);
      return { success: true, data };
    } catch (err) {
      console.error('[Meta Instagram] Error replying to comment:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Dispatch response automatically to the correct Meta channel
   */
  static async dispatch(channel, recipientId, messageText) {
    const ch = (channel || '').toLowerCase();
    if (ch === 'whatsapp') {
      return await this.sendWhatsAppMessage(recipientId, messageText);
    } else if (ch === 'messenger' || ch === 'facebook') {
      return await this.sendMessengerMessage(recipientId, messageText);
    } else if (ch === 'instagram' || ch === 'insta') {
      return await this.sendInstagramMessage(recipientId, messageText);
    }
    return { success: false, error: `Unknown channel: ${channel}` };
  }
}
