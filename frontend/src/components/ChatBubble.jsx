import React from 'react';
import { Bot, User, ShieldAlert, CheckCheck, Clock, AlertCircle } from 'lucide-react';

export default function ChatBubble({ message }) {
  const isUser = message.sender === 'user';
  const isAgent = message.sender === 'agent';
  const isOwner = message.sender === 'owner';
  const isFailed = message.deliveryStatus === 'failed' || Boolean(message.deliveryError);
  const isSending = message.deliveryStatus === 'sending';

  const formatTime = (ts) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className={`message-row ${message.sender}`}>
      {/* Sender Identifier */}
      <div className="message-sender-tag">
        {isUser && <User size={12} />}
        {isAgent && <Bot size={12} />}
        {isOwner && <ShieldAlert size={12} />}
        <span>
          {isUser && 'Customer'}
          {isAgent && 'AI Agent'}
          {isOwner && 'Owner (Direct)'}
        </span>
      </div>

      {/* Bubble Content */}
      <div className={`message-bubble ${isFailed ? 'failed-bubble' : ''}`} style={isFailed ? { border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.08)' } : {}}>
        <div style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>

        {/* Failed Delivery Notice */}
        {isFailed && (
          <div style={{
            marginTop: '8px',
            paddingTop: '6px',
            borderTop: '1px dashed rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            color: '#f87171',
            fontWeight: 500
          }}>
            <AlertCircle size={13} style={{ flexShrink: 0 }} />
            <span>Delivery Failed: {message.deliveryError || 'Meta delivery error'}</span>
          </div>
        )}
      </div>

      {/* Message Footer: Timestamp & Intent */}
      <div className="message-footer">
        {message.intent && (
          <span className="intent-pill">
            {message.intent}
          </span>
        )}
        <span>{formatTime(message.timestamp)}</span>
        {(isAgent || isOwner) && (
          <>
            {isFailed && <AlertCircle size={13} style={{ color: '#ef4444' }} title={message.deliveryError || 'Delivery Failed'} />}
            {isSending && <Clock size={13} style={{ opacity: 0.7 }} title="Sending..." />}
            {!isFailed && !isSending && <CheckCheck size={13} style={{ opacity: 0.7 }} title="Delivered" />}
          </>
        )}
      </div>
    </div>
  );
}
