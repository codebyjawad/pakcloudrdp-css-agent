import React, { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, RotateCw, UserCheck } from 'lucide-react';
import { api } from '../services/api';

export default function EscalationsView({ onSelectCustomer }) {
  const [escalations, setEscalations] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEscalations = () => {
    api.getEscalations()
      .then((data) => {
        if (data?.escalations) setEscalations(data.escalations);
      })
      .catch((err) => console.error('Failed to load escalations:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEscalations();
  }, []);

  const handleResolve = async (id) => {
    try {
      await api.resolveEscalation(id);
      fetchEscalations();
    } catch (err) {
      alert(`Could not resolve escalation: ${err.message}`);
    }
  };

  return (
    <div className="escalations-list">
      <div className="feed-header-card">
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} color="var(--rose)" />
            Urgent Customer Escalation Queue
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Issues flagged for owner intervention (Payment proofs, custom quotes, repeat complaints)
          </p>
        </div>

        <button className="icon-btn" onClick={fetchEscalations} title="Refresh">
          <RotateCw size={16} />
        </button>
      </div>

      {escalations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--emerald)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={36} />
          <span>All customer escalations resolved! No pending items.</span>
        </div>
      ) : (
        escalations.map((esc) => (
          <div key={esc.id} className="escalation-card">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'rgba(244,63,94,0.18)', color: 'var(--rose)' }}>
                  {esc.priority || 'HIGH'} PRIORITY
                </span>
                <strong style={{ color: '#fff', fontSize: '14px' }}>
                  {esc.customerName || esc.customerId}
                </strong>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  ({esc.customerId})
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: 4 }}>
                <strong>Reason:</strong> {esc.reason || esc.type}
              </p>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Triggered at: {esc.createdAt ? new Date(esc.createdAt).toLocaleString() : 'Just now'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {onSelectCustomer && (
                <button
                  className="btn-primary"
                  style={{ background: 'rgba(255,255,255,0.06)', boxShadow: 'none' }}
                  onClick={() => onSelectCustomer(esc.customerId)}
                >
                  <UserCheck size={15} />
                  Open Chat
                </button>
              )}
              <button
                className="btn-primary"
                style={{ background: 'var(--emerald)', boxShadow: '0 2px 10px rgba(16,185,129,0.3)' }}
                onClick={() => handleResolve(esc.id)}
              >
                <CheckCircle2 size={15} />
                Mark Resolved
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
