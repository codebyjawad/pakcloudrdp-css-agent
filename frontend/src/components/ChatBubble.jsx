import React from 'react';
import { Bot, User, ShieldAlert, CheckCheck, Clock, AlertCircle, RotateCw } from 'lucide-react';

export default function ChatBubble({ message, onRetry }) {
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
    <div className={`message-row ${message.sender} ${isFailed ? 'has-delivery-failure' : ''}`}>
      {/* Sender Identifier */}
      <div className="message-sender-tag">
        {isUser && <User size={12} aria-hidden="true" />}
        {isAgent && <Bot size={12} aria-hidden="true" />}
        {isOwner && <ShieldAlert size={12} aria-hidden="true" />}
        <span>
          {isUser && 'Customer'}
          {isAgent && 'AI Agent'}
          {isOwner && 'Owner (Direct)'}
        </span>
      </div>

      {/* Bubble Content */}
      <div className={`message-bubble ${isFailed ? 'failed-bubble' : ''}`}>
        <div style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>

        {/* Prominent Failed Delivery Notice & Retry Affordance */}
        {isFailed && (
          <div className="delivery-failure-box">
            <div className="delivery-failure-details">
              <AlertCircle size={14} className="failure-icon" aria-hidden="true" />
              <div className="failure-text">
                <strong>Delivery Failed:</strong>
                <span>{message.deliveryError || 'Meta Graph API rejection (OAuth or Network error)'}</span>
              </div>
            </div>

            {onRetry && (
              <button
                type="button"
                className="retry-dispatch-btn"
                onClick={() => onRetry(message)}
                aria-label={`Retry sending message: ${message.text?.slice(0, 30)}`}
                title="Retry delivering this message to the customer"
              >
                <RotateCw size={12} aria-hidden="true" />
                <span>Retry</span>
              </button>
            )}
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
            {isFailed && (
              <span className="status-indicator-failed" title={message.deliveryError || 'Delivery Failed'}>
                <AlertCircle size={13} color="var(--rose)" aria-label="Delivery failed" />
              </span>
            )}
            {isSending && (
              <Clock size={13} style={{ opacity: 0.7 }} aria-label="Sending in progress" />
            )}
            {!isFailed && !isSending && (
              <CheckCheck size={13} style={{ opacity: 0.7 }} aria-label="Delivered successfully" />
            )}
          </>
        )}
      </div>
    </div>
  );
}
