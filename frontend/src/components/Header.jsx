import React from 'react';
import { RotateCw, ExternalLink, Menu } from 'lucide-react';

export default function Header({ title, onRefresh, stats, onToggleSidebar }) {
  return (
    <header className="top-header">
      <div className="header-left">
        <button
          className="icon-btn mobile-menu-btn"
          onClick={onToggleSidebar}
          title="Open menu"
        >
          <Menu size={18} />
        </button>

        <h2 className="header-title">{title}</h2>
        <div className="header-meta-pill">
          <span className="live-indicator"></span>
          <span>{stats.chatsCount} Active Conversations</span>
        </div>
        {stats.escalationsCount > 0 && (
          <div className="header-meta-pill" style={{ borderColor: 'rgba(244,63,94,0.4)', color: 'var(--rose)' }}>
            ⚠️ {stats.escalationsCount} Escalation(s)
          </div>
        )}
      </div>

      <div className="header-right">
        <button
          className="icon-btn"
          title="Refresh dashboard data"
          onClick={onRefresh}
        >
          <RotateCw size={16} />
        </button>

        <a
          href="/legacy"
          className="btn-primary"
          style={{ background: 'rgba(255,255,255,0.06)', boxShadow: 'none', color: '#cbd5e1', textDecoration: 'none' }}
          title="Open previous classic interface"
        >
          <ExternalLink size={14} />
          <span className="classic-btn-label">Classic View</span>
        </a>
      </div>
    </header>
  );
}
