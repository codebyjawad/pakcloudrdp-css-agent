import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Send,
  Pause,
  Play,
  RotateCw,
  Sparkles,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  MessageSquare,
  Copy,
  FileText,
  Check,
  AlertTriangle,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import ChatBubble from './ChatBubble';
import { api } from '../services/api';
import { formatRelativeTime, getCustomerDisplayName, getAvatarInitial } from '../utils/formatters';

export default function InboxView({
  chats,
  onRefresh,
  activeChatId,
  setActiveChatId,
  externalFilter,
  onClearExternalFilter,
  hasGlobalTokenError = false,
  onReconnectToken = null
}) {
  const [filterChannel, setFilterChannel] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL', 'ESCALATED', 'PAUSED', 'AWAITING_REPLY', 'UNREAD'
  const [searchQuery, setSearchQuery] = useState('');
  const [activeThread, setActiveThread] = useState(null);
  const [_loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [aiPaused, setAiPaused] = useState(false);
  const [mobileView, setMobileView] = useState('list'); // 'list' or 'chat'

  // AI Profit Coach states
  const [coachData, setCoachData] = useState(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [assistantDockOpen, setAssistantDockOpen] = useState(true);
  const [dockTab, setDockTab] = useState('coach'); // 'coach', 'quotes', or 'notes'

  // Customer Notes states
  const [customerNotes, setCustomerNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSavedStatus, setNotesSavedStatus] = useState(null); // 'saved' | 'error' | null

  // Threads pane collapse
  const [threadsCollapsed, setThreadsCollapsed] = useState(() => {
    try { return localStorage.getItem('threadsCollapsed') === 'true'; } catch { return false; }
  });
  const handleToggleThreadsCollapse = () => {
    setThreadsCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('threadsCollapsed', String(next)); } catch {}
      return next;
    });
  };

  // Scroll management refs and states
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const [hasNewUnseenMessages, setHasNewUnseenMessages] = useState(false);
  const prevChatIdRef = useRef(activeChatId);
  const prevHistoryLengthRef = useRef(0);

  // Auto-resize composer textarea as text grows up to 140px
  const handleTextareaChange = (e) => {
    setReplyText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px';
  };

  // Sync external filter from header chips if triggered
  useEffect(() => {
    if (externalFilter) {
      if (externalFilter === 'ESCALATED') {
        setFilterStatus('ESCALATED');
        setFilterChannel('ALL');
      } else if (externalFilter === 'ALL') {
        setFilterStatus('ALL');
        setFilterChannel('ALL');
      }
    }
  }, [externalFilter]);

  // Check if user is scrolled near bottom of messages
  const checkIfAtBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= 80;
  }, []);

  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom();
    isAtBottomRef.current = atBottom;
    setShowScrollBottomBtn(!atBottom);
    if (atBottom) {
      setHasNewUnseenMessages(false);
    }
  }, [checkIfAtBottom]);

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior
    });
    isAtBottomRef.current = true;
    setShowScrollBottomBtn(false);
    setHasNewUnseenMessages(false);
  }, []);

  // Fetch AI Coach suggestions
  const fetchCoach = useCallback(async (chatId, force = false) => {
    const targetId = chatId || activeChatId;
    if (!targetId) return;
    setCoachLoading(true);
    try {
      const data = await api.getAiSuggestions(targetId, force);
      setCoachData(data);
    } catch (err) {
      console.warn('Coach fetch error:', err);
    } finally {
      setCoachLoading(false);
    }
  }, [activeChatId]);

  // Select first chat if none selected initially
  useEffect(() => {
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].sessionId);
    }
  }, [activeChatId, chats, setActiveChatId]);

  // Load thread whenever activeChatId changes
  useEffect(() => {
    if (!activeChatId) return;

    let isMounted = true;
    setLoadingThread(true);
    setCoachData(null);
    isAtBottomRef.current = true;
    setShowScrollBottomBtn(false);
    setHasNewUnseenMessages(false);

    api.getChatThread(activeChatId)
      .then((data) => {
        if (isMounted && data?.chat) {
          setActiveThread(data.chat);
          setAiPaused(Boolean(data.chat.aiPaused));
          setCustomerNotes(data.chat.notes || '');
          setNotesSavedStatus(null);
          fetchCoach(activeChatId, false);

          requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
          });
        }
      })
      .catch((err) => console.error('Failed to load thread:', err))
      .finally(() => {
        if (isMounted) setLoadingThread(false);
      });

    return () => { isMounted = false; };
  }, [activeChatId, fetchCoach]);

  // Silent background sync when active conversation gets new messages in chats poll
  const activeChatSummary = chats.find((c) => c.sessionId === activeChatId);
  const activeChatSummaryKey = activeChatSummary
    ? `${activeChatSummary.messageCount}_${activeChatSummary.lastTime}_${activeChatSummary.lastMessage}`
    : '';

  useEffect(() => {
    if (!activeChatId || !activeChatSummaryKey || !activeThread) return;

    const currentCount = activeThread.history?.length || 0;
    const summaryCount = activeChatSummary?.messageCount || 0;
    const currentLast = activeThread.history?.[currentCount - 1]?.text;
    const summaryLast = activeChatSummary?.lastMessage;

    if (summaryCount !== currentCount || (summaryLast && summaryLast !== currentLast)) {
      api.getChatThread(activeChatId)
        .then((data) => {
          if (data?.chat) {
            setActiveThread(data.chat);
            setAiPaused(Boolean(data.chat.aiPaused));
          }
        })
        .catch((err) => console.error('Silent thread sync error:', err));
    }
  }, [activeChatSummaryKey, activeChatId, activeThread, activeChatSummary]);

  // Auto-scroll controller: only auto-scrolls down if user is ALREADY at bottom
  useEffect(() => {
    const currentHistory = activeThread?.history || [];
    const historyLength = currentHistory.length;
    const isDifferentChat = prevChatIdRef.current !== activeChatId;
    const hasNewMessages = historyLength > prevHistoryLengthRef.current;

    prevChatIdRef.current = activeChatId;
    prevHistoryLengthRef.current = historyLength;

    if (isDifferentChat) {
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      });
      return;
    }

    if (hasNewMessages) {
      if (isAtBottomRef.current) {
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTo({
              top: messagesContainerRef.current.scrollHeight,
              behavior: 'smooth'
            });
          }
        });
      } else {
        setHasNewUnseenMessages(true);
      }
    }
  }, [activeThread?.history, activeChatId]);

  // Handle manual reply sending
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || sending || !activeChatId) return;

    const textToSend = replyText.trim();
    setReplyText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '46px';
    }
    setSending(true);

    try {
      const res = await api.sendMessage(activeChatId, textToSend, 'Owner');
      if (res?.history) {
        setActiveThread((prev) => (prev ? { ...prev, history: res.history } : null));
      }
      if (res && res.success === false) {
        alert(`⚠️ Delivery Failed!\n\nMessage recorded in inbox, but Meta rejected delivery to ${activeThread?.channel || 'customer'}:\n"${res.error || 'Token expired or invalid'}".\n\nPlease reconnect your Meta Access Token in Meta & System Status.`);
      }
      isAtBottomRef.current = true;
      requestAnimationFrame(() => {
        scrollToBottom('smooth');
      });
      onRefresh?.();
    } catch (err) {
      alert(`Could not send message: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  // Retry sending a previously failed message
  const handleRetryMessage = async (failedMsg) => {
    if (!activeChatId || !failedMsg?.text || sending) return;
    setSending(true);
    try {
      const res = await api.sendMessage(activeChatId, failedMsg.text, 'Owner');
      if (res?.history) {
        setActiveThread((prev) => (prev ? { ...prev, history: res.history } : null));
      }
      if (res?.success === false) {
        alert(`⚠️ Delivery Failed again:\n${res.error || 'Token still invalid or expired'}`);
      }
      onRefresh?.();
    } catch (err) {
      alert(`Retry failed: ${err.message}`);
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
      setAiPaused(!nextState);
      alert(`Could not toggle AI pause: ${err.message}`);
    }
  };

  // Handle Customer Notes saving
  const handleSaveNotes = async () => {
    if (!activeChatId || savingNotes) return;
    setSavingNotes(true);
    setNotesSavedStatus(null);
    try {
      await api.updateChatNotes(activeChatId, customerNotes);
      setNotesSavedStatus('saved');
      setActiveThread((prev) => (prev ? { ...prev, notes: customerNotes } : null));
      onRefresh?.();
      setTimeout(() => {
        setNotesSavedStatus(null);
      }, 3500);
    } catch (err) {
      console.error('Failed to save notes:', err);
      setNotesSavedStatus('error');
      alert(`Could not save customer notes: ${err.message}`);
    } finally {
      setSavingNotes(false);
    }
  };

  // Insert canned template
  const insertTemplate = (text) => {
    setReplyText(text);
    if (textareaRef.current) {
      textareaRef.current.focus();
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
        }
      }, 0);
    }
  };

  // Comprehensive conversation filtering
  const filteredChats = chats.filter((c) => {
    // 1. Channel filter
    const ch = (c.channel || '').toLowerCase();
    if (filterChannel === 'WHATSAPP' && ch !== 'whatsapp') return false;
    if (filterChannel === 'MESSENGER' && ch !== 'messenger') return false;
    if (filterChannel === 'INSTAGRAM' && ch !== 'instagram') return false;

    // 2. Status filter
    if (filterStatus === 'ESCALATED' && (!c.escalations || c.escalations.length === 0)) return false;
    if (filterStatus === 'PAUSED' && !c.aiPaused) return false;
    if (filterStatus === 'AWAITING_REPLY') {
      // Customer sent the last message
      const isAwaiting = c.lastSender === 'user' || (c.history && c.history[c.history.length - 1]?.sender === 'user');
      if (!isAwaiting) return false;
    }
    if (filterStatus === 'UNREAD') {
      if ((c.customerCount || 0) === 0) return false;
    }

    // 3. Search query filter
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = (c.contactName || '').toLowerCase();
    const sid = (c.sessionId || c.senderId || '').toLowerCase();
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

  // Active chat display metadata
  const activeDisplayName = activeThread ? getCustomerDisplayName(activeThread) : 'Customer';
  const activeInitial = activeThread ? getAvatarInitial(activeDisplayName, activeThread.senderId || activeThread.sessionId) : '#';

  return (
    <div className={`inbox-container mobile-view-${mobileView}`}>
      {/* LEFT PANE: Thread List */}
      <div className={`threads-pane ${threadsCollapsed ? 'collapsed' : ''}`}>
        <div className="threads-search-bar">
          <div className="threads-bar-top">
            <div className="search-input-wrap">
              <Search size={16} aria-hidden="true" />
              <input
                type="text"
                className="search-input"
                placeholder="Search name, phone, or msg..."
                aria-label="Search conversations by customer name, phone number, or message"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="icon-btn threads-collapse-btn"
              onClick={handleToggleThreadsCollapse}
              title="Collapse chat list"
              aria-label="Collapse chat list panel"
            >
              <PanelLeftClose size={15} aria-hidden="true" />
            </button>
          </div>

          {/* Clean 4-chip non-wrapping Channel Filter Row */}
          <div className="channel-pills-row" role="group" aria-label="Filter conversations by channel">
            <button
              type="button"
              className={`channel-pill ${filterChannel === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterChannel('ALL')}
              aria-label="All channels"
            >
              All ({chats.length})
            </button>
            <button
              type="button"
              className={`channel-pill ${filterChannel === 'WHATSAPP' ? 'active' : ''}`}
              onClick={() => setFilterChannel('WHATSAPP')}
              aria-label="Filter by WhatsApp"
              title="WhatsApp"
            >
              📱 WhatsApp
            </button>
            <button
              type="button"
              className={`channel-pill ${filterChannel === 'MESSENGER' ? 'active' : ''}`}
              onClick={() => setFilterChannel('MESSENGER')}
              aria-label="Filter by Messenger"
              title="Facebook Messenger"
            >
              💬 Messenger
            </button>
            <button
              type="button"
              className={`channel-pill ${filterChannel === 'INSTAGRAM' ? 'active' : ''}`}
              onClick={() => setFilterChannel('INSTAGRAM')}
              aria-label="Filter by Instagram"
              title="Instagram Direct"
            >
              📸 Instagram
            </button>
          </div>

          {/* Workflow Status Filter Chips (Escalated, Paused, Awaiting reply, Unread) */}
          <div className="status-filter-pills" role="group" aria-label="Filter conversations by workflow status">
            <button
              type="button"
              className={`status-pill-btn ${filterStatus === 'ALL' ? 'active' : ''}`}
              onClick={() => { setFilterStatus('ALL'); onClearExternalFilter?.(); }}
            >
              All Status
            </button>
            <button
              type="button"
              className={`status-pill-btn ${filterStatus === 'AWAITING_REPLY' ? 'active' : ''}`}
              onClick={() => setFilterStatus('AWAITING_REPLY')}
            >
              ⏳ Awaiting Reply
            </button>
            <button
              type="button"
              className={`status-pill-btn ${filterStatus === 'ESCALATED' ? 'active' : ''}`}
              onClick={() => setFilterStatus('ESCALATED')}
            >
              🚨 Escalated
            </button>
            <button
              type="button"
              className={`status-pill-btn ${filterStatus === 'PAUSED' ? 'active' : ''}`}
              onClick={() => setFilterStatus('PAUSED')}
            >
              ⏸️ AI Paused
            </button>
          </div>
        </div>

        {/* Conversation Cards List */}
        <div className="threads-list" role="feed" aria-label="Conversations list">
          {filteredChats.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No conversations match the selected filter.
            </div>
          ) : (
            filteredChats.map((c) => {
              const isSelected = c.sessionId === activeChatId;
              const displayName = getCustomerDisplayName(c);
              const avatarInitial = getAvatarInitial(displayName, c.senderId || c.sessionId);
              const chClass = getChannelBadgeClass(c.channel);
              const lastText = c.lastMessage || c.history?.[c.history?.length - 1]?.text || 'No message history yet';
              const relTime = formatRelativeTime(c.lastTime);
              const isAwaitingReply = c.lastSender === 'user';

              return (
                <div
                  key={c.sessionId}
                  className={`thread-card ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    setActiveChatId(c.sessionId);
                    setMobileView('chat');
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setActiveChatId(c.sessionId);
                      setMobileView('chat');
                    }
                  }}
                  aria-label={`Conversation with ${displayName}, ${c.channel || 'WhatsApp'}, last active ${relTime}`}
                >
                  <div className="thread-avatar-wrap">
                    <div className="avatar" aria-hidden="true">{avatarInitial}</div>
                    <div className={`channel-badge-icon ${chClass}`} aria-hidden="true">
                      {chClass === 'whatsapp' && '📱'}
                      {chClass === 'messenger' && '💬'}
                      {chClass === 'instagram' && '📸'}
                    </div>
                  </div>

                  <div className="thread-content">
                    <div className="thread-top-row">
                      <span className="thread-name" title={displayName}>
                        {displayName}
                      </span>
                      <span className="thread-time">{relTime}</span>
                    </div>

                    <div className="thread-preview-row">
                      <span className="thread-snippet">{lastText}</span>
                      <div className="thread-indicators">
                        {isAwaitingReply && <span className="tag-mini reply-needed">Needs Reply</span>}
                        {c.aiPaused && <span className="tag-mini paused">AI PAUSED</span>}
                        {c.escalations?.length > 0 && <span className="tag-mini escalated">ESCALATED</span>}
                        {Boolean(c.notes && c.notes.trim()) && (
                          <span className="tag-mini notes-tag" title={c.notes}>
                            📝 Note
                          </span>
                        )}
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
        {/* Expand threads button — shown only when thread list is collapsed */}
        {threadsCollapsed && (
          <button
            type="button"
            className="icon-btn threads-expand-btn"
            onClick={handleToggleThreadsCollapse}
            title="Show chat list"
            aria-label="Expand chat list panel"
          >
            <PanelLeftOpen size={15} aria-hidden="true" />
          </button>
        )}
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
                  aria-label="Back to conversation list"
                  style={{ marginRight: 4 }}
                >
                  <ChevronLeft size={20} aria-hidden="true" />
                </button>

                <div className="avatar" aria-hidden="true">{activeInitial}</div>
                <div>
                  <h2 className="chat-header-title">{activeDisplayName}</h2>
                  <div className="chat-header-sub">
                    <span>{activeThread.channel || 'WhatsApp'}</span>
                    <span>•</span>
                    <span>+{activeThread.senderId || activeThread.sessionId}</span>
                  </div>
                </div>
              </div>

              <div className="chat-header-actions">
                {/* Customer Notes Quick Button */}
                <button
                  type="button"
                  className={`assistant-toggle-btn notes-header-btn ${assistantDockOpen && dockTab === 'notes' ? 'active' : ''} ${Boolean(customerNotes && customerNotes.trim()) ? 'has-notes' : ''}`}
                  onClick={() => {
                    if (assistantDockOpen && dockTab === 'notes') {
                      setAssistantDockOpen(false);
                    } else {
                      setAssistantDockOpen(true);
                      setDockTab('notes');
                    }
                  }}
                  title={customerNotes && customerNotes.trim() ? 'View & Edit Private Customer Notes' : 'Add Private Customer Notes'}
                  aria-label="Toggle Customer Notes dock"
                >
                  <FileText size={14} aria-hidden="true" />
                  <span>Notes</span>
                  {Boolean(customerNotes && customerNotes.trim()) && (
                    <span className="notes-indicator-dot" title="Has saved notes" aria-hidden="true" />
                  )}
                </button>

                {/* AI Assistant Dock Toggle Button */}
                <button
                  type="button"
                  className={`assistant-toggle-btn ${assistantDockOpen && dockTab !== 'notes' ? 'active' : ''}`}
                  onClick={() => {
                    if (assistantDockOpen && dockTab !== 'notes') {
                      setAssistantDockOpen(false);
                    } else {
                      setAssistantDockOpen(true);
                      if (dockTab === 'notes') setDockTab('coach');
                      if (!coachData && !coachLoading) fetchCoach(activeChatId, false);
                    }
                  }}
                  title="Toggle Assistant Dock (AI Suggestions & Plan Quotes)"
                  aria-label="Toggle AI Coach & Quote templates dock"
                >
                  <Sparkles size={14} aria-hidden="true" />
                  <span>Assistant Dock</span>
                  {assistantDockOpen && dockTab !== 'notes' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>

                {/* AI Pause / Resume Toggle */}
                <button
                  type="button"
                  className={`ai-pause-toggle ${aiPaused ? 'ai-paused' : 'ai-on'}`}
                  onClick={handleToggleAiPause}
                  title="Pause or Resume automatic AI replies for this customer"
                  aria-label={aiPaused ? 'Resume AI automatic replies' : 'Pause AI auto-replies (Owner manual mode)'}
                >
                  {aiPaused ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                  <span className="ai-toggle-text">{aiPaused ? 'AI PAUSED' : 'AI ON'}</span>
                  <div className={`switch-track ${!aiPaused ? 'active' : ''}`} aria-hidden="true">
                    <div className="switch-knob"></div>
                  </div>
                </button>

                <button
                  type="button"
                  className="icon-btn"
                  title="Refresh conversation messages"
                  aria-label="Refresh conversation messages"
                  onClick={() => onRefresh?.()}
                >
                  <RotateCw size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* In-inbox failure alert — only shown when token is confirmed expired */}
            {hasGlobalTokenError && (
              <div className="inbox-token-warning-banner" role="alert">
                <div className="inbox-warning-left">
                  <AlertTriangle size={16} className="inbox-warning-icon" aria-hidden="true" />
                  <span>
                    <strong>WhatsApp delivery is failing (OAuthException 190):</strong> Outbound messages cannot reach customers until the token is reconnected.
                  </span>
                </div>
                {onReconnectToken && (
                  <button
                    type="button"
                    className="inbox-reconnect-btn"
                    onClick={onReconnectToken}
                    aria-label="Reconnect WhatsApp token in Meta settings"
                  >
                    <KeyRound size={13} aria-hidden="true" />
                    <span>Reconnect Token</span>
                  </button>
                )}
              </div>
            )}

            {/* Messages Scroll Area (Clean container that pushes content rather than overlaying) */}
            <div className="chat-messages-wrapper">
              <div
                className="chat-messages-area"
                ref={messagesContainerRef}
                onScroll={handleScroll}
                aria-live="polite"
                role="log"
                aria-label="Customer conversation messages"
              >
                {activeThread.history && activeThread.history.length > 0 ? (
                  activeThread.history.map((msg, idx) => (
                    <ChatBubble
                      key={msg.id || idx}
                      message={msg}
                      onRetry={handleRetryMessage}
                    />
                  ))
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', margin: 'auto' }}>
                    No message history yet.
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Floating Scroll to Bottom / New Messages indicator */}
              {showScrollBottomBtn && (
                <button
                  type="button"
                  className={`scroll-bottom-btn ${hasNewUnseenMessages ? 'has-new' : ''}`}
                  onClick={() => scrollToBottom('smooth')}
                  title="Scroll down to latest messages"
                  aria-label="Scroll down to latest messages"
                >
                  <ChevronDown size={15} aria-hidden="true" />
                  <span>{hasNewUnseenMessages ? 'New messages ↓' : 'Latest'}</span>
                </button>
              )}
            </div>

            {/* UNIFIED DOCKED ASSISTANT STRIP (Pushes content up cleanly, never overlays or clips messages) */}
            {assistantDockOpen && (
              <div className="docked-assistant-strip">
                <div className="assistant-strip-tabs">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className={`dock-tab-btn ${dockTab === 'coach' ? 'active' : ''}`}
                      onClick={() => setDockTab('coach')}
                      aria-label="Show AI Coach suggestions"
                    >
                      <Sparkles size={13} aria-hidden="true" />
                      <span>AI Profit Coach</span>
                      {coachData?.analysis?.intent && (
                        <span className="dock-intent-tag">{coachData.analysis.intent}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={`dock-tab-btn ${dockTab === 'quotes' ? 'active' : ''}`}
                      onClick={() => setDockTab('quotes')}
                      aria-label="Show Fast Canned Plan Quotes"
                    >
                      <Copy size={13} aria-hidden="true" />
                      <span>Plan Quotes</span>
                    </button>
                    <button
                      type="button"
                      className={`dock-tab-btn ${dockTab === 'notes' ? 'active' : ''}`}
                      onClick={() => setDockTab('notes')}
                      aria-label="Show Customer Notes"
                    >
                      <FileText size={13} aria-hidden="true" />
                      <span>Customer Notes</span>
                      {Boolean(customerNotes && customerNotes.trim()) && (
                        <span className="dock-intent-tag notes-badge-chip">Saved</span>
                      )}
                    </button>
                  </div>

                  {dockTab === 'coach' && (
                    <button
                      type="button"
                      className="dock-reanalyze-btn"
                      disabled={coachLoading}
                      onClick={() => fetchCoach(activeChatId, true)}
                      title="Re-analyze full conversation with Gemini"
                      aria-label="Re-analyze conversation with Gemini"
                    >
                      <RotateCw size={12} className={coachLoading ? 'spin' : ''} aria-hidden="true" />
                      <span>{coachLoading ? 'Analyzing…' : 'Re-Analyze'}</span>
                    </button>
                  )}
                </div>

                {dockTab === 'coach' && (
                  <div className="assistant-strip-content">
                    {coachData?.analysis?.closingStrategy && (
                      <div className="dock-strategy-row">
                        <Lightbulb size={13} color="var(--amber)" style={{ minWidth: 13 }} aria-hidden="true" />
                        <span><strong>Strategy:</strong> {coachData.analysis.closingStrategy}</span>
                      </div>
                    )}

                    <div className="dock-chips-container">
                      {(coachData?.suggestions || coachData?.analysis?.suggestions || []).length > 0 ? (
                        (coachData.suggestions || coachData.analysis.suggestions).map((sugg, i) => (
                          <button
                            key={i}
                            type="button"
                            className="dock-suggestion-chip"
                            onClick={() => setReplyText(sugg)}
                            title="Click to insert into message reply box"
                            aria-label={`Insert suggested reply: ${sugg}`}
                          >
                            💬 {sugg}
                          </button>
                        ))
                      ) : (
                        <span className="dock-placeholder-note">
                          {coachLoading ? 'Analyzing intent and generating closing messages with Gemini…' : 'No recommendations yet. Click Re-Analyze to generate deal-closing suggestions.'}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {dockTab === 'quotes' && (
                  <div className="assistant-strip-content">
                    <div className="dock-chips-container">
                      <button
                        type="button"
                        className="dock-suggestion-chip quote-chip"
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
                        aria-label="Insert US All Plans quote"
                      >
                        🇺🇸 All Plans (US)
                      </button>

                      <button
                        type="button"
                        className="dock-suggestion-chip quote-chip"
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
                        aria-label="Insert UK All Plans quote"
                      >
                        🇬🇧 All Plans (UK)
                      </button>

                      <button
                        type="button"
                        className="dock-suggestion-chip quote-chip"
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
                        aria-label="Insert EU All Plans quote"
                      >
                        🇪🇺 All Plans (EU)
                      </button>

                      <button
                        type="button"
                        className="dock-suggestion-chip quote-chip"
                        onClick={() => insertTemplate(
                          "💳 *PAKCLOUDRDP — OFFICIAL PAYMENT ACCOUNTS*\n" +
                          "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                          "1️⃣ *JazzCash Account:*\n" +
                          "   • Number: `0302-3900900`\n" +
                          "   • Title: `Jawad Ahmad`\n\n" +
                          "2️⃣ *Raast ID (Zero Fee from any Bank):*\n" +
                          "   • ID: `03023900900`\n\n" +
                          "3️⃣ *NayaPay:*\n" +
                          "   • ID: `jawad.ahmad@nayapay`\n" +
                          "━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                          "⚠️ Payment send karne k baad *Screenshot / Receipt* lazmi share karein taake machine setup shuru karein! 🚀"
                        )}
                        aria-label="Insert Payment Accounts details"
                      >
                        💳 Payment Accounts
                      </button>
                    </div>
                  </div>
                )}

                {dockTab === 'notes' && (
                  <div className="assistant-strip-content notes-dock-content">
                    <div className="notes-dock-header">
                      <div className="notes-dock-title">
                        <FileText size={14} color="#93c5fd" aria-hidden="true" />
                        <span>Private Customer Notes (Visible only to internal team)</span>
                      </div>
                      <div className="notes-actions-group">
                        {notesSavedStatus === 'saved' && (
                          <span className="notes-status-badge saved">
                            <Check size={12} aria-hidden="true" /> Saved to CRM
                          </span>
                        )}
                        <button
                          type="button"
                          className="save-notes-btn"
                          disabled={savingNotes}
                          onClick={handleSaveNotes}
                          aria-label="Save customer notes"
                        >
                          {savingNotes ? 'Saving…' : 'Save Notes'}
                        </button>
                      </div>
                    </div>
                    <label htmlFor="customer-notes-textarea" className="visually-hidden">
                      Private Customer Notes
                    </label>
                    <textarea
                      id="customer-notes-textarea"
                      className="notes-dock-textarea"
                      placeholder="Type private notes about this customer (e.g., active server IP, renewal due date, agreed payment method, special discounts, custom setup preferences)..."
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Chat Input Bar */}
            <div className="chat-input-bar">
              <form onSubmit={handleSendMessage} className="input-form-row">
                <label htmlFor="chat-reply-composer" className="visually-hidden">
                  Reply to {activeDisplayName}
                </label>
                <textarea
                  id="chat-reply-composer"
                  ref={textareaRef}
                  className="chat-textarea"
                  placeholder={`Reply to ${activeDisplayName} as Owner (bypasses AI)...`}
                  aria-label={`Reply to ${activeDisplayName}`}
                  rows={1}
                  value={replyText}
                  onChange={handleTextareaChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                />

                <button
                  type="submit"
                  className="send-btn"
                  disabled={!replyText.trim() || sending}
                  title="Send message directly to customer"
                  aria-label="Send reply to customer"
                >
                  <Send size={18} aria-hidden="true" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="no-chat-selected">
            <MessageSquare size={48} color="var(--text-muted)" aria-hidden="true" />
            <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>No Conversation Selected</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Select a customer conversation from the list to view history and reply directly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
