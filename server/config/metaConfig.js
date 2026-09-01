/**
 * Meta Cloud API Configuration
 * Dynamically reads environment variables for WhatsApp, Messenger, and Instagram
 */
import dotenv from 'dotenv';
dotenv.config();

export const META_CONFIG = {
  get webhookVerifyToken() {
    return process.env.META_VERIFY_TOKEN || 'pakcloudrdp_meta_secret_token_2026';
  },

  get appSecret() {
    // Used to verify X-Hub-Signature-256 on webhook POSTs (protects against forged events).
    return process.env.META_APP_SECRET || '';
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
      return process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '';
    }
  },

  messenger: {
    enabled: true,
    get pageId() {
      return process.env.FACEBOOK_PAGE_ID || '';
    },
    get pageAccessToken() {
      return process.env.FACEBOOK_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '';
    }
  },

  instagram: {
    enabled: true,
    get instagramAccountId() {
      return process.env.INSTAGRAM_ACCOUNT_ID || '';
    },
    get accessToken() {
      return process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '';
    }
  },

  get geminiApiKey() {
    return process.env.GEMINI_API_KEY || '';
  }
};
