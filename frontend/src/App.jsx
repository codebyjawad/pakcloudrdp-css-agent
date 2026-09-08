import React, { useState, useEffect, useCallback } from 'react';
import { X, ShieldAlert } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import InboxView from './components/InboxView';
import LiveFeedView from './components/LiveFeedView';
import PlansView from './components/PlansView';
import EscalationsView from './components/EscalationsView';
import SimulatorView from './components/SimulatorView';
import StatusView from './components/StatusView';
import { api } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('inbox');
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [stats, setStats] = useState({ chatsCount: 0, escalationsCount: 0, logsCount: 0 });
  const [_loading, setLoading] = useState(true);
  const [inboxFilter, setInboxFilter] = useState('ALL');
  const [showTokenBanner, setShowTokenBanner] = useState(true);

  const fetchChats = useCallback(async () => {
    try {
      const data = await api.getChats();
      if (data?.chats) {
        setChats(data.chats);
        const escalationsTotal = data.chats.reduce((acc, c) => acc + (c.escalations?.length || 0), 0);
        setStats((prev) => ({
          ...prev,
          chatsCount: data.chats.length,
          escalationsCount: escalationsTotal
        }));
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChats();
    // 5s background polling for live updates
    const interval = setInterval(fetchChats, 5000);
    return () => clearInterval(interval);
  }, [fetchChats]);

  // Tab Title mapping
  const getTabTitle = () => {
    switch (activeTab) {
      case 'inbox': return 'Customer Inbox';
      case 'live-feed': return 'Real-Time Webhook Traffic';
      case 'plans': return 'Dedicated Windows RDP Plans & Pricing';
      case 'escalations': return 'Urgent Escalations Queue';
      case 'simulator': return 'Chatbot Prompt Simulator';
      case 'status': return 'Meta Platform & Service Health';
      default: return 'CSS Agent Dashboard';
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === 'true'; } catch { return false; }
  });
  const handleToggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('sidebarCollapsed', String(next)); } catch {}
      return next;
    });
  };

  // When clicking escalation in Escalations view
  const handleSelectCustomerFromEscalation = (customerId) => {
    setActiveChatId(customerId);
    setInboxFilter('ALL');
    setActiveTab('inbox');
  };

  // When clicking Header pills (e.g. "136 Active" or "18 Escalation(s)")
  const handleHeaderFilterClick = (filterType) => {
    setInboxFilter(filterType);
    setActiveTab('inbox');
  };

  // Detect if any conversation has a confirmed Meta OAuth token delivery failure.
  // We rely solely on the backend-computed flag (requires deliveryStatus==='failed' AND
  // error matching OAuthException|190) to avoid false positives from normal message content.
  const hasTokenError = chats.some((c) => Boolean(c.hasTokenError));

  const [statusModalToOpen, setStatusModalToOpen] = useState(null);

  const handleOpenStatusTokenModal = (modalType = 'whatsapp') => {
    setStatusModalToOpen(modalType);
    setActiveTab('status');
  };

  return (
    <div className="app-container">
      {/* Mobile Sidebar Backdrop */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
      />

      {/* Main Workspace */}
      <main className="app-main">
        {/* Persistent Top Warning Banner for Meta OAuth Token Failure */}
        {hasTokenError && showTokenBanner && (
          <div className="global-alert-banner" role="alert">
            <div className="alert-content">
              <ShieldAlert size={18} className="alert-icon" aria-hidden="true" />
              <div>
                <strong>WhatsApp delivery is failing — Meta token expired (OAuthException 190):</strong> Outbound messages cannot reach customers until the token is refreshed.
              </div>
            </div>
            <div className="alert-actions">
              <button
                type="button"
                className="alert-btn primary"
                onClick={() => handleOpenStatusTokenModal('whatsapp')}
                aria-label="View Meta & System Status to reconnect token"
              >
                Reconnect Token
              </button>
              <button
                type="button"
                className="alert-btn icon"
                onClick={() => setShowTokenBanner(false)}
                title="Dismiss alert banner"
                aria-label="Dismiss delivery warning banner"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        <Header
          title={getTabTitle()}
          onRefresh={fetchChats}
          stats={stats}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onFilterClick={handleHeaderFilterClick}
        />

        {/* Tab Content */}
        {activeTab === 'inbox' && (
          <InboxView
            chats={chats}
            onRefresh={fetchChats}
            activeChatId={activeChatId}
            setActiveChatId={setActiveChatId}
            externalFilter={inboxFilter}
            onClearExternalFilter={() => setInboxFilter('ALL')}
            hasGlobalTokenError={hasTokenError}
            onReconnectToken={() => handleOpenStatusTokenModal('whatsapp')}
          />
        )}

        {activeTab === 'live-feed' && <LiveFeedView />}

        {activeTab === 'plans' && <PlansView />}

        {activeTab === 'escalations' && (
          <EscalationsView onSelectCustomer={handleSelectCustomerFromEscalation} />
        )}

        {activeTab === 'simulator' && <SimulatorView />}

        {activeTab === 'status' && (
          <StatusView
            initialModal={statusModalToOpen}
            onClearInitialModal={() => setStatusModalToOpen(null)}
          />
        )}
      </main>
    </div>
  );
}
