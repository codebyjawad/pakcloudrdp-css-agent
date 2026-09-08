import React from 'react';
import { RotateCw, Menu, AlertTriangle, MessageSquare } from 'lucide-react';

export default function Header({ title, onRefresh, stats, onToggleSidebar, onFilterClick }) {
  return (
    <header className="top-header">
      <div className="header-left">
        <button
          type="button"
          className="icon-btn mobile-menu-btn"
          onClick={onToggleSidebar}
          title="Open navigation menu"
          aria-label="Open navigation sidebar"
        >
          <Menu size={18} aria-hidden="true" />
        </button>

        <h2 className="header-title">{title}</h2>

        {/* Interactive Header Quick-Filter Chips */}
        <button
          type="button"
          className="header-meta-pill interactive"
          onClick={() => onFilterClick && onFilterClick('ALL')}
          title="View all active conversations in Customer Inbox"
          aria-label={`View all ${stats.chatsCount} active conversations`}
        >
          <span className="live-indicator" aria-hidden="true"></span>
          <MessageSquare size={13} aria-hidden="true" />
          <span>{stats.chatsCount} Active Conversations</span>
        </button>

        {stats.escalationsCount > 0 && (
          <button
            type="button"
            className="header-meta-pill interactive escalation-pill"
            onClick={() => onFilterClick && onFilterClick('ESCALATED')}
            title="Filter inbox to urgent escalations"
            aria-label={`Filter inbox to ${stats.escalationsCount} urgent escalations`}
          >
            <AlertTriangle size={13} aria-hidden="true" />
            <span>⚠️ {stats.escalationsCount} Escalation(s)</span>
          </button>
        )}
      </div>

      <div className="header-right">
        <button
          type="button"
          className="icon-btn"
          title="Refresh dashboard data"
          aria-label="Refresh dashboard data"
          onClick={onRefresh}
        >
          <RotateCw size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
