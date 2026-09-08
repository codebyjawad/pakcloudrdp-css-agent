import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Smartphone,
  MessageCircle,
  Camera,
  Cpu,
  Copy,
  Check,
  X,
  KeyRound
} from 'lucide-react';
import { api } from '../services/api';

export default function StatusView() {
  const [_health, setHealth] = useState(null);
  const [_syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'instagram', 'whatsapp', null

  const webhookUrl = 'https://agent.codebyjawad.com/api/meta/webhook';

  const fetchStatus = () => {
    setLoading(true);
    Promise.all([api.getHealth(), api.getMetaSyncStatus()])
      .then(([h, s]) => {
        setHealth(h);
        setSyncStatus(s);
      })
      .catch((err) => console.error('Status fetch error:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    });
  };

  return (
    <div className="status-grid" aria-label="Meta Platform and System Status">
      {/* Action Modals */}
      {activeModal && (
        <div className="preview-modal-overlay">
          <div className="preview-modal-card" role="dialog" aria-modal="true" aria-label="Token Configuration Guide">
            <div className="preview-modal-header">
              <h3 style={{ margin: 0, fontSize: '15px', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={16} color="var(--accent-primary)" aria-hidden="true" />
                {activeModal === 'instagram' ? 'Instagram Direct Token Configuration' : 'WhatsApp OAuth Token Reconnection'}
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setActiveModal(null)}
                aria-label="Close configuration modal"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeModal === 'instagram' ? (
                <>
                  <p>
                    To enable <strong>Instagram Direct DMs</strong> on this dashboard:
                  </p>
                  <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li>Open <strong>Meta for Developers</strong> (developers.facebook.com) and select your PakCloud App.</li>
                    <li>Under <em>Instagram</em> in the left sidebar, click <strong>API setup with Instagram login</strong>.</li>
                    <li>Link your <strong>PakCloud Instagram Professional/Business account</strong>.</li>
                    <li>Generate a User/Page token with permissions: <code>instagram_basic</code>, <code>instagram_manage_messages</code>.</li>
                    <li>Add the Token and Account ID in your server <code>.env</code> under <code>INSTAGRAM_ACCESS_TOKEN</code> and <code>INSTAGRAM_ACCOUNT_ID</code>.</li>
                  </ol>
                </>
              ) : (
                <>
                  <p>
                    Your current WhatsApp access token encountered <code>OAuthException 190 (Session expired)</code>:
                  </p>
                  <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li>Log into <strong>Meta Business Manager</strong> (business.facebook.com).</li>
                    <li>Navigate to <strong>System Users</strong> and select your API system user.</li>
                    <li>Click <strong>Generate New Token</strong> for WhatsApp Business Account with <code>whatsapp_business_messaging</code>.</li>
                    <li>Choose <strong>Permanent (Never Expire)</strong> system token instead of a 24-hour temporary user token.</li>
                    <li>Update <code>META_WHATSAPP_ACCESS_TOKEN</code> in <code>/var/www/codebyjawad.com/agent/.env</code> and restart service.</li>
                  </ol>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setActiveModal(null)}
                aria-label="Close guide"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Cloud API */}
      <div className="status-card">
        <div className="status-card-header">
          <div className="status-card-title">
            <Smartphone size={20} color="var(--wa-color)" aria-hidden="true" />
            WhatsApp Cloud API
          </div>
          <span className="status-pill online">CONFIGURED</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Cloud API endpoint for Phone Number <code>1280471305154568</code> (Pak Cloud Rdp).
        </p>
        <div className="status-action-row">
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Status: Outbound Token Refresh Required
          </span>
          <button
            type="button"
            className="status-action-btn"
            onClick={() => setActiveModal('whatsapp')}
            aria-label="How to reconnect WhatsApp token"
          >
            Reconnect Token
          </button>
        </div>
      </div>

      {/* Facebook Messenger */}
      <div className="status-card">
        <div className="status-card-header">
          <div className="status-card-title">
            <MessageCircle size={20} color="var(--msg-color)" aria-hidden="true" />
            Facebook Page Messenger
          </div>
          <span className="status-pill online">ONLINE</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Connected to Page <strong>PakCloud RDP</strong> (<code>929661113561523</code>) via Page Access Token.
        </p>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
          24h Standard Messaging Window applies for automated AI replies.
        </div>
      </div>

      {/* Instagram API (Actionable with Token Guide and Copyable Webhook) */}
      <div className="status-card">
        <div className="status-card-header">
          <div className="status-card-title">
            <Camera size={20} color="var(--ig-color)" aria-hidden="true" />
            Instagram Messaging
          </div>
          <span className="status-pill warning">TOKEN SETUP</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Direct DMs require adding your business account under Meta Developer API setup.
        </p>
        <div className="status-action-row">
          <button
            type="button"
            className="status-action-btn primary"
            onClick={() => setActiveModal('instagram')}
            aria-label="Open Instagram token setup guide"
          >
            Configure Token
          </button>
        </div>
      </div>

      {/* Gemini AI Multi-Model Failover */}
      <div className="status-card">
        <div className="status-card-header">
          <div className="status-card-title">
            <Cpu size={20} color="var(--sky)" aria-hidden="true" />
            Gemini AI Failover Engine
          </div>
          <span className="status-pill online">ACTIVE</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Primary: <code>gemini-flash-lite-latest</code> with automatic failover chain across 4 models on quota limits.
        </p>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
          Knowledge base enriched with Windows 10/11/Server specs & Ur/Eng intent ladder.
        </div>
      </div>

      {/* Full-width Webhook Endpoint Card (No clipping, One-click copy) */}
      <div className="status-card webhook-full-card" style={{ gridColumn: '1 / -1' }}>
        <div className="status-card-header">
          <div className="status-card-title">
            <ShieldCheck size={20} color="var(--emerald)" aria-hidden="true" />
            Meta Webhook Callback URL
          </div>
          <button
            type="button"
            className={`copy-webhook-btn ${copiedUrl ? 'copied' : ''}`}
            onClick={handleCopyWebhook}
            aria-label="Copy Webhook Callback URL to clipboard"
          >
            {copiedUrl ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span>{copiedUrl ? 'Copied URL!' : 'Copy Webhook URL'}</span>
          </button>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 8 }}>
          Paste this URL in your Meta App Dashboard under WhatsApp, Messenger, and Instagram webhook subscription settings:
        </p>
        <div className="webhook-url-display">
          <code>{webhookUrl}</code>
        </div>
      </div>
    </div>
  );
}
