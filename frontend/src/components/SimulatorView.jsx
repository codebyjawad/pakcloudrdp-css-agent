import React, { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { api } from '../services/api';

export default function SimulatorView() {
  const [channel, setChannel] = useState('WhatsApp');
  const [senderName, setSenderName] = useState('Ali Khan');
  const [senderPhone, setSenderPhone] = useState('923001234567');
  const [messageText, setMessageText] = useState('salam, sasta rdp chahiye');
  const [hasImage, setHasImage] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState(null);

  const handleSimulate = async (e) => {
    e.preventDefault();
    if (!messageText.trim() || simulating) return;

    setSimulating(true);
    try {
      const res = await api.simulateMessage({
        channel,
        senderName,
        senderPhone,
        messageText,
        hasImage
      });
      setSimulationResult(res);
    } catch (err) {
      alert(`Simulation failed: ${err.message}`);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="simulator-layout">
      {/* Left: Input parameters */}
      <div className="simulator-form-panel">
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <PlayCircle size={18} color="var(--accent-primary)" />
          Chatbot Simulator Sandbox
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Test customer queries through the intent ladder and Gemini fallback without messaging real customers.
        </p>

        <form onSubmit={handleSimulate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Channel</label>
            <select
              className="form-select"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="WhatsApp">📱 WhatsApp</option>
              <option value="Messenger">💬 Facebook Messenger</option>
              <option value="Instagram">📸 Instagram</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Simulated Sender Name</label>
            <input
              type="text"
              className="form-input"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Phone / Recipient ID</label>
            <input
              type="text"
              className="form-input"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Customer Query / Message</label>
            <textarea
              className="form-input"
              rows={3}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="e.g. Sasta RDP price, payment details, or technical questions..."
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px' }}>
            <input
              type="checkbox"
              id="simImage"
              checked={hasImage}
              onChange={(e) => setHasImage(e.target.checked)}
            />
            <label htmlFor="simImage" style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Simulate payment screenshot attached
            </label>
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ justifyContent: 'center', marginTop: 8 }}
            disabled={simulating}
          >
            {simulating ? 'Analyzing Query...' : 'Run Simulation'}
          </button>
        </form>
      </div>

      {/* Right: Response Inspection */}
      <div className="simulator-response-panel">
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color="var(--sky)" />
          AI Reasoning & Outbound Response
        </h3>

        {simulationResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Intent & Escalation Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="intent-pill" style={{ fontSize: '12px', padding: '4px 10px' }}>
                Intent: {simulationResult.agentResult?.intent || 'UNKNOWN'}
              </span>
              {simulationResult.agentResult?.escalation && (
                <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'rgba(244,63,94,0.18)', color: 'var(--rose)', fontWeight: 600 }}>
                  🚨 Escalated to Owner
                </span>
              )}
            </div>

            {/* Generated Reply */}
            <div style={{ background: 'var(--bubble-agent)', padding: 16, borderRadius: 'var(--radius-lg)', border: '1px solid rgba(14,165,233,0.3)' }}>
              <div style={{ fontSize: '11px', color: 'var(--sky)', fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bot size={14} />
                CUSTOMER-FACING AUTO-REPLY:
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', color: '#fff', lineHeight: 1.6 }}>
                {simulationResult.agentResult?.replyText}
              </div>
            </div>

            {/* Diagnostic Details */}
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 14, borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--text-muted)' }}>
              <strong>Pipeline Meta:</strong> Delivered timestamp {simulationResult.log?.timestamp} • Modeled with Gemini Flash & Intent Ladder.
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', margin: 'auto' }}>
            Enter a test query on the left and click "Run Simulation" to inspect how the agent responds.
          </div>
        )}
      </div>
    </div>
  );
}
