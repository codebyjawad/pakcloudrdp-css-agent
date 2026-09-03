/**
 * PAKCLOUDRDP CSS AGENT & META HUB FRONTEND APPLICATION
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  const state = {
    activeChannel: 'WhatsApp',
    sessionId: 'session-' + Date.now(),
    currentPlan: 'starter',
    currentRegion: 'eu',
    priceMatrix: {},
    plans: [],
    regions: [],
    orders: [],
    escalations: []
  };

  // DOM Elements
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const channelBtns = document.querySelectorAll('.channel-btn');
  const scenarioBtns = document.querySelectorAll('.scenario-btn');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendMessageBtn = document.getElementById('sendMessageBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const actionChips = document.getElementById('actionChips');
  
  const quotePlanSelect = document.getElementById('quotePlanSelect');
  const quoteRegionSelect = document.getElementById('quoteRegionSelect');
  const quotePriceDisplay = document.getElementById('quotePriceDisplay');
  const quoteTextSnippet = document.getElementById('quoteTextSnippet');
  const copyQuoteBtn = document.getElementById('copyQuoteBtn');
  
  const matrixTableBody = document.getElementById('matrixTableBody');
  const createOrderForm = document.getElementById('createOrderForm');
  const orderList = document.getElementById('orderList');
  const orderCountBadge = document.getElementById('orderCountBadge');
  const escalationQueue = document.getElementById('escalationQueue');
  const escalationCountBadge = document.getElementById('escalationCountBadge');
  const refreshEscalationsBtn = document.getElementById('refreshEscalationsBtn');
  
  const webhookSimulatorForm = document.getElementById('webhookSimulatorForm');
  const webhookLogEntries = document.getElementById('webhookLogEntries');

  // ==========================================
  // 1. CLOCK & WORKING HOURS (9 AM – 12 AM PKT)
  // ==========================================
  function updatePKTClock() {
    const now = new Date();
    // PKT is UTC+5
    const pktTimeStr = now.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    
    // Check hour in PKT (9 to 24)
    const pktHour = parseInt(now.toLocaleTimeString('en-US', { timeZone: 'Asia/Karachi', hour: '2-digit', hour12: false }), 10);
    const isOnline = (pktHour >= 9 && pktHour <= 23) || pktHour === 0;

    const pktClockElem = document.getElementById('pktTime');
    const badgeElem = document.getElementById('supportStatusBadge');
    
    if (pktClockElem) pktClockElem.textContent = `${pktTimeStr} PKT`;
    if (badgeElem) {
      if (isOnline) {
        badgeElem.textContent = 'Online (<15m SLA)';
        badgeElem.style.background = '#10B981';
      } else {
        badgeElem.textContent = 'Off-Hours (Max 12h SLA)';
        badgeElem.style.background = '#F59E0B';
      }
    }
  }
  setInterval(updatePKTClock, 1000);
  updatePKTClock();

  // ==========================================
  // 2. TAB NAVIGATION
  // ==========================================
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      navTabs.forEach(t => t.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(`tab-${targetTab}`);
      if (targetPane) {
        targetPane.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });

  // ==========================================
  // 3. CHANNEL SWITCHER (WhatsApp/Messenger/Instagram)
  // ==========================================
  channelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      channelBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeChannel = btn.getAttribute('data-channel');

      const chatChannelTitle = document.getElementById('chatChannelTitle');
      const currentChannelBadge = document.getElementById('currentChannelBadge');
      const chatAvatar = document.getElementById('chatAvatar');

      if (state.activeChannel === 'WhatsApp') {
        chatChannelTitle.textContent = 'WhatsApp Customer Simulator';
        currentChannelBadge.textContent = 'WhatsApp Cloud API';
        currentChannelBadge.className = 'badge badge-whatsapp';
        chatAvatar.textContent = '📱';
      } else if (state.activeChannel === 'Messenger') {
        chatChannelTitle.textContent = 'Facebook Messenger Simulator';
        currentChannelBadge.textContent = 'Messenger API';
        currentChannelBadge.className = 'badge badge-confirmed';
        chatAvatar.textContent = '💬';
      } else if (state.activeChannel === 'Instagram') {
        chatChannelTitle.textContent = 'Instagram Direct Simulator';
        currentChannelBadge.textContent = 'Instagram DM API';
        currentChannelBadge.className = 'badge badge-urgent';
        chatAvatar.textContent = '📸';
      }
    });
  });

  // ==========================================
  // 4. CHAT MESSAGING & SIMULATION
  // ==========================================
  async function sendMessage(text, isAttachment = false) {
    const msgText = (text || chatInput.value).trim();
    if (!msgText) return;

    chatInput.value = '';

    // Append User Message
    appendMessage({
      sender: 'user',
      text: msgText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    // Show Typing indicator
    const typingId = showTypingIndicator();

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msgText,
          sessionId: state.sessionId,
          senderName: `${state.activeChannel} User`,
          channel: state.activeChannel,
          hasImageAttachment: isAttachment
        })
      });

      const data = await response.json();
      removeTypingIndicator(typingId);

      if (data.success) {
        appendMessage({
          sender: 'agent',
          text: data.reply,
          intent: data.intent,
          escalation: data.escalation,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        renderActionChips(data.suggestedActions || []);
        loadEscalations(); // Refresh escalations badge if flagged
      }
    } catch (err) {
      removeTypingIndicator(typingId);
      appendMessage({
        sender: 'agent',
        text: '⚠️ Connection Error: Unable to reach CSS Agent Server.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  }

  function appendMessage(msg) {
    const bubble = document.createElement('div');
    let senderClass = 'agent-bubble';
    let senderTitle = 'PakCloudRDP CSS Agent';

    if (msg.sender === 'user') {
      senderClass = 'user-bubble';
      senderTitle = 'You (' + (msg.channel || state.activeChannel) + ')';
    } else if (msg.sender === 'owner') {
      senderClass = 'agent-bubble owner-bubble';
      senderTitle = '👑 PakCloudRDP Management (Owner Decision)';
    }

    bubble.className = `message-bubble ${senderClass}`;
    const formattedText = formatWhatsAppText(msg.text);

    let escalationHtml = '';
    if (msg.escalation) {
      escalationHtml = `
        <div class="escalation-banner">
          <span>🚨</span>
          <div>
            <strong>FLAGGED FOR OWNER ESCALATION (${msg.escalation.type})</strong><br>
            <small>${msg.escalation.reason}</small>
          </div>
        </div>
      `;
    }

    bubble.innerHTML = `
      <div class="bubble-meta">
        <span class="sender-name">${senderTitle}</span>
        <span class="timestamp">${msg.timestamp || 'Now'}</span>
      </div>
      <div class="bubble-content">${formattedText}</div>
      ${escalationHtml}
    `;

    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }


  function showTypingIndicator() {
    const id = 'typing-' + Date.now();
    const bubble = document.createElement('div');
    bubble.id = id;
    bubble.className = 'message-bubble agent-bubble';
    bubble.innerHTML = `<em>CSS Agent is preparing response... 💬</em>`;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return id;
  }

  function removeTypingIndicator(id) {
    const elem = document.getElementById(id);
    if (elem) elem.remove();
  }

  function renderActionChips(actions) {
    actionChips.innerHTML = '';
    if (!actions || actions.length === 0) return;

    actions.forEach(action => {
      const chip = document.createElement('button');
      chip.className = 'action-chip';
      chip.textContent = action;
      chip.addEventListener('click', () => {
        sendMessage(action);
      });
      actionChips.appendChild(chip);
    });
  }

  // Format WhatsApp style markdown (*bold*, _italic_, `code`) to HTML
  function formatWhatsAppText(text) {
    if (!text) return '';
    let formatted = text
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    return formatted;
  }

  // Event Listeners for Chat
  sendMessageBtn.addEventListener('click', () => sendMessage());
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  scenarioBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-text');
      const hasImage = btn.getAttribute('data-image') === 'true';
      sendMessage(text, hasImage);
    });
  });

  clearChatBtn.addEventListener('click', async () => {
    chatMessages.innerHTML = `
      <div class="message-bubble agent-bubble">
        <div class="bubble-meta">
          <span class="sender-name">PakCloudRDP CSS Agent</span>
          <span class="timestamp">Cleared</span>
        </div>
        <div class="bubble-content">
          Conversation reset. Ask any question in Roman Urdu or English! 🚀
        </div>
      </div>
    `;
    actionChips.innerHTML = '';
    await fetch(`/api/chat/history/${state.sessionId}`, { method: 'DELETE' });
  });

  // ==========================================
  // 5. COPILOT QUOTATION GENERATOR (CHIP SELECTORS)
  // ==========================================
  const planChips = document.querySelectorAll('.plan-chip');
  const regionChips = document.querySelectorAll('.region-chip');
  const activePlanBadge = document.getElementById('activePlanBadge');
  const activeRegionBadge = document.getElementById('activeRegionBadge');
  const insertQuoteBtn = document.getElementById('insertQuoteBtn');

  // Plan info map for descriptive badges
  const planInfoMap = {
    little: 'Little · 1 vCPU / 3 GB',
    starter: 'Starter · 4 vCPU / 8 GB',
    standard: 'Standard · 6 vCPU / 12 GB',
    plus: 'Plus · 8 vCPU / 24 GB',
    pro: 'Pro · 12 vCPU / 48 GB',
    elite: 'Elite · 16 vCPU / 64 GB',
    flagship: 'Flagship · 18 vCPU / 96 GB'
  };

  const regionInfoMap = {
    'eu': '🇪🇺 EU (Europe)',
    'uk': '🇬🇧 UK (United Kingdom)',
    'us': '🇺🇸 US (General)',
    'us-c': '🇺🇸 US Central (Midwest)',
    'us-w': '🇺🇸 US West (California)',
    'us-e': '🇺🇸 US East (Virginia)',
    'in': '🇮🇳 India (Lowest Ping)',
    'au': '🇦🇺 Australia (Sydney)',
    'sg': '🇸🇬 Singapore (Asia Hub)',
    'jp': '🇯🇵 Japan (Tokyo)'
  };

  async function updateQuotation() {
    const plan = quotePlanSelect ? quotePlanSelect.value : 'starter';
    const region = quoteRegionSelect ? quoteRegionSelect.value : 'eu';

    try {
      const res = await fetch(`/api/plans/calculate?plan=${plan}&region=${region}`);
      const data = await res.json();

      if (data.pricePKR) {
        if (quotePriceDisplay) quotePriceDisplay.textContent = `₨${data.pricePKR.toLocaleString()} / Month`;
        if (quoteTextSnippet) quoteTextSnippet.value = data.formattedWhatsAppQuote;
      }
    } catch (err) {
      console.error('Error calculating quote:', err);
    }
  }

  // Interactive Plan Chip Clicks
  planChips.forEach(chip => {
    chip.addEventListener('click', () => {
      planChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const selectedPlan = chip.getAttribute('data-plan');
      
      if (quotePlanSelect) quotePlanSelect.value = selectedPlan;
      state.currentPlan = selectedPlan;
      if (activePlanBadge) activePlanBadge.textContent = planInfoMap[selectedPlan] || selectedPlan;
      
      updateQuotation();
    });
  });

  // Interactive Region Chip Clicks
  regionChips.forEach(chip => {
    chip.addEventListener('click', () => {
      regionChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const selectedRegion = chip.getAttribute('data-region');
      
      if (quoteRegionSelect) quoteRegionSelect.value = selectedRegion;
      state.currentRegion = selectedRegion;
      if (activeRegionBadge) activeRegionBadge.textContent = regionInfoMap[selectedRegion] || selectedRegion;
      
      updateQuotation();
    });
  });

  // Initial Calculation
  updateQuotation();

  // Copy Quotation to Clipboard
  if (copyQuoteBtn) {
    copyQuoteBtn.addEventListener('click', () => {
      if (quoteTextSnippet) {
        navigator.clipboard.writeText(quoteTextSnippet.value);
        const originalText = copyQuoteBtn.innerHTML;
        copyQuoteBtn.innerHTML = '✅ Copied to Clipboard!';
        setTimeout(() => { copyQuoteBtn.innerHTML = originalText; }, 2000);
      }
    });
  }

  // Insert Quotation into Live Chat Simulator
  if (insertQuoteBtn) {
    insertQuoteBtn.addEventListener('click', () => {
      if (quoteTextSnippet && chatInput) {
        chatInput.value = quoteTextSnippet.value;
        // Switch to Simulator Tab
        const simTab = document.querySelector('.nav-tab[data-tab="simulator"]');
        if (simTab) simTab.click();
        chatInput.focus();
      }
    });
  }

  // ==========================================
  // CANNED RESPONSES (SEARCH & CATEGORY FILTER)
  // ==========================================
  const cannedSearchInput = document.getElementById('cannedSearchInput');
  const clearCannedSearchBtn = document.getElementById('clearCannedSearchBtn');
  const cannedCatBtns = document.querySelectorAll('.canned-cat-btn');
  const cannedItems = document.querySelectorAll('.canned-item');
  const noCannedResults = document.getElementById('noCannedResults');
  let activeCannedCategory = 'all';

  function updateCannedCategoryCounts() {
    const allItems = document.querySelectorAll('.canned-item');
    const countAll = document.getElementById('cannedCountAll');
    if (countAll) countAll.textContent = allItems.length;

    const cats = ['payment', 'delivery', 'pricing', 'specs', 'usage', 'renew', 'policy'];
    cats.forEach(cat => {
      const btn = document.querySelector(`.canned-cat-btn[data-cat="${cat}"]`);
      if (btn) {
        const count = document.querySelectorAll(`.canned-item[data-cat="${cat}"]`).length;
        const iconLabel = btn.getAttribute('data-label') || btn.textContent.split('(')[0].trim();
        btn.setAttribute('data-label', iconLabel);
        btn.innerHTML = `${iconLabel} (${count})`;
      }
    });
  }
  updateCannedCategoryCounts();

  function filterCannedResponses() {
    const query = cannedSearchInput ? cannedSearchInput.value.trim().toLowerCase() : '';
    let visibleCount = 0;

    if (clearCannedSearchBtn) {
      clearCannedSearchBtn.style.display = query.length > 0 ? 'block' : 'none';
    }

    const items = document.querySelectorAll('.canned-item');
    items.forEach(item => {
      const itemCat = item.getAttribute('data-cat') || '';
      const itemKeywords = (item.getAttribute('data-keywords') || '').toLowerCase();
      const itemText = item.innerText.toLowerCase();

      const matchesCat = (activeCannedCategory === 'all' || itemCat === activeCannedCategory);
      const matchesQuery = (query === '' || itemKeywords.includes(query) || itemText.includes(query));

      if (matchesCat && matchesQuery) {
        item.style.display = 'block';
        visibleCount++;
      } else {
        item.style.display = 'none';
      }
    });

    if (noCannedResults) {
      noCannedResults.style.display = visibleCount === 0 ? 'block' : 'none';
    }
  }

  if (cannedSearchInput) {
    cannedSearchInput.addEventListener('input', filterCannedResponses);
  }

  if (clearCannedSearchBtn) {
    clearCannedSearchBtn.addEventListener('click', () => {
      cannedSearchInput.value = '';
      filterCannedResponses();
      cannedSearchInput.focus();
    });
  }

  cannedCatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      cannedCatBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCannedCategory = btn.getAttribute('data-cat') || 'all';
      filterCannedResponses();
    });
  });

  // Copy Canned Replies
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const textElem = document.getElementById(targetId);
      if (textElem) {
        navigator.clipboard.writeText(textElem.innerText);
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.background = '#25D366';
        btn.style.color = '#000';
        setTimeout(() => { 
          btn.textContent = orig; 
          btn.style.background = '';
          btn.style.color = '';
        }, 1500);
      }
    });
  });

  // Insert Canned Reply into Chat Simulator
  document.querySelectorAll('.btn-insert-chat').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const textElem = document.getElementById(targetId);
      if (textElem && chatInput) {
        chatInput.value = textElem.innerText;
        const simTab = document.querySelector('.nav-tab[data-tab="simulator"]');
        if (simTab) simTab.click();
        chatInput.focus();
      }
    });
  });

  // ==========================================
  // 5B. MANUAL CS SALES COCKPIT & CONVERSION ENGINE
  // ==========================================
  const stageNavItems = document.querySelectorAll('.stage-nav-item');
  const cockpitStageViews = document.querySelectorAll('.cockpit-stage-view');
  const btnCockpitNexts = document.querySelectorAll('.btn-cockpit-next');
  const btnCockpitCopies = document.querySelectorAll('.btn-cockpit-copy');
  const btnCockpitChats = document.querySelectorAll('.btn-cockpit-chat');
  const btnCockpitConvertOrder = document.getElementById('btnCockpitConvertOrder') || document.getElementById('btnConvertFlowToOrder');

  function switchToCockpitStage(stageNum) {
    stageNavItems.forEach(item => {
      if (item.getAttribute('data-stage') === String(stageNum)) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    cockpitStageViews.forEach(view => {
      if (view.id === `cockpitStage${stageNum}`) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });
  }

  stageNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const stage = item.getAttribute('data-stage');
      switchToCockpitStage(stage);
    });
  });

  btnCockpitNexts.forEach(btn => {
    btn.addEventListener('click', () => {
      const nextStage = btn.getAttribute('data-goto');
      switchToCockpitStage(nextStage);
    });
  });

  btnCockpitCopies.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const textElem = document.getElementById(targetId);
      if (textElem) {
        navigator.clipboard.writeText(textElem.innerText);
        const orig = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        btn.style.background = '#25D366';
        btn.style.color = '#000';
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.style.background = '';
          btn.style.color = '';
        }, 1500);
      }
    });
  });

  btnCockpitChats.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const textElem = document.getElementById(targetId);
      if (textElem && chatInput) {
        chatInput.value = textElem.innerText;
        const simTab = document.querySelector('.nav-tab[data-tab="simulator"]');
        if (simTab) simTab.click();
        chatInput.focus();
      }
    });
  });

  // 1-Click Use-Case Matcher Cards (Tailored Pitch Copy & Send)
  document.querySelectorAll('.match-card').forEach(card => {
    const quoteText = card.getAttribute('data-quote');
    const planId = card.getAttribute('data-plan');
    const copyBtn = card.querySelector('.btn-match-copy');
    const sendBtn = card.querySelector('.btn-match-send');

    if (copyBtn && quoteText) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(quoteText);
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = '✅ Copied!';
        copyBtn.style.background = '#25D366';
        copyBtn.style.color = '#000';
        setTimeout(() => {
          copyBtn.innerHTML = orig;
          copyBtn.style.background = '';
          copyBtn.style.color = '';
        }, 1500);
      });
    }

    if (sendBtn && quoteText) {
      sendBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (chatInput) {
          chatInput.value = quoteText;
          const simTab = document.querySelector('.nav-tab[data-tab="simulator"]');
          if (simTab) simTab.click();
          chatInput.focus();
        }
      });
    }

    // Clicking anywhere else on the card advances to Stage 2 and loads pitch
    card.addEventListener('click', () => {
      if (planId) {
        // Pre-activate chip in copilot if available
        const planChip = document.querySelector(`.plan-chip[data-plan="${planId}"]`);
        if (planChip) planChip.click();
      }
      switchToCockpitStage(2);
    });
  });

  // Objection Battlecard 1-Click Copy
  document.querySelectorAll('.objection-card').forEach(card => {
    const textToCopy = card.getAttribute('data-copy');
    const miniCopyBtn = card.querySelector('.btn-mini-copy');
    
    if (miniCopyBtn && textToCopy) {
      miniCopyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(textToCopy);
        const orig = miniCopyBtn.textContent;
        miniCopyBtn.textContent = '✅ Copied!';
        miniCopyBtn.style.background = '#25D366';
        miniCopyBtn.style.color = '#000';
        setTimeout(() => {
          miniCopyBtn.textContent = orig;
          miniCopyBtn.style.background = '';
          miniCopyBtn.style.color = '';
        }, 1500);
      });
    }
  });

  // Account Tile 1-Click Copy
  document.querySelectorAll('.btn-tile-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const copyVal = btn.getAttribute('data-copy');
      if (copyVal) {
        navigator.clipboard.writeText(copyVal);
        const orig = btn.textContent;
        btn.textContent = '✅ Copied!';
        btn.style.background = '#25D366';
        btn.style.color = '#000';
        setTimeout(() => {
          btn.textContent = orig;
          btn.style.background = '';
          btn.style.color = '';
        }, 1500);
      }
    });
  });

  // 1-Click Convert to Order & Pre-fill CRM
  if (btnCockpitConvertOrder) {
    btnCockpitConvertOrder.addEventListener('click', () => {
      const ordersTab = document.querySelector('.nav-tab[data-tab="orders"]');
      if (ordersTab) ordersTab.click();

      // Pick currently active plan/region from copilot or default to starter/eu
      const activePlanChip = document.querySelector('.plan-chip.active');
      const activeRegionChip = document.querySelector('.region-chip.active');
      
      const orderPlanSelect = document.getElementById('orderPlan');
      const orderRegionSelect = document.getElementById('orderRegion');
      const orderCustomerInput = document.getElementById('orderCustomer');

      if (orderPlanSelect && activePlanChip) {
        orderPlanSelect.value = activePlanChip.getAttribute('data-plan') || 'starter';
      }
      if (orderRegionSelect && activeRegionChip) {
        orderRegionSelect.value = activeRegionChip.getAttribute('data-region') || 'eu';
      }

      const planVal = orderPlanSelect ? orderPlanSelect.value : 'starter';
      const regionVal = orderRegionSelect ? orderRegionSelect.value : 'eu';
      
      // Update price banner in order form
      const matrixPrice = state.priceMatrix[planVal]?.[regionVal] || 2800;
      const orderLivePrice = document.getElementById('orderLivePrice');
      if (orderLivePrice) {
        orderLivePrice.textContent = `₨${matrixPrice.toLocaleString()} / Month`;
      }

      if (orderCustomerInput) {
        if (!orderCustomerInput.value) {
          orderCustomerInput.value = `Customer (+92300${Math.floor(1000000 + Math.random() * 9000000)})`;
        }
        orderCustomerInput.focus();
        orderCustomerInput.select();
      }
    });
  }

  // ==========================================
  // 6. PRICE MATRIX TABLE
  // ==========================================
  async function loadPriceMatrix() {
    try {
      const res = await fetch('/api/plans');
      const data = await res.json();
      state.plans = data.plans || [];
      state.regions = data.regions || [];
      state.priceMatrix = data.priceMatrix || {};

      matrixTableBody.innerHTML = '';

      state.plans.forEach(plan => {
        const tr = document.createElement('tr');
        const matrix = state.priceMatrix[plan.id] || {};

        tr.innerHTML = `
          <td><strong>${plan.name}</strong></td>
          <td>${plan.vcpu}</td>
          <td>${plan.ram}</td>
          <td><small>${plan.nvme} NVMe<br>(${plan.ssdAlt} SSD)</small></td>
          <td class="price-cell eu-cheap">₨${(matrix['eu'] || 0).toLocaleString()}</td>
          <td class="price-cell">₨${(matrix['uk'] || 0).toLocaleString()}</td>
          <td class="price-cell">₨${(matrix['us'] || matrix['us-e'] || 0).toLocaleString()}</td>
          <td class="price-cell">₨${(matrix['us-c'] || 0).toLocaleString()}</td>
          <td class="price-cell">₨${(matrix['us-w'] || 0).toLocaleString()}</td>
          <td class="price-cell">₨${(matrix['us-e'] || 0).toLocaleString()}</td>
          <td class="price-cell">₨${(matrix['in'] || 0).toLocaleString()}</td>
          <td class="price-cell">₨${(matrix['au'] || 0).toLocaleString()}</td>
          <td class="price-cell">₨${(matrix['sg'] || 0).toLocaleString()}</td>
          <td class="price-cell">₨${(matrix['jp'] || 0).toLocaleString()}</td>
        `;

        matrixTableBody.appendChild(tr);
      });
    } catch (err) {
      console.error('Error loading price matrix:', err);
    }
  }
  loadPriceMatrix();

  // ==========================================
  // 7. ORDER MANAGEMENT & DELIVERY HUB
  // ==========================================
  const orderPlan = document.getElementById('orderPlan');
  const orderRegion = document.getElementById('orderRegion');
  const orderLivePrice = document.getElementById('orderLivePrice');
  const orderLiveSpecs = document.getElementById('orderLiveSpecs');
  const autofillOrderBtn = document.getElementById('autofillOrderBtn');
  const orderSearchInput = document.getElementById('orderSearchInput');
  const clearOrderSearchBtn = document.getElementById('clearOrderSearchBtn');
  const orderFilterBtns = document.querySelectorAll('.order-filter-btn');
  const noOrdersMatchMsg = document.getElementById('noOrdersMatchMsg');

  // Delivery Modal Elements
  const deliveryModal = document.getElementById('deliveryModal');
  const deliveryForm = document.getElementById('deliveryForm');
  const deliveryOrderId = document.getElementById('deliveryOrderId');
  const deliveryIp = document.getElementById('deliveryIp');
  const deliveryUsername = document.getElementById('deliveryUsername');
  const deliveryPassword = document.getElementById('deliveryPassword');
  const deliveryPreviewText = document.getElementById('deliveryPreviewText');
  const closeDeliveryModalBtn = document.getElementById('closeDeliveryModalBtn');
  const cancelDeliveryBtn = document.getElementById('cancelDeliveryBtn');

  let activeOrderFilter = 'all';

  // Live Price Calculation in Order Form
  async function updateOrderLivePrice() {
    if (!orderPlan || !orderRegion || !orderLivePrice) return;
    const plan = orderPlan.value;
    const region = orderRegion.value;

    try {
      const res = await fetch(`/api/plans/calculate?plan=${plan}&region=${region}`);
      const data = await res.json();
      if (data.pricePKR) {
        orderLivePrice.textContent = `₨${data.pricePKR.toLocaleString()} / Month`;
        const specsText = `(${data.plan.vcpu} · ${data.plan.ram} RAM · ${data.plan.nvme} NVMe)`;
        if (orderLiveSpecs) orderLiveSpecs.textContent = specsText;
      }
    } catch (err) {
      console.error('Error updating order live price:', err);
    }
  }

  if (orderPlan) orderPlan.addEventListener('change', updateOrderLivePrice);
  if (orderRegion) orderRegion.addEventListener('change', updateOrderLivePrice);
  updateOrderLivePrice();

  // Autofill Customer from current session / chat input
  if (autofillOrderBtn) {
    autofillOrderBtn.addEventListener('click', () => {
      const customerInput = document.getElementById('orderCustomer');
      if (customerInput) {
        const potentialName = chatInput && chatInput.value ? chatInput.value : 'Customer (WhatsApp)';
        customerInput.value = potentialName;
        customerInput.focus();
      }
    });
  }

  // Load and Render Orders
  async function loadOrders() {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      state.orders = data.orders || [];
      if (orderCountBadge) orderCountBadge.textContent = state.orders.length;

      // Calculate KPI metrics
      const totalOrders = state.orders.length;
      const pendingVerify = state.orders.filter(o => o.ownerVerification === 'Pending').length;
      const delivered = state.orders.filter(o => o.rdpDelivered === 'Yes').length;
      const totalRevenue = state.orders.reduce((sum, o) => sum + (o.price || 0), 0);

      const kpiTotalOrders = document.getElementById('kpiTotalOrders');
      const kpiPendingVerification = document.getElementById('kpiPendingVerification');
      const kpiDelivered = document.getElementById('kpiDelivered');
      const kpiMonthlyRevenue = document.getElementById('kpiMonthlyRevenue');

      if (kpiTotalOrders) kpiTotalOrders.textContent = totalOrders;
      if (kpiPendingVerification) kpiPendingVerification.textContent = pendingVerify;
      if (kpiDelivered) kpiDelivered.textContent = delivered;
      if (kpiMonthlyRevenue) kpiMonthlyRevenue.textContent = `₨${totalRevenue.toLocaleString()}`;

      // Update Filter Badges
      const filterCountAll = document.getElementById('filterCountAll');
      const filterCountPending = document.getElementById('filterCountPending');
      const filterCountVerified = document.getElementById('filterCountVerified');
      const filterCountDelivered = document.getElementById('filterCountDelivered');

      if (filterCountAll) filterCountAll.textContent = totalOrders;
      if (filterCountPending) filterCountPending.textContent = pendingVerify;
      if (filterCountVerified) filterCountVerified.textContent = state.orders.filter(o => o.ownerVerification === 'Confirmed').length;
      if (filterCountDelivered) filterCountDelivered.textContent = delivered;

      renderOrdersList();
    } catch (err) {
      console.error('Error loading orders:', err);
    }
  }

  function renderOrdersList() {
    if (!orderList) return;
    const query = orderSearchInput ? orderSearchInput.value.trim().toLowerCase() : '';
    orderList.innerHTML = '';

    if (clearOrderSearchBtn) {
      clearOrderSearchBtn.style.display = query.length > 0 ? 'block' : 'none';
    }

    const filtered = state.orders.filter(ord => {
      const matchesSearch = query === '' || 
        ord.customer.toLowerCase().includes(query) || 
        ord.plan.toLowerCase().includes(query) || 
        ord.region.toLowerCase().includes(query) ||
        (ord.rdpIp && ord.rdpIp.includes(query)) ||
        ord.id.toLowerCase().includes(query);

      let matchesStatus = true;
      if (activeOrderFilter === 'pending') {
        matchesStatus = ord.ownerVerification === 'Pending';
      } else if (activeOrderFilter === 'verified') {
        matchesStatus = ord.ownerVerification === 'Confirmed';
      } else if (activeOrderFilter === 'delivered') {
        matchesStatus = ord.rdpDelivered === 'Yes';
      }

      return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
      if (noOrdersMatchMsg) noOrdersMatchMsg.style.display = 'block';
      return;
    } else {
      if (noOrdersMatchMsg) noOrdersMatchMsg.style.display = 'none';
    }

    filtered.forEach(ord => {
      const card = document.createElement('div');
      card.className = 'order-card';
      const isVerified = ord.ownerVerification === 'Confirmed';
      const isDelivered = ord.rdpDelivered === 'Yes';

      card.innerHTML = `
        <div class="order-card-header">
          <div class="order-customer-info">
            <span class="order-id-tag">${ord.id}</span>
            <span class="order-customer-name">${ord.customer}</span>
          </div>
          <div class="order-badges">
            <span class="badge ${ord.channel === 'WhatsApp' ? 'badge-whatsapp' : 'badge-confirmed'}">
              ${ord.channel || 'WhatsApp'}
            </span>
            <span class="badge ${isVerified ? 'badge-confirmed' : 'badge-pending'}">
              ${isVerified ? '✅ Verified' : '⏳ Pending Check'}
            </span>
            ${isDelivered ? '<span class="badge badge-confirmed">🚀 Delivered</span>' : ''}
          </div>
        </div>

        <div class="order-details-grid">
          <div class="order-detail-item"><strong>💻 Package:</strong> ${ord.plan} · ${ord.region}</div>
          <div class="order-detail-item"><strong>💰 Price:</strong> <span style="color: #10B981; font-weight: 700;">₨${ord.price.toLocaleString()}/mo</span></div>
          <div class="order-detail-item"><strong>💳 Payment:</strong> ${ord.paymentMethod} (${ord.proof || 'Proof'})</div>
          <div class="order-detail-item"><strong>📅 Activation:</strong> ${ord.activation || 'Today'}</div>
          <div class="order-detail-item"><strong>🔄 Renewal:</strong> ${ord.renewal || 'Next Month'}</div>
          <div class="order-detail-item">
            <strong>🖥️ Dedicated IP:</strong> 
            ${ord.rdpIp ? `<span class="ip-pill" title="Click to copy IP" data-ip="${ord.rdpIp}">🌐 ${ord.rdpIp} 📋</span>` : '<span style="color: #F59E0B;">Not Assigned</span>'}
          </div>
        </div>

        <div class="order-card-actions">
          <button type="button" class="btn-order-action btn-copy-summary" data-id="${ord.id}">
            📋 Copy WhatsApp Record
          </button>
          <button type="button" class="btn-order-action btn-order-deliver" data-id="${ord.id}">
            🚀 ${isDelivered ? 'Update IP / Delivery' : 'Deliver Dedicated RDP'}
          </button>
          ${!isVerified ? `
            <button type="button" class="btn-order-action btn-verify-order" data-id="${ord.id}" style="color: #10B981;">
              ✅ Mark Verified
            </button>
          ` : ''}
          <button type="button" class="btn-order-action btn-order-delete" data-id="${ord.id}">
            🗑️
          </button>
        </div>
      `;

      orderList.appendChild(card);
    });

    // Attach Action Listeners
    attachOrderActionListeners();
  }

  function attachOrderActionListeners() {
    // Copy IP Pill Click
    document.querySelectorAll('.ip-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const ip = pill.getAttribute('data-ip');
        if (ip) {
          navigator.clipboard.writeText(ip);
          const orig = pill.innerHTML;
          pill.innerHTML = '✅ Copied!';
          setTimeout(() => { pill.innerHTML = orig; }, 1500);
        }
      });
    });

    // Copy Summary Record
    document.querySelectorAll('.btn-copy-summary').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const ord = state.orders.find(o => o.id === id);
        if (ord) {
          const summary = `📋 *PAKCLOUDRDP — QUICK ORDER RECORD*
━━━━━━━━━━━━━━━━━━
👤 Customer: ${ord.customer}
💻 Plan: ${ord.plan}
🌍 Region: ${ord.region}
💰 Price: ₨${ord.price.toLocaleString()}/month
💳 Payment Method: ${ord.paymentMethod}
🧾 Proof: ${ord.proof}
🔐 Owner Verification: ${ord.ownerVerification}
📦 Order Status: ${ord.orderStatus}
🖥️ RDP Delivered: ${ord.rdpDelivered} ${ord.rdpIp ? `(${ord.rdpIp})` : ''}
📅 Activation: ${ord.activation}
🔄 Renewal: ${ord.renewal}
━━━━━━━━━━━━━━━━━━`;
          navigator.clipboard.writeText(summary);
          const orig = btn.innerHTML;
          btn.innerHTML = '✅ Copied!';
          setTimeout(() => { btn.innerHTML = orig; }, 1500);
        }
      });
    });

    // Mark Verified
    document.querySelectorAll('.btn-verify-order').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await fetch(`/api/orders/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerVerification: 'Confirmed', orderStatus: 'Active' })
          });
          loadOrders();
        } catch (err) {
          console.error(err);
        }
      });
    });

    // Deliver RDP (Open Modal)
    document.querySelectorAll('.btn-order-deliver').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const ord = state.orders.find(o => o.id === id);
        if (ord && deliveryModal) {
          deliveryOrderId.value = ord.id;
          deliveryIp.value = ord.rdpIp || '';
          updateDeliveryPreview();
          deliveryModal.style.display = 'flex';
          deliveryIp.focus();
        }
      });
    });

    // Delete Order
    document.querySelectorAll('.btn-order-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm(`Are you sure you want to remove order record ${id}?`)) {
          try {
            await fetch(`/api/orders/${id}`, { method: 'DELETE' });
            loadOrders();
          } catch (err) {
            console.error(err);
          }
        }
      });
    });
  }

  // Live Delivery Message Preview in Modal
  function updateDeliveryPreview() {
    const id = deliveryOrderId.value;
    const ord = state.orders.find(o => o.id === id);
    if (!ord) return;

    const ip = deliveryIp.value || '194.163.150.45';
    const username = deliveryUsername.value || 'Administrator';
    const password = deliveryPassword.value || 'PakCloud#2026!';

    const template = `🚀 *PAKCLOUDRDP — YOUR DEDICATED RDP IS READY!*
━━━━━━━━━━━━━━━━━━
Dear *${ord.customer.split(' ')[0] || 'Valued Customer'}*, your 100% dedicated Windows machine has been successfully prepared!

🖥️ *Dedicated IP*: ${ip}
👤 *Username*: ${username}
🔑 *Password*: ${password}

⚙️ *Plan Specs*: ${ord.plan} (${ord.region})
🌐 *Network*: 1 Gbps Uplink · Unmetered Bandwidth
📅 *Renewal Date*: ${ord.renewal}

━━━━━━━━━━━━━━━━━━
📌 *How to Connect*:
1. Open *Remote Desktop Connection* (\`mstsc.exe\`) on your Windows PC.
2. Enter the Dedicated IP above and click *Connect*.
3. Enter your Username & Password.

⚠️ *Reminder*: Please keep your credentials secure. For any support or renewal, reply directly to this chat! 🚀`;

    if (deliveryPreviewText) deliveryPreviewText.value = template;
  }

  if (deliveryIp) deliveryIp.addEventListener('input', updateDeliveryPreview);
  if (deliveryUsername) deliveryUsername.addEventListener('input', updateDeliveryPreview);
  if (deliveryPassword) deliveryPassword.addEventListener('input', updateDeliveryPreview);

  // Close Delivery Modal
  function closeDeliveryModal() {
    if (deliveryModal) deliveryModal.style.display = 'none';
  }

  if (closeDeliveryModalBtn) closeDeliveryModalBtn.addEventListener('click', closeDeliveryModal);
  if (cancelDeliveryBtn) cancelDeliveryBtn.addEventListener('click', closeDeliveryModal);

  // Submit Delivery Form
  if (deliveryForm) {
    deliveryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = deliveryOrderId.value;
      const ip = deliveryIp.value.trim();
      const username = deliveryUsername.value.trim();
      const password = deliveryPassword.value.trim();

      try {
        const res = await fetch(`/api/orders/${id}/delivery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, username, password })
        });
        const data = await res.json();
        if (data.success) {
          navigator.clipboard.writeText(data.deliveryMessage);
          alert('🚀 Dedicated RDP Delivered! WhatsApp delivery message copied to your clipboard.');
          closeDeliveryModal();
          loadOrders();
        }
      } catch (err) {
        alert('Error saving delivery: ' + err.message);
      }
    });
  }

  // Search & Filter Listeners
  if (orderSearchInput) {
    orderSearchInput.addEventListener('input', renderOrdersList);
  }

  if (clearOrderSearchBtn) {
    clearOrderSearchBtn.addEventListener('click', () => {
      orderSearchInput.value = '';
      renderOrdersList();
      orderSearchInput.focus();
    });
  }

  orderFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      orderFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeOrderFilter = btn.getAttribute('data-status') || 'all';
      renderOrdersList();
    });
  });

  // Create Order Submission
  if (createOrderForm) {
    createOrderForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const customer = document.getElementById('orderCustomer').value;
      const plan = document.getElementById('orderPlan').value;
      const region = document.getElementById('orderRegion').value;
      const paymentMethod = document.getElementById('orderPaymentMethod').value;
      const proof = document.getElementById('orderProof').value;
      const ownerVerification = document.getElementById('orderOwnerVerification').value;
      const channel = document.getElementById('orderChannel').value;
      const notes = document.getElementById('orderNotes') ? document.getElementById('orderNotes').value : '';

      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer, plan, region, paymentMethod, proof, ownerVerification, channel, notes })
        });

        const data = await res.json();
        if (data.success) {
          if (data.whatsappFormatted) {
            navigator.clipboard.writeText(data.whatsappFormatted);
          }
          alert('✅ Order Record Created! Formatted Section 22 WhatsApp record copied to your clipboard.');
          createOrderForm.reset();
          updateOrderLivePrice();
          loadOrders();
        }
      } catch (err) {
        alert('Error creating order: ' + err.message);
      }
    });
  }

  loadOrders();

  // ==========================================
  // 8. ESCALATIONS MANAGEMENT (OWNER REVIEW & DISPATCH)
  // ==========================================
  async function loadEscalations() {
    try {
      const res = await fetch('/api/escalations');
      const data = await res.json();
      state.escalations = data.escalations || [];
      
      const pendingCount = state.escalations.filter(e => e.status !== 'RESOLVED').length;
      escalationCountBadge.textContent = pendingCount;

      escalationQueue.innerHTML = '';
      if (state.escalations.length === 0) {
        escalationQueue.innerHTML = '<p class="panel-desc">No active escalations. Everything running smoothly! 🟢</p>';
        return;
      }

      state.escalations.forEach(esc => {
        const card = document.createElement('div');
        card.className = 'escalation-card';

        let actionButtonsHtml = '';
        if (esc.status !== 'RESOLVED') {
          if (esc.type === 'PAYMENT_VERIFICATION') {
            actionButtonsHtml = `
              <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;">
                <button class="btn btn-primary btn-action" data-id="${esc.id}" data-action="APPROVE_PAYMENT" style="padding: 6px 14px; font-size: 0.78rem;">
                  ✅ Verify Payment & Send 30m ETA
                </button>
                <button class="btn btn-outline btn-action" data-id="${esc.id}" data-action="CUSTOM_REPLY" style="padding: 6px 12px; font-size: 0.78rem;">
                  💬 Custom Message
                </button>
              </div>
            `;
          } else if (esc.type === 'DISCOUNT_REQUEST') {
            actionButtonsHtml = `
              <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;">
                <button class="btn btn-primary btn-action" data-id="${esc.id}" data-action="OFFER_DISCOUNT" style="padding: 6px 14px; font-size: 0.78rem;">
                  💸 Approve Custom Price Offer
                </button>
                <button class="btn btn-outline btn-action" data-id="${esc.id}" data-action="REJECT_REQUEST" style="padding: 6px 12px; font-size: 0.78rem;">
                  ❌ Decline (Fixed Rates)
                </button>
                <button class="btn btn-outline btn-action" data-id="${esc.id}" data-action="CUSTOM_REPLY" style="padding: 6px 12px; font-size: 0.78rem;">
                  💬 Custom Reply
                </button>
              </div>
            `;
          } else {
            actionButtonsHtml = `
              <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;">
                <button class="btn btn-primary btn-action" data-id="${esc.id}" data-action="CUSTOM_REPLY" style="padding: 6px 14px; font-size: 0.78rem;">
                  💬 Send Owner Response
                </button>
                <button class="btn btn-outline btn-action" data-id="${esc.id}" data-action="REJECT_REQUEST" style="padding: 6px 12px; font-size: 0.78rem;">
                  ❌ Decline per Policy
                </button>
              </div>
            `;
          }
        } else {
          actionButtonsHtml = `
            <div style="margin-top: 10px; padding: 8px 12px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 6px; font-size: 0.78rem; color: #A7F3D0;">
              <strong>✅ Resolution:</strong> ${esc.resolutionNotes || 'Resolved by Owner'}<br>
              ${esc.dispatchedMessage ? `<small style="opacity: 0.85;">Dispatched to ${esc.channel}: "${esc.dispatchedMessage.slice(0, 100)}..."</small>` : ''}
            </div>
          `;
        }

        // Chat history context for this ticket (linked by customerId/sessionId)
        const convo = esc.conversation || [];
        const historyRowHtml = convo.length
          ? `<details class="esc-history" style="margin-top:10px;">
               <summary style="cursor:pointer; font-size:0.8rem; color:#93C5FD; user-select:none;">
                 💬 View customer chat history (${convo.length} messages)
               </summary>
               <div style="margin-top:8px; max-height:220px; overflow:auto; display:flex; flex-direction:column; gap:6px; padding:8px; background:rgba(0,0,0,0.25); border-radius:6px;">
                 ${convo.map((m) => {
                   const who = m.sender === 'owner' ? '👑 Owner' : (m.sender === 'owner_escalation' ? '👑 Owner (Escalation)' : (m.sender === 'agent' ? '🤖 Agent' : '👤 Customer'));
                   return `<div style="font-size:0.75rem; text-align:${m.sender === 'user' ? 'left' : 'right'};">
                     <small style="opacity:0.7; display:block;">${who} · ${m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}</small>
                     <span style="display:inline-block; max-width:90%; padding:4px 8px; border-radius:8px; background:${m.sender === 'user' ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.2)'}; color:#E2E8F0;">${escapeHtml(m.text || '')}</span>
                   </div>`;
                 }).join('')}
               </div>
             </details>`
          : '<p style="font-size:0.78rem; color:var(--text-muted); margin-top:8px;">No saved chat history for this customer yet (arrives when they message again).</p>';

        card.innerHTML = `
          <div class="card-top">
            <span class="card-title">🚨 ${esc.type} — ${esc.customerName} (${esc.channel})</span>
            <span class="badge ${esc.status === 'RESOLVED' ? 'badge-confirmed' : 'badge-urgent'}">
              ${esc.status} (${esc.priority})
            </span>
          </div>
          <p style="font-size: 0.85rem; color: #FCA5A5; margin: 6px 0;"><strong>Reason:</strong> ${esc.reason}</p>
          <p style="font-size: 0.8rem; color: var(--text-secondary);"><strong>Action Required:</strong> ${esc.actionRequired}</p>
          <p style="font-size: 0.8rem; color: #E2E8F0; margin-top: 6px; padding: 6px 10px; background: rgba(0,0,0,0.3); border-radius: 6px; font-style: italic;">
            "${esc.originalMessage}"
          </p>
          ${historyRowHtml}
          ${actionButtonsHtml}
          <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
            <small style="color: var(--text-muted);">${new Date(esc.timestamp).toLocaleString()}</small>
          </div>
        `;
        escalationQueue.appendChild(card);
      });

      // Attach Owner Action handlers
      document.querySelectorAll('.btn-action').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const actionType = btn.getAttribute('data-action');

          let discountPrice = '';
          let customMessage = '';

          if (actionType === 'OFFER_DISCOUNT') {
            discountPrice = prompt('Enter the special approved monthly price (in PKR, e.g. 2500):', '2500');
            if (!discountPrice) return;
          } else if (actionType === 'CUSTOM_REPLY') {
            customMessage = prompt('Enter message to send directly to customer on WhatsApp/Messenger:');
            if (!customMessage) return;
          }

          btn.disabled = true;
          btn.textContent = 'Processing... ⏳';

          try {
            const res = await fetch(`/api/escalations/${id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ actionType, discountPrice, customMessage })
            });

            const data = await res.json();
            if (data.success) {
              // Immediately inject owner's response into the live chat window
              appendMessage({
                sender: 'owner',
                text: data.responseMessage,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              });

              loadEscalations();
              loadOrders();

              if (confirm(`✅ Action Executed Successfully!\n\nOfficial message dispatched to customer:\n\n${data.responseMessage}\n\nWould you like to switch to the Omnichannel Simulator to see the chat?`)) {
                const simTab = document.querySelector('.nav-tab[data-tab="simulator"]');
                if (simTab) simTab.click();
              }
            } else {
              alert('Error: ' + data.error);
              btn.disabled = false;
            }
          } catch (err) {
            alert('Error processing action: ' + err.message);
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      console.error('Error loading escalations:', err);
    }
  }
  loadEscalations();
  refreshEscalationsBtn.addEventListener('click', loadEscalations);



  // ==========================================
  // 9. META WEBHOOK TESTER & ACTIVITY LOGS
  // ==========================================
  async function loadWebhookLogs() {
    try {
      const res = await fetch('/api/meta/webhook/logs');
      const data = await res.json();
      const logs = data.logs || [];

      webhookLogEntries.innerHTML = '';
      if (logs.length === 0) {
        webhookLogEntries.innerHTML = '<p style="font-size: 0.75rem; color: var(--text-muted);">No recent webhook activity.</p>';
        return;
      }

      logs.slice(0, 10).forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `
          <strong>[${log.channel}]</strong> ${log.sender}: <em>"${log.inboundText}"</em><br>
          <small style="color: var(--whatsapp-green);">Intent: ${log.intent} | Reply sent</small>
        `;
        webhookLogEntries.appendChild(item);
      });
    } catch (err) {
      console.error('Error loading webhook logs:', err);
    }
  }
  loadWebhookLogs();

  webhookSimulatorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const channel = document.getElementById('simChannel').value;
    const senderPhone = document.getElementById('simSenderPhone').value;
    const messageText = document.getElementById('simMessageText').value;
    const hasImage = document.getElementById('simHasImage').checked;

    try {
      const res = await fetch('/api/meta/webhook/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, senderPhone, messageText, hasImage })
      });

      const data = await res.json();
      if (data.success) {
        alert(`✅ Simulated ${channel} Webhook Processed Successfully!\n\nAgent Response:\n${data.agentResult.replyText}`);
  loadWebhookLogs();
  setInterval(loadWebhookLogs, 7000);
        loadEscalations();
      }
    } catch (err) {
      alert('Error simulating webhook: ' + err.message);
    }
  });

  // ==========================================
  // 10. LIVE INBOUND / OUTBOUND FEED
  // ==========================================
  const liveFeedMessages = document.getElementById('liveFeedMessages');
  const liveFeedEmpty = document.getElementById('liveFeedEmpty');
  const liveFeedCountBadge = document.getElementById('liveFeedCountBadge');
  const refreshLiveFeedBtn = document.getElementById('refreshLiveFeedBtn');
  const liveFeedStatus = document.getElementById('liveFeedStatus');
  let liveFilter = 'all';
  let lastLiveCount = 0;

  function formatLiveTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });
    } catch (e) { return ts; }
  }

  function channelEmoji(ch) {
    const c = (ch || '').toLowerCase();
    if (c === 'whatsapp') return '📱';
    if (c.includes('messenger') || c === 'facebook') return '💬';
    if (c.includes('insta')) return '📸';
    return '↔️';
  }

  function liveFeedBubble(log) {
    const shortId = String(log.senderId || '').slice(-8);
    const meta = `<div class="bubble-meta">
        <span>${channelEmoji(log.channel)} ${log.channel || 'Unknown'} · ${log.sender || 'Customer'} · ${shortId}</span>
        <span>${formatLiveTime(log.timestamp)} ${log.simulated ? '<span class="badge">SIM</span>' : ''}</span>
      </div>`;
    return `<div class="message-bubble ${log.outbound ? 'user-bubble' : 'agent-bubble'}" style="max-width:92%;">
        ${meta}
        <div style="white-space:pre-line;">${escapeHtml((log.outbound ? (log.outboundText || log.replyText) : log.inboundText) || '')}</div>
        ${!log.outbound && log.intent ? `<div style="margin-top:6px; font-size:0.72rem; color:#34d399;"><small>🎯 ${log.intent}</small></div>` : ''}
      </div>`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  async function refreshLiveFeed(scrollToBottom = false) {
    try {
      const res = await fetch('/api/meta/webhook/logs');
      const data = await res.json();
      const logs = data.logs || [];
      const filtered = liveFilter === 'all' ? logs : logs.filter(l => (l.channel || '').toLowerCase() === liveFilter.toLowerCase());

      if (liveFeedCountBadge) liveFeedCountBadge.textContent = logs.length;
      if (!liveFeedMessages || !liveFeedEmpty) return;

      liveFeedEmpty.style.display = filtered.length === 0 ? 'block' : 'none';
      if (filtered.length === 0) {
        liveFeedMessages.innerHTML = '';
        return;
      }

      const shouldScroll = scrollToBottom || logs.length !== lastLiveCount;
      lastLiveCount = logs.length;

      const items = [];
      filtered.slice().reverse().forEach(log => {
        items.push(liveFeedBubble({ ...log, outbound: false }));
        if (log.outboundText || log.replyText) {
          items.push(liveFeedBubble({ ...log, outbound: true }));
        }
      });

      liveFeedMessages.innerHTML = items.join('');
      if (shouldScroll && liveFeedMessages) {
        liveFeedMessages.scrollTop = liveFeedMessages.scrollHeight;
      }
      if (liveFeedStatus) liveFeedStatus.textContent = '● Live';
    } catch (err) {
      console.error('Error refreshing live feed:', err);
      if (liveFeedStatus) liveFeedStatus.textContent = '● Offline';
    }
  }

  if (refreshLiveFeedBtn) refreshLiveFeedBtn.addEventListener('click', () => refreshLiveFeed(true));
  document.querySelectorAll('[data-livefilter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-livefilter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      liveFilter = btn.getAttribute('data-livefilter');
      refreshLiveFeed(true);
    });
  });

  setInterval(() => refreshLiveFeed(), 5000);
  refreshLiveFeed();

  // ==========================================
  // PER-USER CHAT INBOX (two-pane)
  // ==========================================
  const chatThreadList = document.getElementById('chatThreadList');
  const chatThreadEmpty = document.getElementById('chatThreadEmpty');
  const chatThreadPane = document.getElementById('chatThreadPane');
  const chatThreadNoSelection = document.getElementById('chatThreadNoSelection');
  const chatThreadContent = document.getElementById('chatThreadContent');
  const chatThreadHeader = document.getElementById('chatThreadHeader');
  const chatThreadMessages = document.getElementById('chatThreadMessages');
  const chatThreadInputWrap = document.getElementById('chatThreadInputWrap');
  const chatInboxBadge = document.getElementById('chatInboxBadge');
  const chatRefreshBtn = document.getElementById('chatRefreshBtn');
  const chatInboxHint = document.getElementById('chatInboxHint');

  let activeChatId = null;
  let activeChatMeta = null;
  let inboxAutoRefresh = true;

  // Inbox filters (mirrors Live Feed channel filter; adds attention status)
  let allChats = [];
  let inboxFilterChannel = 'all';
  let inboxFilterStatus = 'all';
  let inboxSearchQuery = '';
  let inboxDateFrom = null;
  let inboxDateTo = null;
  const chatThreadItems = document.getElementById('chatThreadItems');
  const chatFilterCount = document.getElementById('chatFilterCount');

  const CHANNEL_ICON = { WhatsApp: '📱', Messenger: '💬', Instagram: '📸' };
  const CHANNEL_CLS = { WhatsApp: 'wa', Messenger: 'msg', Instagram: 'ig' };
  const CHANNEL_TAG = { WhatsApp: 'cannel-wa', Messenger: 'cannel-msg', Instagram: 'cannel-ig' };

  function chatChannelClass(channel) { return CHANNEL_CLS[channel] || 'wa'; }

  function filteredChats(chats) {
    return chats.filter(c => {
      const chOk = inboxFilterChannel === 'all' || (c.channel || 'WhatsApp') === inboxFilterChannel;
      let stOk = true;
      if (inboxFilterStatus === 'needs') stOk = c.lastSender === 'user';
      else if (inboxFilterStatus === 'ai') stOk = c.lastSender === 'agent' || c.lastSender === 'owner' || c.lastSender === 'owner_escalation';

      let searchOk = true;
      if (inboxSearchQuery) {
        const q = inboxSearchQuery.toLowerCase();
        const name = (c.contactName || '').toLowerCase();
        const msg = (c.lastMessage || '').toLowerCase();
        const sid = (c.sessionId || '').toLowerCase();
        searchOk = name.includes(q) || msg.includes(q) || sid.includes(q);
      }

      let dateOk = true;
      if (inboxDateFrom || inboxDateTo) {
        const t = c.lastTime ? new Date(c.lastTime).getTime() : 0;
        if (inboxDateFrom && t < inboxDateFrom.getTime()) dateOk = false;
        if (inboxDateTo) {
          const endOfDay = new Date(inboxDateTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (t > endOfDay.getTime()) dateOk = false;
        }
      }

      return chOk && stOk && searchOk && dateOk;
    });
  }

  function renderChatThreadList(chats) {
    allChats = chats;
    if (!chatThreadItems || !chatThreadEmpty) return;
    const filtered = filteredChats(chats);

    const totalNeeds = chats.filter(c => c.lastSender === 'user').length;
    if (chatInboxBadge) chatInboxBadge.textContent = String(totalNeeds);
    const statsEl = document.getElementById('chatInboxStats');
    if (statsEl) statsEl.textContent = `${chats.length} conversation${chats.length !== 1 ? 's' : ''}${totalNeeds > 0 ? ` · ${totalNeeds} need attention` : ''}`;

    if (filtered.length === 0) {
      chatThreadItems.innerHTML = '';
      chatThreadEmpty.style.display = 'block';
      if (chatFilterCount) chatFilterCount.textContent = chats.length === 0 ? '' : '0 matches';
      return;
    }
    chatThreadEmpty.style.display = 'none';
    if (chatFilterCount) chatFilterCount.textContent = `${filtered.length} of ${chats.length} chats`;

    chatThreadItems.innerHTML = filtered.map(c => {
      const ch = c.channel || 'WhatsApp';
      const icon = CHANNEL_ICON[ch] || '📱';
      const chCls = CHANNEL_TAG[ch] || 'cannel-wa';
      const lastAwaiting = (c.lastSender === 'user') ? '<span class="ta">requires attention</span>' : '';
      const countInfo = `${c.messageCount || 0} msgs · ${c.customerCount || 0} customer` + ((c.aiCount||0) ? ` · ${c.aiCount} AI` : '');
      const esc = (c.escalations || [])[0];
      const escBadge = esc
        ? `<span class="chat-esc-badge esc-${(esc.priority||'').toLowerCase()}">🚨 ${escapeHtml((esc.type||'ESCALATION').replace(/_/g,' '))}</span>`
        : '';
      const aiPausedBadge = c.aiPaused ? '<span class="ai-paused-badge" title="AI paused">⏸️ AI Off</span>' : '';
      const displayName = c.contactName || 'Customer';
      const unread = (c.lastSender === 'user' && c.sessionId !== activeChatId) ? `<span class="thread-unread-badge">!</span>` : '';
      const needsAtt = (c.lastSender === 'user');

      return `
        <div class="thread-item ${c.sessionId === activeChatId ? 'active' : ''} ${needsAtt ? 'thread-needs-attention' : ''}" data-session="${escapeHtml(c.sessionId)}" title="${escapeHtml(countInfo)}">
          <div class="thread-avatar-wrap">
            <div class="thread-avatar ${chatChannelClass(ch)}">${icon}</div>
          </div>
          <div class="thread-body">
            <div class="thread-row1">
              <span class="thread-name">${escapeHtml(displayName)} ${unread}</span>
              <span class="thread-time">${formatElapsed(c.lastTime)}</span>
            </div>
            <div class="thread-preview">${escapeHtml(String(c.lastMessage || '').slice(0, 70))} ${lastAwaiting}</div>
            <div class="thread-subrow">
              <span class="thread-channel ${chCls}">${ch === 'WhatsApp' ? '📱 WA' : ch === 'Messenger' ? '💬 MSG' : '📸 IG'}</span>
              ${aiPausedBadge}
              <span class="thread-count">${escapeHtml(countInfo)}</span>
              ${escBadge}
            </div>
          </div>
        </div>`;
    }).join('');

    chatThreadItems.querySelectorAll('.thread-item').forEach(item => {
      item.addEventListener('click', () => {
        activeChatId = item.getAttribute('data-session');
        renderChatThreadList(allChats);
        loadChatThread(activeChatId);
      });
    });
  }

  function wireInboxFilters() {
    const chGroup = document.getElementById('inboxFilterChannel');
    const stGroup = document.getElementById('inboxFilterStatus');
    if (chGroup) chGroup.querySelectorAll('.if-btn').forEach(b => {
      b.addEventListener('click', () => {
        chGroup.querySelectorAll('.if-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        inboxFilterChannel = b.getAttribute('data-ich');
        renderChatThreadList(allChats);
      });
    });
    if (stGroup) stGroup.querySelectorAll('.if-btn').forEach(b => {
      b.addEventListener('click', () => {
        stGroup.querySelectorAll('.if-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        inboxFilterStatus = b.getAttribute('data-ist');
        renderChatThreadList(allChats);
      });
    });

    // Search
    const searchInput = document.getElementById('chatSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        inboxSearchQuery = searchInput.value.trim();
        renderChatThreadList(allChats);
      });
    }

    // Date filters
    const dateFrom = document.getElementById('chatDateFrom');
    const dateTo = document.getElementById('chatDateTo');
    if (dateFrom) dateFrom.addEventListener('change', () => {
      inboxDateFrom = dateFrom.value ? new Date(dateFrom.value) : null;
      renderChatThreadList(allChats);
    });
    if (dateTo) dateTo.addEventListener('change', () => {
      inboxDateTo = dateTo.value ? new Date(dateTo.value) : null;
      renderChatThreadList(allChats);
    });

    // Right pane tabs (Info / Coach)
    document.querySelectorAll('.rpt-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.rpt-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.getAttribute('data-rpt');
        const rptInfo = document.getElementById('rptInfo');
        const rptCoach = document.getElementById('rptCoach');
        if (rptInfo) rptInfo.style.display = target === 'info' ? 'block' : 'none';
        if (rptCoach) rptCoach.style.display = target === 'coach' ? 'block' : 'none';
      });
    });

    // Sync button toggle help
    const syncBtn = document.getElementById('metaSyncBtn');
    const syncHelp = document.getElementById('metaSyncHelp');
    const syncHelpClose = document.getElementById('metaSyncHelpClose');
    if (syncBtn && syncHelp) {
      syncBtn.addEventListener('click', () => {
        syncHelp.style.display = syncHelp.style.display === 'none' ? 'block' : 'none';
      });
    }
    if (syncHelpClose && syncHelp) {
      syncHelpClose.addEventListener('click', () => { syncHelp.style.display = 'none'; });
    }
  }

  function formatElapsed(iso) {
    if (!iso) return '';
    const t = new Date(iso);
    if (isNaN(t)) return '';
    const diff = Date.now() - t.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return mins + 'm';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h';
    return t.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  async function loadChats() {
    try {
      const res = await fetch('/api/chats');
      const data = await res.json();
      renderChatThreadList(data.chats || []);
      if (activeChatId) {
        const stillExists = (data.chats || []).some(c => c.sessionId === activeChatId);
        if (!stillExists) activeChatId = null;
      }
    } catch (err) {
      console.error('Error loading chats:', err);
    }
  }

  async function loadChatThread(sessionId) {
    if (chatThreadNoSelection) chatThreadNoSelection.style.display = 'none';
    if (chatThreadContent) chatThreadContent.style.display = 'flex';
    try {
      const res = await fetch('/api/chats/' + encodeURIComponent(sessionId));
      const data = await res.json();
      const chat = data.chat;
      activeChatMeta = { senderId: chat.senderId || sessionId, channel: chat.channel || 'WhatsApp', contactName: chat.contactName || 'Customer' };
      renderThread(chat);
    } catch (err) {
      console.error('Error loading chat thread:', err);
    }
  }

  const BRAND_THEME = { WhatsApp: 'theme-wa', Messenger: 'theme-msg', Instagram: 'theme-ig' };

  function renderThread(chat) {
    const ch = chat.channel || 'WhatsApp';
    const icon = CHANNEL_ICON[ch] || '📱';
    const themeCls = BRAND_THEME[ch] || 'theme-wa';

    if (chatThreadPane) { chatThreadPane.classList.remove('theme-wa', 'theme-msg', 'theme-ig'); chatThreadPane.classList.add(themeCls); }

    const esc = (chat.escalations || [])[0];
    const escBanner = esc ? `
      <div class="thread-esc-banner esc-${(esc.priority||'').toLowerCase()}">
        <div class="tec-head">🚨 Escalated (${escapeHtml((esc.type||'').replace(/_/g,' '))}) · ${escapeHtml(esc.priority||'')}</div>
        <div class="tec-msg">${escapeHtml(esc.reason || '')}</div>
        <button type="button" class="btn btn-ghost btn-sm" id="escOpenBtn">Open in Escalations →</button>
      </div>` : '';

    chatThreadHeader.innerHTML = `
      <div class="thread-avatar ${chatChannelClass(ch)}">${icon}</div>
      <div style="flex:1; min-width:0;">
        <div class="th-name">${escapeHtml(chat.contactName || 'Customer')}</div>
        <div class="th-sub">${escapeHtml(ch)} · ${escapeHtml(chat.senderId || chat.sessionId)}</div>
      </div>
      ${esc ? `<span class="thread-esc-flag esc-${(esc.priority||'').toLowerCase()}">🚨 ESCALATED</span>` : ''}
      <button class="ai-pause-btn ${chat.aiPaused ? 'paused' : ''}" id="aiPauseBtn" title="${chat.aiPaused ? 'Resume AI auto-reply' : 'Pause AI (owner replies manually)'}">
        ${chat.aiPaused ? '▶️ Resume AI' : '⏸️ Pause AI'}
      </button>
    `;

    // AI paused banner
    const pausedBanner = chat.aiPaused ? `
      <div class="ai-paused-banner">
        <span>⏸️ AI is paused for this chat</span>
        <span class="apb-sub">Incoming messages are recorded but AI will not reply. You handle this conversation manually.</span>
      </div>` : '';

    chatThreadMessages.innerHTML = (pausedBanner ? pausedBanner + '<div class="thread-esc-divider"></div>' : '') + (escBanner ? escBanner + '<div class="thread-esc-divider"></div>' : '') + chat.history.map(m => renderThreadMessage(m)).join('');
    chatThreadMessages.scrollTop = chatThreadMessages.scrollHeight;

    chatThreadInputWrap.innerHTML = `
      <div class="iti-row">
        <textarea id="ownerMsgInput" rows="1" placeholder="Reply to customer as owner... (bypasses AI)"></textarea>
        <button class="inbox-send-btn" id="ownerSendBtn">Send</button>
      </div>
      <div class="iti-actions" style="display:none" id="correctBar">
        <span style="color:var(--accent-gold);font-size:12px;">✏️ Editing AI message:</span>
        <button class="btn btn-ghost btn-sm" id="correctCancelBtn">Cancel</button>
      </div>
    `;
    const input = chatThreadInputWrap.querySelector('#ownerMsgInput');
    const sendBtn = chatThreadInputWrap.querySelector('#ownerSendBtn');
    if (input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendOwnerMessage(input, sendBtn); }
      });
    }
    if (sendBtn) sendBtn.addEventListener('click', () => sendOwnerMessage(input, sendBtn));

    // Re-analyze button lives in the right-side coach pane header.
    const reanalyzeBtn = document.getElementById('reanalyzeBtn');
    if (reanalyzeBtn) {
      reanalyzeBtn.onclick = null;
      reanalyzeBtn.addEventListener('click', () => loadSuggestions(chat.sessionId, input, true));
    }

    // AI Pause/Resume button
    const aiPauseBtn = document.getElementById('aiPauseBtn');
    if (aiPauseBtn) {
      aiPauseBtn.addEventListener('click', async () => {
        const newPaused = !chat.aiPaused;
        try {
          await fetch(`/api/chats/${encodeURIComponent(chat.sessionId)}/ai-pause`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paused: newPaused })
          });
          chat.aiPaused = newPaused;
          renderThread(chat);
          loadChats();
        } catch (err) {
          console.error('Failed to toggle AI pause:', err);
        }
      });
    }

    const escOpenBtn = chatThreadMessages.querySelector('#escOpenBtn');
    if (escOpenBtn) escOpenBtn.addEventListener('click', () => {
      const tab = document.querySelector('.nav-tab[data-tab="escalations"]');
      if (tab) tab.click();
    });

    loadSuggestions(chat.sessionId, input, false);

    chatThreadMessages.querySelectorAll('[data-correct]').forEach(btn => {
      btn.addEventListener('click', () => {
        const msgId = btn.getAttribute('data-correct');
        const bubble = btn.closest('.ib');
        const original = chat.history.find(m => m.id === msgId);
        const corrected = prompt('Correct the AI message below (this edits it and resends to the customer):', original ? original.text : '');
        if (corrected !== null && corrected.trim()) {
          correctAiMessage(chat.sessionId, msgId, corrected.trim());
        }
      });
    });

    // Quick reply chips
    const QUICK_REPLIES = {
      greeting: 'Wa Alaikum Assalam! 🚀 Welcome to PakCloudRDP. How can I help you today?',
      pricing: 'Here are our plans:\n\n💰 *Little EU*: ₨1,500/mo (1 vCPU, 3GB RAM)\n⭐ *Starter EU*: ₨2,800/mo (4 vCPU, 8GB RAM) — Most Popular\n🚀 *Standard EU*: ₨3,800/mo (6 vCPU, 12GB RAM)\n💪 *Plus EU*: ₨7,000/mo (8 vCPU, 24GB RAM)\n\nAll plans include 100% Dedicated Machine + Private IP + 1 Gbps Uplink.',
      delivery: '🚀 Delivery SLA: Within 30 minutes of payment verification (during working hours 9 AM – 12 AM PKT).\n\nAfter 12 AM, orders are queued for morning delivery.',
      payment: '💳 *Payment Accounts:*\n\n📱 JazzCash / Raast / NayaPay: `03014149031`\nAccount: Muhammad Jawad Iqbal Khan\n\n🏦 UBL Bank:\nA/C: `300841314`\nIBAN: `PK77UNIL0109000300841314`\n\n⚠️ Please share screenshot after payment!',
      trial: 'Dedicated IPs aur server costs ki waja se free trial available nahi hota, lekin payment confirm hotay hi 30 minutes mein fast delivery ho jati hai! 🚀',
      escalate: '🚨 This conversation needs owner attention. Let me escalate this for you.',
      thankyou: 'Shukriya! 🙏 Agar koi aur sawal ho toh zaroor poochein. Have a great day!',
      followup: 'Hello! Just checking in — is everything working well with your RDP? 🖥️ Let us know if you need any help.'
    };

    document.querySelectorAll('.qr-chip').forEach(chip => {
      chip.onclick = () => {
        const key = chip.getAttribute('data-qr');
        const msg = QUICK_REPLIES[key];
        if (msg && input) {
          input.value = msg;
          input.focus();
          input.style.height = 'auto';
          input.style.height = input.scrollHeight + 'px';
        }
      };
    });

    // Message action listeners (reactions, reply, edit, delete)
    chatThreadMessages.querySelectorAll('[data-react]').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = prompt('React with an emoji:', '👍');
        if (emoji && emoji.trim()) {
          const msgBubble = btn.closest('.msg-bubble');
          let reactionsDiv = msgBubble.querySelector('.msg-reactions');
          if (!reactionsDiv) {
            reactionsDiv = document.createElement('div');
            reactionsDiv.className = 'msg-reactions';
            msgBubble.querySelector('.ib-text').after(reactionsDiv);
          }
          reactionsDiv.innerHTML += `<span class="msg-reaction">${emoji.trim()} <span class="r-count">1</span></span>`;
        }
      });
    });

    chatThreadMessages.querySelectorAll('[data-reply]').forEach(btn => {
      btn.addEventListener('click', () => {
        const msgId = btn.getAttribute('data-reply');
        const bubble = btn.closest('.msg-bubble');
        const text = bubble.querySelector('.ib-text')?.textContent || '';
        if (input) {
          input.value = '';
          input.focus();
          const replyQuote = document.createElement('div');
          replyQuote.className = 'msg-reply-quote';
          replyQuote.innerHTML = `<span class="rq-sender">Replying to:</span> ${text.slice(0, 80)}${text.length > 80 ? '...' : ''}`;
          const existingQuote = chatThreadInputWrap.querySelector('.msg-reply-quote');
          if (existingQuote) existingQuote.remove();
          chatThreadInputWrap.querySelector('.iti-row').before(replyQuote);
        }
      });
    });

    chatThreadMessages.querySelectorAll('[data-delmsg]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Delete this message from view?')) {
          const bubble = btn.closest('.msg-bubble');
          if (bubble) {
            bubble.style.opacity = '0.4';
            bubble.style.textDecoration = 'line-through';
          }
        }
      });
    });

    // Customer info panel
    const infoPane = document.getElementById('infoPaneContent');
    const infoPaneEmpty = document.getElementById('infoPaneEmpty');
    const infoHeader = document.getElementById('infoPaneHeader');
    const infoOrders = document.getElementById('infoOrderHistory');
    const infoEsc = document.getElementById('infoEscalations');
    const infoNotes = document.getElementById('infoNotes');
    if (infoPane && infoPaneEmpty) {
      infoPaneEmpty.style.display = 'none';
      infoPane.style.display = 'block';
      const themeCls = chatChannelClass(ch);
      const bgGrad = ch === 'WhatsApp' ? 'linear-gradient(135deg,#25D366,#128C7E)' : ch === 'Messenger' ? 'linear-gradient(135deg,#0084FF,#0069D9)' : 'linear-gradient(135deg,#E1306C,#405DE6)';
      if (infoHeader) infoHeader.innerHTML = `
        <div class="iph-avatar" style="background:${bgGrad};">${icon}</div>
        <div>
          <div class="iph-name">${escapeHtml(chat.contactName || 'Customer')}</div>
          <div class="iph-id">${escapeHtml(ch)} · ${escapeHtml(chat.senderId || chat.sessionId)}</div>
        </div>`;
      if (infoOrders) {
        const msgCount = (chat.history || []).length;
        const custMsgs = (chat.history || []).filter(m => m.sender === 'user').length;
        const aiMsgs = (chat.history || []).filter(m => m.sender === 'agent').length;
        infoOrders.innerHTML = `
          <div class="ipl-item"><span class="ipl-label">Messages:</span> ${msgCount} total</div>
          <div class="ipl-item"><span class="ipl-label">Customer:</span> ${custMsgs} · <span class="ipl-label">AI:</span> ${aiMsgs}</div>
          <div class="ipl-item"><span class="ipl-label">Channel:</span> ${escapeHtml(ch)}</div>
          <div class="ipl-item"><span class="ipl-label">Session:</span> <span class="ipl-sub">${escapeHtml(chat.sessionId || '')}</span></div>`;
      }
      if (infoEsc) {
        const escalations = chat.escalations || [];
        if (escalations.length === 0) {
          infoEsc.innerHTML = '<span style="color:#6b7280;">No escalations</span>';
        } else {
          infoEsc.innerHTML = escalations.map(e => `
            <div class="ipl-item">
              <span class="ipl-label">🚨 ${escapeHtml((e.type || '').replace(/_/g, ' '))}</span>
              <div class="ipl-sub">${escapeHtml(e.reason || '')} · ${escapeHtml(e.priority || '')}</div>
            </div>`).join('');
        }
      }

      // Load saved note into the notes textarea
      const notesEl = document.getElementById('infoNotes');
      if (notesEl) notesEl.value = chat.notes || '';

      // Save note button
      const saveNoteBtn = document.getElementById('saveNoteBtn');
      if (saveNoteBtn) {
        saveNoteBtn.onclick = async () => {
          const value = notesEl ? notesEl.value : '';
          const original = saveNoteBtn.textContent;
          saveNoteBtn.textContent = 'Saving…';
          saveNoteBtn.disabled = true;
          try {
            const res = await fetch('/api/chats/' + encodeURIComponent(chat.sessionId || chat.senderId || '') + '/notes', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ notes: value })
            });
            const data = await res.json();
            saveNoteBtn.textContent = data.success ? '✓ Saved' : '✗ Failed';
          } catch (err) {
            console.error('Error saving note:', err);
            saveNoteBtn.textContent = '✗ Failed';
          } finally {
            setTimeout(() => { saveNoteBtn.textContent = original; saveNoteBtn.disabled = false; }, 1500);
          }
        };
      }
    }
  }

  function renderThreadMessage(m) {
    const text = (m.corrected ? '<span class="corr-tag">✏️ corrected</span><br>' : '') + formatWhatsAppText(escapeHtmlSafe(m.text));
    let cls = 'ib-user';
    let actions = '';
    let label = '👤 Client';
    let icon = '👤';
    if (m.sender === 'agent') {
      cls = 'ib-agent';
      label = '🤖 AI Agent';
      icon = '🤖';
      actions = `<div class="ib-actions"><button class="correct" data-correct="${escapeHtml(m.id || '')}">✏️ Correct</button></div>`;
    } else if (m.sender === 'owner') {
      cls = 'ib-owner';
      label = '👑 Owner';
      icon = '👑';
    } else if (m.sender === 'owner_escalation') {
      cls = 'ib-owner ib-esc';
      label = '👑 Owner (Escalation)';
      icon = '🚨';
    }
    const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now';
    const msgId = escapeHtml(m.id || '');
    const actionBtns = `
      <div class="msg-actions">
        <button class="msg-action-btn react-btn" data-react="${msgId}" title="React">👍</button>
        <button class="msg-action-btn reply-btn" data-reply="${msgId}" title="Reply">↩️</button>
        ${m.sender === 'owner' || m.sender === 'agent' ? `<button class="msg-action-btn edit-btn" data-editmsg="${msgId}" title="Edit">✏️</button>` : ''}
        <button class="msg-action-btn delete-btn" data-delmsg="${msgId}" title="Delete">🗑️</button>
      </div>`;
    return `<div class="ib msg-bubble ${cls}" data-msgid="${msgId}"><div class="ib-header"><span class="ib-sender">${label}</span><span class="ib-time">${time}</span></div><div class="ib-text">${text}</div>${actions}${actionBtns}</div>`;
  }

  // Guard: formatWhatsAppText renders *bold* etc; make sure text is escaped first.
  function escapeHtmlSafe(str) {
    return escapeHtml(String(str == null ? '' : str));
  }

  function loadSuggestions(sessionId, inputEl, force) {
    const panel = document.getElementById('inboxCoachPanel');
    const src = document.getElementById('inboxSuggestSrc');
    if (!panel) return;
    if (src) src.textContent = force ? '(re-analyzing)' : '(analyzing full chat)';
    panel.innerHTML = '<div class="inbox-suggest-loading">Analyzing full conversation…<br><small>Only re-analyzes when the chat changed</small></div>';
    fetch('/api/chats/' + encodeURIComponent(sessionId) + '/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: !!force })
    })
      .then(r => r.json())
      .then(data => {
        const a = data.analysis || {};
        const list = (a.suggestions || data.suggestions || []).slice(0, 3);
        if (src) src.textContent = data.cached ? '(cached · chat unchanged)' : (a.usedFallback ? '(rule-based)' : '(AI)');

        let html = '';
        const stage = String(a.stage || '').toUpperCase();
        if (stage) html += `<span class="coach-stage">${escapeHtml(stage)}</span>`;
        if (a.upsell) html += `<div class="coach-upsell">🎯 <b>Make the sale:</b> ${escapeHtml(a.upsell)}</div>`;
        if (a.signals && a.signals.length) html += `<div class="coach-bullets"><span class="cb-label">🟢 Buy signals</span>${a.signals.map(s => `<div class="cb-item">${escapeHtml(s)}</div>`).join('')}</div>`;
        if (a.objections && a.objections.length) html += `<div class="coach-bullets"><span class="cb-label">🔴 Objections</span>${a.objections.map(s => `<div class="cb-item">${escapeHtml(s)}</div>`).join('')}</div>`;

        if (!list.length) {
          html += '<div class="inbox-suggest-loading">No suggestions available yet.</div>';
        } else {
          html += '<div class="inbox-suggest-chips">';
          list.forEach(s => {
            html += `<button type="button" class="suggestion-chip" data-sugg="${escapeHtml(s)}" title="Click to fill the reply box (you still send it)">${escapeHtml(s)}</button>`;
          });
          html += '</div>';
        }
        panel.innerHTML = html;
        panel.querySelectorAll('[data-sugg]').forEach(c => {
          c.addEventListener('click', () => {
            if (inputEl) { inputEl.value = c.getAttribute('data-sugg'); inputEl.focus(); }
          });
        });
      })
      .catch(() => {
        if (src) src.textContent = '';
        panel.innerHTML = '<div class="inbox-suggest-loading">Suggestions unavailable.</div>';
      });
  }

  function sendOwnerMessage(input, sendBtn) {
    const text = (input ? input.value : '').trim();
    if (!text || !activeChatMeta || !activeChatId) return;
    if (input) input.value = '';
    sendBtn.disabled = true;
    fetch('/api/chats/' + encodeURIComponent(activeChatId) + '/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, senderName: 'Owner' })
    })
      .then(r => r.json())
      .then(data => {
        if (data.history) {
          chatThreadMessages.innerHTML = data.history.map(renderThreadMessage).join('');
          chatThreadMessages.scrollTop = chatThreadMessages.scrollHeight;
        }
        loadChats();
        if (chatInboxHint) chatInboxHint.textContent = 'Sending OK' + (data.dispatchResult && !data.dispatchResult.success ? ' · ⚠️ delivery check' : '');
      })
      .catch(() => { if (chatInboxHint) chatInboxHint.textContent = '⚠️ send failed'; })
      .finally(() => { sendBtn.disabled = false; });
  }

  function correctAiMessage(sessionId, messageId, text) {
    fetch('/api/chats/' + encodeURIComponent(sessionId) + '/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, text })
    })
      .then(r => r.json())
      .then(data => {
        if (data.history) {
          chatThreadMessages.innerHTML = data.history.map(renderThreadMessage).join('');
          chatThreadMessages.scrollTop = chatThreadMessages.scrollHeight;
        }
        loadChats();
        if (chatInboxHint) chatInboxHint.textContent = 'AI message corrected & resent';
      })
      .catch(() => { if (chatInboxHint) chatInboxHint.textContent = '⚠️ correction failed'; });
  }

  if (chatRefreshBtn) chatRefreshBtn.addEventListener('click', () => loadChats());
  setInterval(() => { if (inboxAutoRefresh) loadChats(); }, 8000);
  wireInboxFilters();
  loadChats();

  // ==========================================
  // META SYNC PANEL
  // ==========================================
  const metaSyncStatus = document.getElementById('metaSyncStatus');
  const metaSyncTitle = document.getElementById('metaSyncTitle');
  const metaSyncBtn = document.getElementById('metaSyncBtn');
  const metaSyncHelp = document.getElementById('metaSyncHelp');
  const metaSyncHelpClose = document.getElementById('metaSyncHelpClose');

  function renderMetaSync(status) {
    if (!metaSyncStatus || !metaSyncTitle) return;
    if (status.enabled) {
      metaSyncTitle.textContent = '✅ Meta Sync Active';
      metaSyncStatus.textContent = `Synced with Meta. ${status.total || 0} conversation(s) found. Full message text fills live via webhook.`;
      if (metaSyncBtn) metaSyncBtn.disabled = false;
    } else {
      metaSyncTitle.textContent = '🔒 Meta Sync needs one permission';
      metaSyncStatus.textContent = (status && status.message) || 'Meta permission not granted yet.';
      if (metaSyncBtn) metaSyncBtn.disabled = false;
    }
  }

  async function checkMetaSync() {
    try {
      const res = await fetch('/api/meta/sync/status');
      const st = await res.json();
      renderMetaSync(st);
    } catch (err) {
      if (metaSyncStatus) metaSyncStatus.textContent = 'Sync status unavailable.';
    }
  }

  async function runMetaSync() {
    if (!metaSyncBtn) return;
    metaSyncBtn.disabled = true;
    if (metaSyncTitle) metaSyncTitle.textContent = '🔁 Syncing with Meta…';
    if (metaSyncStatus) metaSyncStatus.textContent = 'Requesting conversation list from Meta…';
    try {
      const res = await fetch('/api/meta/sync', { method: 'POST' });
      const result = await res.json();
      renderMetaSync(result);
      if (result.enabled) {
        if (metaSyncStatus) metaSyncStatus.textContent = `Done. ${result.synced || 0} new conversation(s) added, ${result.alreadyHave || 0} already present.`;
        loadChats();
      } else if (result.reason === 'no-permission' && metaSyncHelp) {
        metaSyncHelp.style.display = 'block';
      }
    } catch (err) {
      if (metaSyncTitle) metaSyncTitle.textContent = '⚠️ Sync failed';
      if (metaSyncStatus) metaSyncStatus.textContent = 'Could not reach Meta.';
    } finally {
      if (metaSyncBtn) metaSyncBtn.disabled = false;
    }
  }

  if (metaSyncBtn) metaSyncBtn.addEventListener('click', runMetaSync);
  if (metaSyncHelpClose) metaSyncHelpClose.addEventListener('click', () => { if (metaSyncHelp) metaSyncHelp.style.display = 'none'; });
  checkMetaSync();

});
