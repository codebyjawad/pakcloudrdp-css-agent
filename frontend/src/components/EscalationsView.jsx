import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RotateCw,
  MessageSquare,
  Clock,
  Layers
} from 'lucide-react';
import { api } from '../services/api';
import { formatRelativeTime, getCustomerDisplayName } from '../utils/formatters';

export default function EscalationsView({ onSelectCustomer }) {
  const [escalations, setEscalations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState(null);

  const fetchEscalations = () => {
    setLoading(true);
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

  const handleResolve = async (id, customerName) => {
    const ok = window.confirm(`Mark escalation for "${customerName}" as resolved?`);
    if (!ok) return;

    setResolvingId(id);
    try {
      await api.resolveEscalation(id);
      fetchEscalations();
    } catch (err) {
      alert(`Could not resolve escalation: ${err.message}`);
    } finally {
      setResolvingId(null);
    }
  };

  // Group escalations by customerId so duplicate tickets don't clutter the UI
  const groupedEscalations = useMemo(() => {
    const groups = {};
    for (const esc of escalations) {
      const key = esc.customerId || esc.customerName || esc.id;
      if (!groups[key]) {
        groups[key] = {
          customerId: esc.customerId,
          customerName: esc.customerName || esc.customerId,
          primaryEscalation: esc,
          allTickets: [esc],
          highestPriority: (esc.priority || 'HIGH').toUpperCase(),
          latestTimestamp: esc.timestamp || esc.createdAt
        };
      } else {
        groups[key].allTickets.push(esc);
        // Elevate priority if any ticket is URGENT / HIGH
        const currentPrio = (esc.priority || 'HIGH').toUpperCase();
        if (currentPrio === 'URGENT' || currentPrio === 'HIGH') {
          groups[key].highestPriority = currentPrio;
        }
        // Track latest timestamp
        const t = esc.timestamp || esc.createdAt;
        if (t && (!groups[key].latestTimestamp || new Date(t) > new Date(groups[key].latestTimestamp))) {
          groups[key].latestTimestamp = t;
        }
      }
    }
    return Object.values(groups);
  }, [escalations]);

  return (
    <div className="escalations-layout" aria-label="Customer Escalations View">
      <div className="feed-header-card">
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} color="var(--rose)" aria-hidden="true" />
            Urgent Customer Escalations Queue
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Issues flagged for owner intervention (Payment proofs, custom quotes, repeat complaints)
          </p>
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={fetchEscalations}
          title="Refresh Escalations"
          aria-label="Refresh Escalations Queue"
          disabled={loading}
        >
          <RotateCw size={16} className={loading ? 'spin' : ''} aria-hidden="true" />
        </button>
      </div>

      {groupedEscalations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--emerald)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <CheckCircle2 size={40} aria-hidden="true" />
          <strong style={{ fontSize: '15px' }}>All customer escalations resolved!</strong>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No pending customer tickets requiring owner intervention.</span>
        </div>
      ) : (
        <div className="escalations-grid" role="feed" aria-label="Active escalation cards">
          {groupedEscalations.map((group) => {
            const esc = group.primaryEscalation;
            const displayName = getCustomerDisplayName(esc);
            const isUrgent = group.highestPriority === 'URGENT' || group.highestPriority === 'HIGH';
            const relTime = formatRelativeTime(group.latestTimestamp);
            const ticketCount = group.allTickets.length;

            return (
              <div
                key={esc.id}
                className={`escalation-card ${isUrgent ? 'priority-high' : 'priority-medium'}`}
                role="article"
                aria-label={`Escalation for ${displayName}, priority ${group.highestPriority}`}
              >
                <div className="escalation-body">
                  <div className="escalation-meta-row">
                    <span className={`escalation-priority-badge ${isUrgent ? 'badge-high' : 'badge-medium'}`}>
                      {group.highestPriority} PRIORITY
                    </span>

                    {ticketCount > 1 && (
                      <span className="escalation-count-badge" title={`${ticketCount} repeat triggers from this customer`}>
                        <Layers size={11} aria-hidden="true" />
                        {ticketCount} tickets
                      </span>
                    )}

                    <strong className="escalation-customer-name" title={displayName}>
                      {displayName}
                    </strong>

                    <span className="escalation-id-tag">
                      {esc.customerId}
                    </span>
                  </div>

                  <p className="escalation-reason-text">
                    <strong>Reason:</strong> {esc.reason || esc.type || 'Requires manual owner intervention'}
                  </p>

                  <div className="escalation-footer-meta">
                    <Clock size={12} color="var(--text-muted)" aria-hidden="true" />
                    <span>Triggered: <strong>{relTime || 'Recent'}</strong></span>
                    {esc.channel && (
                      <>
                        <span>•</span>
                        <span>Channel: <strong>{esc.channel}</strong></span>
                      </>
                    )}
                  </div>
                </div>

                {/* Inverted Button Hierarchy: Open Chat is Primary, Resolve is Secondary Outline */}
                <div className="escalation-actions">
                  {onSelectCustomer && (
                    <button
                      type="button"
                      className="btn-primary escalation-chat-btn"
                      onClick={() => onSelectCustomer(esc.customerId)}
                      aria-label={`Open conversation with ${displayName}`}
                    >
                      <MessageSquare size={15} aria-hidden="true" />
                      <span>Open Chat</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="escalation-resolve-btn"
                    onClick={() => handleResolve(esc.id, displayName)}
                    disabled={resolvingId === esc.id}
                    aria-label={`Mark escalation for ${displayName} as resolved`}
                  >
                    <CheckCircle2 size={15} aria-hidden="true" />
                    <span>{resolvingId === esc.id ? 'Resolving…' : 'Resolve'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
