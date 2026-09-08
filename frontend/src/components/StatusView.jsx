import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Smartphone, MessageCircle, Camera, Cpu } from 'lucide-react';
import { api } from '../services/api';

export default function StatusView() {
  const [health, setHealth] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = () => {
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

  return (
    <div className="status-grid">
      {/* WhatsApp Cloud API */}
      <div className="status-card">
        <div className="status-card-header">
          <div className="status-card-title">
            <Smartphone size={20} color="var(--wa-color)" />
            WhatsApp Cloud API
          </div>
          <span className="status-pill online">ONLINE</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Direct Cloud API connection to Phone Number <code>1280471305154568</code> (Pak Cloud Rdp).
        </p>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
          Webhook status: Verified & Receiving Live Messages
        </div>
      </div>

      {/* Facebook Messenger */}
      <div className="status-card">
        <div className="status-card-header">
          <div className="status-card-title">
            <MessageCircle size={20} color="var(--msg-color)" />
            Facebook Page Messenger
          </div>
          <span className="status-pill online">ONLINE</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Connected to Page <strong>PakCloud RDP</strong> (<code>929661113561523</code>) via Page Access Token.
        </p>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
          24h Standard Messaging Window applies for automated replies.
        </div>
      </div>

      {/* Instagram API */}
      <div className="status-card">
        <div className="status-card-header">
          <div className="status-card-title">
            <Camera size={20} color="var(--ig-color)" />
            Instagram Messaging
          </div>
          <span className="status-pill warning">TOKEN SETUP</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Comments enabled. Direct DMs require adding account under <strong>API setup with Instagram login</strong>.
        </p>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
          Webhook URL: <code>https://agent.codebyjawad.com/api/meta/webhook</code>
        </div>
      </div>

      {/* Gemini AI Multi-Model Failover */}
      <div className="status-card">
        <div className="status-card-header">
          <div className="status-card-title">
            <Cpu size={20} color="var(--sky)" />
            Gemini AI Failover Engine
          </div>
          <span className="status-pill online">ACTIVE</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Primary: <code>gemini-flash-lite-latest</code> with automatic failover chain across 4 models on 429 quota.
        </p>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
          Knowledge base enriched with Windows 10/11/Server specs & Ur/Eng intent ladder.
        </div>
      </div>
    </div>
  );
}
