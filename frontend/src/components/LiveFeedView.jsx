import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  RotateCw,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Pause,
  Play
} from 'lucide-react';
import { api } from '../services/api';

export default function LiveFeedView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [filterChannel, setFilterChannel] = useState('ALL');

  const fetchLogs = useCallback(() => {
    api.getWebhookLogs()
      .then((data) => {
        if (data?.logs) setLogs(data.logs);
      })
      .catch((err) => console.error('Failed to load logs:', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLogs();
    if (isPaused) return;

    // 4s live polling while not paused
    const interval = setInterval(fetchLogs, 4000);
    return () => clearInterval(interval);
  }, [fetchLogs, isPaused]);

  const filteredLogs = logs.filter((log) => {
    if (filterChannel === 'ALL') return true;
    return (log.channel || '').toLowerCase() === filterChannel.toLowerCase();
  });

  return (
    <div className="feed-container" aria-label="Meta Webhook Traffic Stream">
      {/* Feed Control Header Card */}
      <div className="feed-header-card">
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} color={isPaused ? 'var(--amber)' : 'var(--emerald)'} aria-hidden="true" />
            Real-Time Meta Webhook Stream
            {isPaused && (
              <span className="stream-paused-tag" aria-label="Stream currently paused">
                PAUSED
              </span>
            )}
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Live monitoring of incoming customer webhook events and outbound CSS agent replies
          </p>
        </div>

        <div className="feed-controls-group">
          {/* Channel Filters */}
          <div className="feed-filter-pills" role="group" aria-label="Filter traffic by channel">
            <button
              type="button"
              className={`feed-filter-btn ${filterChannel === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterChannel('ALL')}
              aria-label="Show all channels"
            >
              All
            </button>
            <button
              type="button"
              className={`feed-filter-btn ${filterChannel === 'WhatsApp' ? 'active' : ''}`}
              onClick={() => setFilterChannel('WhatsApp')}
              aria-label="Filter WhatsApp events"
            >
              WhatsApp
            </button>
            <button
              type="button"
              className={`feed-filter-btn ${filterChannel === 'Messenger' ? 'active' : ''}`}
              onClick={() => setFilterChannel('Messenger')}
              aria-label="Filter Messenger events"
            >
              Messenger
            </button>
            <button
              type="button"
              className={`feed-filter-btn ${filterChannel === 'Instagram' ? 'active' : ''}`}
              onClick={() => setFilterChannel('Instagram')}
              aria-label="Filter Instagram events"
            >
              Instagram
            </button>
          </div>

          {/* Pause / Resume Live Stream Button */}
          <button
            type="button"
            className={`feed-pause-btn ${isPaused ? 'paused' : ''}`}
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Resume live auto-polling' : 'Pause live auto-polling'}
            aria-label={isPaused ? 'Resume live feed auto-refresh' : 'Pause live feed auto-refresh'}
          >
            {isPaused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            <span>{isPaused ? 'Resume Live' : 'Pause Stream'}</span>
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={fetchLogs}
            title="Refresh stream logs now"
            aria-label="Refresh webhook logs manually"
            disabled={loading}
          >
            <RotateCw size={16} className={loading ? 'spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Real-time Stream List with aria-live */}
      <div
        className="feed-items-list"
        aria-live="polite"
        role="log"
        aria-label="Real-time webhook traffic items"
      >
        {filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
            No webhook activity logged for the selected filter.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isDelivered = log.delivered !== false;
            const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';

            return (
              <div key={log.id} className="feed-item-card">
                {/* Meta Event Header Bar */}
                <div className="feed-item-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`channel-badge-chip ${(log.channel || '').toLowerCase()}`}>
                      {log.channel}
                    </span>
                    <strong style={{ fontSize: '13px', color: '#fff' }}>{log.sender || 'Unknown Customer'}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({log.senderId})</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {log.intent && (
                      <span className="intent-pill">
                        {log.intent}
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {timestamp}
                    </span>
                    {isDelivered ? (
                      <CheckCircle2 size={15} color="var(--emerald)" aria-label="Delivered successfully" />
                    ) : (
                      <XCircle size={15} color="var(--rose)" aria-label="Delivery error" />
                    )}
                  </div>
                </div>

                {/* Inbound Customer Query with Sky-Blue Gutter Border */}
                <div className="feed-message-block inbound-block">
                  <div className="feed-direction-tag inbound">
                    <ArrowDownLeft size={13} aria-hidden="true" />
                    <span>INBOUND (Customer)</span>
                  </div>
                  <div className="feed-message-content">
                    {log.inboundText || '—'}
                  </div>
                </div>

                {/* Outbound CSS Agent Reply with Emerald-Green Gutter Border */}
                {log.outboundText && (
                  <div className="feed-message-block outbound-block">
                    <div className="feed-direction-tag outbound">
                      <ArrowUpRight size={13} aria-hidden="true" />
                      <span>OUTBOUND (Agent Reply)</span>
                    </div>
                    <div className="feed-message-content">
                      {log.outboundText}
                    </div>
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
