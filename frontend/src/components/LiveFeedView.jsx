import React, { useState, useEffect } from 'react';
import { Activity, RotateCw, CheckCircle2, XCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { api } from '../services/api';

export default function LiveFeedView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = () => {
    api.getWebhookLogs()
      .then((data) => {
        if (data?.logs) setLogs(data.logs);
      })
      .catch((err) => console.error('Failed to load logs:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 4000); // 4s live polling
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="feed-container">
      <div className="feed-header-card">
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} color="var(--emerald)" />
            Real-Time Meta Webhook Stream
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Live monitoring of customer inbound events and automated CSS agent replies
          </p>
        </div>

        <button className="icon-btn" onClick={fetchLogs} title="Refresh Logs">
          <RotateCw size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            No webhook activity logged yet.
          </div>
        ) : (
          logs.map((log) => {
            const isDelivered = log.delivered !== false;
            return (
              <div key={log.id} className="feed-item-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      background: log.channel === 'WhatsApp' ? 'var(--wa-bg)' : 'var(--msg-bg)',
                      color: log.channel === 'WhatsApp' ? 'var(--wa-color)' : 'var(--msg-color)'
                    }}>
                      {log.channel}
                    </span>
                    <strong style={{ fontSize: '13px', color: '#fff' }}>{log.sender}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({log.senderId})</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {log.intent && (
                      <span className="intent-pill">
                        {log.intent}
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                    </span>
                    {isDelivered ? (
                      <CheckCircle2 size={15} color="var(--emerald)" title="Delivered successfully" />
                    ) : (
                      <XCircle size={15} color="var(--rose)" title="Delivery issue" />
                    )}
                  </div>
                </div>

                {/* Inbound customer message */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '13px', color: 'var(--text-secondary)' }}>
                  <ArrowDownLeft size={15} color="var(--sky)" style={{ minWidth: 15, marginTop: 2 }} />
                  <span>{log.inboundText}</span>
                </div>

                {/* Outbound Agent reply */}
                {log.outboundText && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '13px', color: '#cbd5e1', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                    <ArrowUpRight size={15} color="var(--emerald)" style={{ minWidth: 15, marginTop: 2 }} />
                    <span style={{ whiteSpace: 'pre-wrap' }}>{log.outboundText}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
