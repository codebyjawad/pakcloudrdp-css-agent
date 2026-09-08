/**
 * API Service for PakCloudRDP Agent Dashboard
 */

const BASE_URL = '';

async function fetchJSON(url, options = {}) {
  const res = await fetch(BASE_URL + url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    let errorData = null;
    try {
      errorData = await res.json();
    } catch {
      // not json
    }
    const msg = errorData?.error || errorData?.message || `HTTP error ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  // Chats & Messages
  getChats: () => fetchJSON('/api/chats'),
  getChatThread: (sessionId) => fetchJSON(`/api/chats/${encodeURIComponent(sessionId)}`),
  sendMessage: (sessionId, text, senderName = 'Owner') =>
    fetchJSON(`/api/chats/${encodeURIComponent(sessionId)}/send`, {
      method: 'POST',
      body: JSON.stringify({ text, senderName })
    }),
  toggleAiPause: (sessionId, paused) =>
    fetchJSON(`/api/chats/${encodeURIComponent(sessionId)}/ai-pause`, {
      method: 'POST',
      body: JSON.stringify({ paused })
    }),
  getAiSuggestions: (sessionId, force = false) =>
    fetchJSON(`/api/chats/${encodeURIComponent(sessionId)}/suggest`, {
      method: 'POST',
      body: JSON.stringify({ force })
    }),
  sendFollowupTemplate: (sessionId) =>
    fetchJSON(`/api/chats/${encodeURIComponent(sessionId)}/followup`, {
      method: 'POST'
    }),
  sendRenewalTemplate: (sessionId, data) =>
    fetchJSON(`/api/chats/${encodeURIComponent(sessionId)}/renewal-reminder`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  sendHandoverTemplate: (sessionId, data) =>
    fetchJSON(`/api/chats/${encodeURIComponent(sessionId)}/handover`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  getChatNotes: (sessionId) => fetchJSON(`/api/chats/${encodeURIComponent(sessionId)}/notes`),
  updateChatNotes: (sessionId, notes) =>
    fetchJSON(`/api/chats/${encodeURIComponent(sessionId)}/notes`, {
      method: 'PUT',
      body: JSON.stringify({ notes })
    }),

  // Plans & Pricing
  getPlans: () => fetchJSON('/api/plans'),

  // Escalations
  getEscalations: () => fetchJSON('/api/escalations'),
  resolveEscalation: (id) =>
    fetchJSON(`/api/escalations/${encodeURIComponent(id)}/resolve`, {
      method: 'POST'
    }),

  // Orders
  getOrders: () => fetchJSON('/api/orders'),

  // Webhook Logs & Live Feed
  getWebhookLogs: () => fetchJSON('/api/meta/webhook/logs'),
  simulateMessage: (payload) =>
    fetchJSON('/api/meta/webhook/simulate', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Meta Sync & Health
  getMetaSyncStatus: () => fetchJSON('/api/meta/sync/status'),
  runMetaSync: () => fetchJSON('/api/meta/sync', { method: 'POST' }),
  getHealth: () => fetchJSON('/api/health')
};
