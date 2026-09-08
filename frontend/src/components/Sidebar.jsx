import React from 'react';
import {
  MessageSquare,
  Activity,
  CreditCard,
  AlertTriangle,
  PlayCircle,
  ShieldCheck,
  ExternalLink,
  Bot,
  X
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, stats, isOpen, onClose }) {
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
    <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="brand-icon">
          <Bot size={22} />
        </div>
        <div className="brand-info">
          <h1>PakCloudRDP</h1>
          <span>
            <span className="live-indicator"></span>
            AI CSS Agent v2.0
          </span>
        </div>
        <button
          className="icon-btn sidebar-close-btn"
          onClick={onClose}
          title="Close sidebar"
        >
          <X size={16} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => handleNavClick(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`nav-badge ${item.danger ? 'danger' : ''}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer with Link to Classic/Legacy Dashboard */}
      <div className="sidebar-footer">
        <a href="/legacy" className="legacy-switch-btn" title="Open classic HTML dashboard">
          <ExternalLink size={14} />
          Switch to Classic View
        </a>
      </div>
    </aside>
  );
}
