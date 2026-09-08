import React from 'react';
import {
  MessageSquare,
  Activity,
  CreditCard,
  AlertTriangle,
  PlayCircle,
  ShieldCheck,
  ExternalLink,
  X,
  User,
  Settings,
  PanelLeftClose
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, stats, isOpen, onClose, collapsed, onToggleCollapse }) {
  const navItems = [
    { id: 'inbox', label: 'Customer Inbox', icon: MessageSquare, badge: stats.chatsCount },
    { id: 'live-feed', label: 'Live Traffic Feed', icon: Activity, badge: stats.logsCount },
    { id: 'plans', label: 'Plans & Pricing', icon: CreditCard },
    { id: 'escalations', label: 'Escalations', icon: AlertTriangle, badge: stats.escalationsCount, danger: stats.escalationsCount > 0 },
    { id: 'simulator', label: 'AI Simulator', icon: PlayCircle },
    { id: 'status', label: 'Meta & System Status', icon: ShieldCheck }
  ];

  const handleNavClick = (id) => {
    setActiveTab(id);
    if (onClose) onClose();
  };

  return (
    <aside
      className={`app-sidebar ${isOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}
      aria-label="Main sidebar navigation"
    >
      {/* Brand Header */}
      <div className="sidebar-header">
        {/* Logo — clickable to expand when collapsed */}
        {collapsed ? (
          <button
            type="button"
            className="brand-icon-btn"
            onClick={onToggleCollapse}
            title="Expand sidebar"
            aria-label="Expand navigation sidebar"
          >
            <img src="/logo.png" alt="PakCloudRDP logo" className="sidebar-logo-img" />
          </button>
        ) : (
          <div className="brand-icon" aria-hidden="true">
            <img src="/logo.png" alt="PakCloudRDP logo" className="sidebar-logo-img" />
          </div>
        )}

        {!collapsed && (
          <div className="brand-info">
            <h1>PakCloudRDP</h1>
            <span>
              <span className="live-indicator" aria-hidden="true"></span>
              AI CSS Agent v2.0
            </span>
          </div>
        )}

        {/* Collapse button — only visible in expanded state */}
        {!collapsed && onToggleCollapse && (
          <button
            type="button"
            className="icon-btn sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title="Collapse sidebar"
            aria-label="Collapse navigation sidebar"
          >
            <PanelLeftClose size={16} aria-hidden="true" />
          </button>
        )}

        {/* Mobile close button */}
        <button
          type="button"
          className="icon-btn sidebar-close-btn"
          onClick={onClose}
          title="Close navigation sidebar"
          aria-label="Close navigation sidebar"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav" aria-label="Primary application navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''} ${collapsed ? 'icon-only' : ''}`}
              onClick={() => handleNavClick(item.id)}
              title={collapsed ? item.label : undefined}
              aria-label={`${item.label}${item.badge ? ` (${item.badge})` : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              {!collapsed && <span>{item.label}</span>}
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`nav-badge ${item.danger ? 'danger' : ''} ${collapsed ? 'collapsed-badge' : ''}`}
                  aria-hidden="true"
                >
                  {!collapsed && item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Bottom / Owner Account & Settings Affordance */}
      {!collapsed && (
        <div className="sidebar-bottom-section">
          {/* Owner Profile Card */}
          <div className="sidebar-profile-card">
            <div className="profile-avatar-wrap">
              <div className="profile-avatar">
                <User size={15} />
              </div>
              <span className="profile-status-dot" title="Server online"></span>
            </div>
            <div className="profile-details">
              <span className="profile-name">Jawad (Admin)</span>
              <span className="profile-role">Owner & Operator</span>
            </div>
            <button
              type="button"
              className="profile-action-btn"
              onClick={() => handleNavClick('status')}
              title="Meta & System Status"
              aria-label="Open Meta & System Status settings"
            >
              <Settings size={14} aria-hidden="true" />
            </button>
          </div>

          {/* Dedicated Switch to Classic Dashboard Link */}
          <div className="sidebar-footer">
            <a
              href="/legacy"
              className="legacy-switch-btn"
              title="Open classic HTML dashboard"
              aria-label="Switch to Classic HTML view"
            >
              <ExternalLink size={14} aria-hidden="true" />
              <span>Switch to Classic View</span>
            </a>
          </div>
        </div>
      )}
    </aside>
  );
}
