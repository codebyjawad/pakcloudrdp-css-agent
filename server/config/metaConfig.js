/**
 * Meta Cloud API Configuration
 * Dynamically reads environment variables for WhatsApp, Messenger, and Instagram
 */
import dotenv from 'dotenv';
dotenv.config();

// Runtime token overrides (set by TokenRefreshService at startup / on refresh).
// These take precedence over env vars so tokens can be rotated without a full
// restart when the refresh service re-mints them.
const runtimeOverrides = {};

function overrideOr(envKey, orValue) {
  return runtimeOverrides[envKey] !== undefined && runtimeOverrides[envKey] !== ''
    ? runtimeOverrides[envKey]
    : orValue;
}

export const META_CONFIG = {
  get webhookVerifyToken() {
    return process.env.META_VERIFY_TOKEN || 'pakcloudrdp_meta_secret_token_2026';
  },

  get appSecret() {
    // Used to verify X-Hub-Signature-256 on webhook POSTs (protects against forged events).
    return process.env.META_APP_SECRET || '';
  },

  get appId() {
    return process.env.META_APP_ID || '';
  },

  get apiVersion() {
    return process.env.META_API_VERSION || 'v20.0';
  },

  whatsapp: {
    enabled: true,
    get phoneNumberId() {
      return process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    },
    get wabaId() {
      return process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
    },
    get accessToken() {
      return overrideOr('WHATSAPP_ACCESS_TOKEN', process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '');
    }
  },

  messenger: {
    enabled: true,
    get pageId() {
      return process.env.FACEBOOK_PAGE_ID || '';
    },
    get pageAccessToken() {
      return overrideOr('FACEBOOK_PAGE_ACCESS_TOKEN', process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '');
    }
  },

  instagram: {
    enabled: true,
    get instagramAccountId() {
      return process.env.INSTAGRAM_ACCOUNT_ID || '';
    },
    get accessToken() {
      return overrideOr('INSTAGRAM_ACCESS_TOKEN', process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '');
    }
  },

  get userAccessToken() {
    return overrideOr('META_USER_ACCESS_TOKEN', process.env.META_USER_ACCESS_TOKEN || '');
  },

  /**
   * Apply a runtime token override (used by the token-refresh service).
   * @param {Object} updates e.g. { FACEBOOK_PAGE_ACCESS_TOKEN: '...' }
   */
  applyRuntimeOverrides(updates) {
    for (const [k, v] of Object.entries(updates || {})) {
      if (v && typeof v === 'string') runtimeOverrides[k] = v;
    }
  },

  get geminiApiKey() {
    return process.env.GEMINI_API_KEY || '';
  }
};
