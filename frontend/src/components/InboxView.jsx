import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Send,
  Pause,
  Play,
  RotateCw,
  Phone,
  MessageCircle,
  Share2,
  CheckCircle2,
  Sparkles,
  X,
  Lightbulb,
  ChevronLeft
} from 'lucide-react';
import ChatBubble from './ChatBubble';
import { api } from '../services/api';

export default function InboxView({ chats, onRefresh, activeChatId, setActiveChatId }) {
  const [filterChannel, setFilterChannel] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeThread, setActiveThread] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [aiPaused, setAiPaused] = useState(false);
  const [mobileView, setMobileView] = useState('list'); // 'list' or 'chat'

  // AI Profit Coach states
  const [coachData, setCoachData] = useState(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [showCoach, setShowCoach] = useState(true);

  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom on message change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch AI Coach suggestions
  const fetchCoach = async (force = false) => {
    if (!activeChatId) return;
    setCoachLoading(true);
    try {
      const data = await api.getAiSuggestions(activeChatId, force);
      setCoachData(data);
    } catch (err) {
      console.warn('Coach fetch error:', err);
    } finally {
      setCoachLoading(false);
    }
  };

  // Load thread whenever activeChatId changes
  useEffect(() => {
    if (!activeChatId) {
      if (chats.length > 0) {
        setActiveChatId(chats[0].sessionId);
      }
      return;
    }

    let isMounted = true;
    setLoadingThread(true);
    setCoachData(null);

    api.getChatThread(activeChatId)
      .then((data) => {
        if (isMounted && data?.chat) {
          setActiveThread(data.chat);
          setAiPaused(Boolean(data.chat.aiPaused));
          // Load coach suggestions
          fetchCoach(false);
        }
      })
      .catch((err) => console.error('Failed to load thread:', err))
      .finally(() => {
        if (isMounted) setLoadingThread(false);
      });

    return () => { isMounted = false; };
  }, [activeChatId, chats]);

  useEffect(() => {
    scrollToBottom();
  }, [activeThread?.history]);

  // Handle manual reply sending
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || sending || !activeChatId) return;

    const textToSend = replyText.trim();
    setReplyText('');
    setSending(true);

    try {
      const res = await api.sendMessage(activeChatId, textToSend, 'Owner');
      if (res?.history) {
        setActiveThread((prev) => prev ? { ...prev, history: res.history } : null);
      }
      if (res && res.success === false) {
        alert(`⚠️ Delivery Failed!\n\nThe message was recorded in the inbox, but Meta rejected delivery to ${activeThread?.channel || 'WhatsApp'}:\n"${res.error || 'Token expired or invalid'}".\n\nPlease verify your Meta Access Token.`);
      }
      onRefresh?.();
    } catch (err) {
      alert(`Could not send message: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  // Handle AI Pause toggle
  const handleToggleAiPause = async () => {
    if (!activeChatId) return;
    const nextState = !aiPaused;
    setAiPaused(nextState);

    try {
      await api.toggleAiPause(activeChatId, nextState);
      onRefresh?.();
    } catch (err) {
      setAiPaused(!nextState); // rollback
      alert(`Could not toggle AI pause: ${err.message}`);
    }
  };

  // Quick canned template inserters
  const insertTemplate = (text) => {
    setReplyText(text);
  };

  const sendFollowup = async () => {
    if (!activeChatId) return;
    if (!confirm('Send approved WhatsApp Plan-Selection Follow-up template to this customer?')) return;
    try {
      await api.sendFollowupTemplate(activeChatId);
      const data = await api.getChatThread(activeChatId);
      if (data?.chat) setActiveThread(data.chat);
      onRefresh?.();
    } catch (err) {
      alert(`Follow-up error: ${err.message}`);
    }
  };

  // Filtering chats
  const filteredChats = chats.filter((c) => {
    // Channel filter
    if (filterChannel === 'WHATSAPP' && c.channel?.toLowerCase() !== 'whatsapp') return false;
    if (filterChannel === 'MESSENGER' && c.channel?.toLowerCase() !== 'messenger') return false;
    if (filterChannel === 'INSTAGRAM' && c.channel?.toLowerCase() !== 'instagram') return false;
    if (filterChannel === 'PAUSED' && !c.aiPaused) return false;
    if (filterChannel === 'ESCALATED' && (!c.escalations || c.escalations.length === 0)) return false;

    // Search filter
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = (c.contactName || '').toLowerCase();
    const sid = (c.sessionId || '').toLowerCase();
    const lastMsg = (c.lastMessage || c.history?.[c.history?.length - 1]?.text || '').toLowerCase();
    return name.includes(q) || sid.includes(q) || lastMsg.includes(q);
  });

  const getChannelBadgeClass = (channel) => {
    const ch = (channel || '').toLowerCase();
    if (ch === 'whatsapp') return 'whatsapp';
    if (ch === 'messenger') return 'messenger';
    if (ch === 'instagram') return 'instagram';
    return 'whatsapp';
  };

  return (
    <div className={`inbox-container mobile-view-${mobileView}`}>
      {/* LEFT PANE: Thread List */}
      <div className="threads-pane">
        <div className="threads-search-bar">
          <div className="search-input-wrap">
            <Search size={16} />
            <input
              type="text"
              className="search-input"
              placeholder="Search customer name, phone, or msg..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-pills-row">
            <button
              className={`filter-pill ${filterChannel === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterChannel('ALL')}
            >
              All ({chats.length})
            </button>
            <button
              className={`filter-pill ${filterChannel === 'WHATSAPP' ? 'active' : ''}`}
              onClick={() => setFilterChannel('WHATSAPP')}
            >
              📱 WhatsApp
            </button>
            <button
              className={`filter-pill ${filterChannel === 'MESSENGER' ? 'active' : ''}`}
              onClick={() => setFilterChannel('MESSENGER')}
            >
              💬 Messenger
            </button>
            <button
              className={`filter-pill ${filterChannel === 'INSTAGRAM' ? 'active' : ''}`}
              onClick={() => setFilterChannel('INSTAGRAM')}
            >
              📸 Instagram
            </button>
            <button
              className={`filter-pill ${filterChannel === 'PAUSED' ? 'active' : ''}`}
              onClick={() => setFilterChannel('PAUSED')}
            >
              ⏸️ Paused
            </button>
            <button
              className={`filter-pill ${filterChannel === 'ESCALATED' ? 'active' : ''}`}
              onClick={() => setFilterChannel('ESCALATED')}
            >
              ⚠️ Escalated
            </button>
          </div>
        </div>

        <div className="threads-list">
          {filteredChats.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No conversations found.
            </div>
          ) : (
            filteredChats.map((c) => {
              const isSelected = c.sessionId === activeChatId;
              const name = c.contactName || c.senderId || c.sessionId;
              const initial = (name[0] || '?').toUpperCase();
              const chClass = getChannelBadgeClass(c.channel);
              const lastText = c.lastMessage || c.history?.[c.history?.length - 1]?.text || 'No messages yet';

              return (
                <div
                  key={c.sessionId}
                  className={`thread-card ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    setActiveChatId(c.sessionId);
                    setMobileView('chat');
                  }}
                >
                  <div className="thread-avatar-wrap">
                    <div className="avatar">{initial}</div>
                    <div className={`channel-badge-icon ${chClass}`}>
                      {chClass === 'whatsapp' && '📱'}
                      {chClass === 'messenger' && '💬'}
                      {chClass === 'instagram' && '📸'}
                    </div>
                  </div>

                  <div className="thread-content">
                    <div className="thread-top-row">
                      <span className="thread-name">{name}</span>
                      <span className="thread-time">
                        {c.lastTime ? new Date(c.lastTime).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                      </span>
                    </div>

                    <div className="thread-preview-row">
                      <span className="thread-snippet">{lastText}</span>
                      <div className="thread-indicators">
                        {c.aiPaused && <span className="tag-mini paused">AI PAUSED</span>}
                        {c.escalations?.length > 0 && <span className="tag-mini escalated">ESCALATED</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANE: Active Conversation */}
      <div className="conversation-pane">
        {activeThread ? (
          <>
            {/* Conversation Header */}
            <div className="chat-header">
              <div className="chat-header-info">
                {/* Mobile Back Button */}
                <button
                  type="button"
                  className="icon-btn mobile-back-btn"
                  onClick={() => setMobileView('list')}
                  title="Back to conversation list"
                  style={{ marginRight: 4 }}
                >
                  <ChevronLeft size={20} />
                </button>

                <div className="avatar">
                  {((activeThread.contactName || activeThread.sessionId || '?')[0]).toUpperCase()}
                </div>
                <div>
                  <h2 className="chat-header-title">
                    {activeThread.contactName || activeThread.sessionId}
                  </h2>
                  <div className="chat-header-sub">
                    <span>{activeThread.channel || 'WhatsApp'}</span>
                    <span>•</span>
                    <span>+{activeThread.senderId || activeThread.sessionId}</span>
                  </div>
                </div>
              </div>

              <div className="chat-header-actions">
                {/* AI Profit Coach Toggle Button */}
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 'auto', padding: '0 12px', gap: 6, fontSize: '12px', color: showCoach ? 'var(--accent-primary)' : 'var(--text-secondary)', background: showCoach ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)' }}
                  onClick={() => {
                    setShowCoach(!showCoach);
                    if (!coachData && !coachLoading) fetchCoach(false);
                  }}
                  title="Toggle AI Profit Coach recommendations"
                >
                  <Sparkles size={15} />
                  <span>AI Coach</span>
                </button>

                {/* AI Pause / Resume Toggle */}
                <div
                  className={`ai-pause-toggle ${aiPaused ? 'paused' : ''}`}
                  onClick={handleToggleAiPause}
                  title="Pause or Resume automatic AI replies for this customer"
                >
                  {aiPaused ? <Pause size={14} /> : <Play size={14} />}
                  <span>{aiPaused ? 'AI Is Paused (Owner Mode)' : 'AI Active (Auto-Reply)'}</span>
                  <div className={`switch-track ${aiPaused ? 'active' : ''}`}>
                    <div className="switch-knob"></div>
                  </div>
                </div>

                <button
                  className="icon-btn"
                  title="Refresh conversation"
                  onClick={() => onRefresh?.()}
                >
                  <RotateCw size={16} />
                </button>
              </div>
            </div>

            {/* AI PROFIT COACH BANNER */}
            {showCoach && (
              <div style={{
                background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.1) 0%, rgba(18, 25, 40, 0.95) 100%)',
                borderBottom: '1px solid rgba(99, 102, 241, 0.25)',
                padding: '12px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                zIndex: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={16} color="var(--accent-primary)" />
                    <strong style={{ fontSize: '13px', color: '#fff' }}>AI Profit Coach</strong>
                    {coachData?.analysis?.intent && (
                      <span className="intent-pill" style={{ fontSize: '11px', padding: '2px 8px' }}>
                        {coachData.analysis.intent}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="template-btn"
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                      disabled={coachLoading}
                      onClick={() => fetchCoach(true)}
                      title="Re-analyze chat using Gemini"
                    >
                      {coachLoading ? 'Analyzing…' : '↻ Re-Analyze'}
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ width: 22, height: 22, border: 'none' }}
                      onClick={() => setShowCoach(false)}
                      title="Hide coach panel"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>

                {coachData ? (
                  <>
                    {coachData.analysis?.summary && (
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        <strong>Chat Context:</strong> {coachData.analysis.summary}
                      </div>
                    )}
                    {coachData.analysis?.closingStrategy && (
                      <div style={{ fontSize: '12.5px', color: '#c7d2fe', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <Lightbulb size={13} color="var(--amber)" style={{ minWidth: 13 }} />
                        <span><strong>Strategy:</strong> {coachData.analysis.closingStrategy}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 700 }}>
                        RECOMMENDED NEXT MESSAGES (CLICK TO INSERT):
                      </span>
                      {(coachData.suggestions || coachData.analysis?.suggestions || []).map((sugg, i) => (
                        <button
                          key={i}
                          type="button"
                          className="template-btn"
                          style={{
                            fontSize: '12px',
                            background: 'rgba(99, 102, 241, 0.15)',
                            borderColor: 'rgba(99, 102, 241, 0.4)',
                            color: '#e0e7ff',
                            maxWidth: '100%',
                            textAlign: 'left',
                            whiteSpace: 'normal',
                            lineHeight: 1.4,
                            padding: '6px 12px'
                          }}
                          onClick={() => setReplyText(sugg)}
                          title="Insert this reply into the message box"
                        >
                          💬 {sugg}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {coachLoading ? 'Analyzing conversation with Gemini…' : 'Click Re-Analyze to generate deal-closing recommendations.'}
                  </div>
                )}
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="chat-messages-area">
              {activeThread.history && activeThread.history.length > 0 ? (
                activeThread.history.map((msg, idx) => (
                  <ChatBubble key={msg.id || idx} message={msg} />
                ))
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto' }}>
                  No message history yet.
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input & Fast Canned Actions */}
            <div className="chat-input-bar">
              {/* Canned Quick Templates */}
              <div className="canned-templates-bar">
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  QUICK REPLIES:
                </span>
                <button
                  type="button"
                  className="template-btn"
                  onClick={() => insertTemplate(
                    "💵 *PAKCLOUDRDP — ALL PLANS (Region: 🇺🇸 US)*\n" +
                    "*(100% Dedicated Machine · Dedicated Private IP · 1 Gbps Port)*\n" +
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                    "1️⃣ *Little*: 1 vCPU · 3 GB RAM · 30 GB NVMe ➔ *₨1,500/mo*\n" +
                    "2️⃣ *Starter*: 4 vCPU · 8 GB RAM · 75 GB NVMe ➔ *₨2,800/mo* ⭐\n" +
                    "3️⃣ *Standard*: 6 vCPU · 12 GB RAM · 100 GB NVMe ➔ *₨3,800/mo*\n" +
                    "4️⃣ *Plus*: 8 vCPU · 24 GB RAM · 200 GB NVMe ➔ *₨7,000/mo*\n" +
                    "5️⃣ *Pro*: 12 vCPU · 48 GB RAM · 250 GB NVMe ➔ *₨12,500/mo*\n" +
                    "6️⃣ *Elite*: 16 vCPU · 64 GB RAM · 300 GB NVMe ➔ *₨18,500/mo*\n" +
                    "7️⃣ *Flagship*: 18 vCPU · 96 GB RAM · 350 GB NVMe ➔ *₨24,400/mo*\n" +
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                    "⚡ Setup: 30 Mins | 💳 JazzCash, Raast, NayaPay, UBL Bank\n" +
                    "Aapko isme se kaunsa plan chahiye? 🚀"
                  )}
                >
                  🇺🇸 All Plans (US)
                </button>
                <button
                  type="button"
                  className="template-btn"
                  onClick={() => insertTemplate(
                    "💵 *PAKCLOUDRDP — ALL PLANS (Region: 🇬🇧 UK)*\n" +
                    "*(100% Dedicated Machine · Dedicated Private IP · 1 Gbps Port)*\n" +
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                    "1️⃣ *Little*: 1 vCPU · 3 GB RAM · 30 GB NVMe ➔ *₨1,500/mo*\n" +
                    "2️⃣ *Starter*: 4 vCPU · 8 GB RAM · 75 GB NVMe ➔ *₨2,800/mo* ⭐\n" +
                    "3️⃣ *Standard*: 6 vCPU · 12 GB RAM · 100 GB NVMe ➔ *₨3,800/mo*\n" +
                    "4️⃣ *Plus*: 8 vCPU · 24 GB RAM · 200 GB NVMe ➔ *₨7,000/mo*\n" +
                    "5️⃣ *Pro*: 12 vCPU · 48 GB RAM · 250 GB NVMe ➔ *₨12,500/mo*\n" +
                    "6️⃣ *Elite*: 16 vCPU · 64 GB RAM · 300 GB NVMe ➔ *₨18,500/mo*\n" +
                    "7️⃣ *Flagship*: 18 vCPU · 96 GB RAM · 350 GB NVMe ➔ *₨24,400/mo*\n" +
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                    "⚡ Setup: 30 Mins | 💳 JazzCash, Raast, NayaPay, UBL Bank\n" +
                    "Aapko isme se kaunsa plan chahiye? 🚀"
                  )}
                >
                  🇬🇧 All Plans (UK)
                </button>
                <button
                  type="button"
                  className="template-btn"
                  onClick={() => insertTemplate(
                    "💵 *PAKCLOUDRDP — ALL PLANS (Region: 🇪🇺 EU / Germany)*\n" +
                    "*(100% Dedicated Machine · Dedicated Private IP · 1 Gbps Port)*\n" +
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                    "1️⃣ *Little*: 1 vCPU · 3 GB RAM · 30 GB NVMe ➔ *₨1,500/mo*\n" +
                    "2️⃣ *Starter*: 4 vCPU · 8 GB RAM · 75 GB NVMe ➔ *₨2,800/mo* ⭐\n" +
                    "3️⃣ *Standard*: 6 vCPU · 12 GB RAM · 100 GB NVMe ➔ *₨3,800/mo*\n" +
                    "4️⃣ *Plus*: 8 vCPU · 24 GB RAM · 200 GB NVMe ➔ *₨7,000/mo*\n" +
                    "5️⃣ *Pro*: 12 vCPU · 48 GB RAM · 250 GB NVMe ➔ *₨12,500/mo*\n" +
                    "6️⃣ *Elite*: 16 vCPU · 64 GB RAM · 300 GB NVMe ➔ *₨18,500/mo*\n" +
                    "7️⃣ *Flagship*: 18 vCPU · 96 GB RAM · 350 GB NVMe ➔ *₨24,400/mo*\n" +
                    "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                    "⚡ Setup: 30 Mins | 💳 JazzCash, Raast, NayaPay, UBL Bank\n" +
                    "Aapko isme se kaunsa plan chahiye? 🚀"
                  )}
                >
                  🇪🇺 All Plans (EU)
                </button>
                <button
                  type="button"
                  className="template-btn"
                  onClick={() => insertTemplate(
                    "Payment Details:\n" +
                    "• JazzCash: 03035421390 (Muhammad Jawad)\n" +
                    "• Raast ID: 03035421390\n" +
                    "• NayaPay: 03035421390\n" +
                    "• UBL Bank: 282433917 (Muhammad Jawad)\n\n" +
                    "Payment bhej kar screenshot yahan share kar dein, 30 min me machine deliver ho jayegi."
                  )}
                >
                  💳 Payment Accounts
                </button>
                <button
                  type="button"
                  className="template-btn"
                  onClick={() => insertTemplate('Payment screenshot milne ke 30 minutes ke andar aapka dedicated RDP credentials ke sath deliver ho jayega.')}
                >
                  🚀 30-Min Delivery
                </button>
                {activeThread.channel?.toLowerCase() === 'whatsapp' && (
                  <button
                    type="button"
                    className="template-btn"
                    style={{ color: 'var(--emerald)' }}
                    onClick={sendFollowup}
                  >
                    ✨ Send Follow-up Template
                  </button>
                )}
              </div>

              {/* Message Input Box */}
              <form className="input-form-row" onSubmit={handleSendMessage}>
                <textarea
                  className="chat-textarea"
                  placeholder="Type a direct message as Owner... (Press Enter to send, Shift+Enter for new line)"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  rows={1}
                />
                <button
                  type="submit"
                  className="send-btn"
                  disabled={!replyText.trim() || sending}
                  title="Send message"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            Select a conversation to view chat history.
          </div>
        )}
      </div>
    </div>
  );
}
