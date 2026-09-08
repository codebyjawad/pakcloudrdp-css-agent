import React, { useState, useEffect, useCallback } from 'react';
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
  const [loading, setLoading] = useState(true);

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
      case 'escalations': return 'Urgent Escalations';
      case 'simulator': return 'Chatbot Prompt Simulator';
      case 'status': return 'Meta Platform & Service Health';
      default: return 'CSS Agent Dashboard';
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSelectCustomerFromEscalation = (customerId) => {
    setActiveChatId(customerId);
    setActiveTab('inbox');
  };

  return (
    <div className="app-container">
      {/* Mobile Sidebar Backdrop */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Workspace */}
      <main className="app-main">
        <Header
          title={getTabTitle()}
          onRefresh={fetchChats}
          stats={stats}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Tab Content */}
        {activeTab === 'inbox' && (
          <InboxView
            chats={chats}
            onRefresh={fetchChats}
            activeChatId={activeChatId}
            setActiveChatId={setActiveChatId}
          />
        )}

        {activeTab === 'live-feed' && <LiveFeedView />}

        {activeTab === 'plans' && <PlansView />}

        {activeTab === 'escalations' && (
          <EscalationsView onSelectCustomer={handleSelectCustomerFromEscalation} />
        )}

        {activeTab === 'simulator' && <SimulatorView />}

        {activeTab === 'status' && <StatusView />}
      </main>
    </div>
  );
}
