/**
 * PAKCLOUDRDP CUSTOMER SUPPORT SERVICE (CSS) AGENT
 * 
 * Core Engine adhering strictly to TEAM WHATSAPP CHEAT SHEET.md
 * Supports Roman Urdu, English, and Mixed Urdu.
 */
import { KNOWLEDGE_BASE } from '../config/knowledgeBase.js';
import { escalationEngine } from './escalationEngine.js';
import { orderManager } from './orderManager.js';
import { geminiService } from '../services/geminiService.js';
import { conversationStore } from '../services/conversationStore.js';

export class CSSAgent {
  constructor() {
    this.kb = KNOWLEDGE_BASE;
  }

  /**
   * Process incoming customer message
   * @param {string} userMessage - Raw text sent by customer
   * @param {object} metadata - Customer info, channel, past history
   * @returns {object} { replyText, escalation, detectedPlan, detectedRegion, suggestedActions }
   */
  async handleMessage(userMessage, metadata = {}) {
    const rawText = (userMessage || '').trim();
    const lowerText = rawText.toLowerCase();

    // 1. Check for Escalation triggers first
    const escalationTrigger = escalationEngine.evaluate(rawText, metadata);
    let escalationRecord = null;

    if (escalationTrigger) {
      escalationRecord = escalationEngine.logEscalation(
        { id: metadata.senderId, name: metadata.senderName || 'Customer', phone: metadata.phone },
        metadata.channel || 'WhatsApp',
        escalationTrigger,
        rawText
      );
    }

    // 2. Identify Plan & Region mentions in customer text
    const planMatch = this.detectPlan(lowerText);
    const regionMatch = this.detectRegion(lowerText);

    // 3. Load the customer's FULL prior conversation. Every reply (rule-based or
    //    AI) is made in context of what this person already said, never in
    //    isolation. Incoming messages are persisted BEFORE the agent runs, so
    //    this includes the current message plus all earlier turns.
    const chatKey = metadata.sessionId || metadata.senderId || '';
    const priorHistory = conversationStore.get(chatKey) || [];

    // 3b. ANTI-REPEAT / ANTI-SPAM GUARD — only trigger on consecutive repeated
    // objections within a recent window (e.g. 30 minutes). Never silence greetings,
    // conversational openers, or return visits.
    let responseText = '';
    let intent = 'GENERAL_QUERY';
    let suggestedActions = [];
    let repeatState = 'none'; // 'handoff' | 'silent'
    let repeatHandoffText = null;

    const GREETING_WORDS = new Set(['hi', 'hello', 'hey', 'salam', 'assalam', 'aoa', 'assalam o alaikum', 'assalamu alaikum', 'slaam', 'slm', 'hy']);
    const isGreeting = GREETING_WORDS.has(lowerText) ||
      lowerText.startsWith('hi ') ||
      lowerText.startsWith('hello ') ||
      lowerText.startsWith('hey ') ||
      lowerText.startsWith('salam') ||
      lowerText.startsWith('assalam');

    if (!escalationTrigger && !isGreeting) {
      const userMsgs = priorHistory.filter((m) => m.sender === 'user');
      // Incoming message was already pushed, so prevUser is at length - 2
      const prevUser = userMsgs.length >= 2 ? userMsgs[userMsgs.length - 2] : null;
      const prevTime = prevUser ? new Date(prevUser.timestamp || 0).getTime() : 0;
      const isRecentConsecutiveRepeat = Boolean(
        prevUser &&
        String(prevUser.text || '').trim().toLowerCase() === lowerText &&
        (Date.now() - prevTime < 30 * 60 * 1000)
      );

      if (isRecentConsecutiveRepeat) {
        repeatHandoffText =
          'Bhai, aapka concern bilkul samajh aa raha hai. 🤝 Main isko owner ko ' +
          'personally forward kar raha hoon — wo khud aapko WhatsApp par message ' +
          'kareinge aur payment confirmation ke har point par aapki madad kareinge. ' +
          'Koi tension nahi, hum yahan hain.';
        const lastAgentMsg = priorHistory.filter((m) => m.sender === 'agent').pop();
        const handoffRecentlySent = Boolean(
          lastAgentMsg &&
          (lastAgentMsg.text || '').includes('personally forward kar raha hoon') &&
          (Date.now() - new Date(lastAgentMsg.timestamp || 0).getTime() < 30 * 60 * 1000)
        );

        if (handoffRecentlySent) {
          repeatState = 'silent';
          responseText = '';
          intent = 'REPEAT_SILENT';
        } else {
          repeatState = 'handoff';
          escalationRecord = escalationEngine.logEscalation(
            { id: metadata.senderId, name: metadata.senderName || 'Customer', phone: metadata.phone },
            metadata.channel || 'WhatsApp',
            { type: 'REPEAT_OBJECTION', priority: 'HIGH', reason: 'Repeated identical customer message — unresolved trust/objection.' },
            rawText
          );
          responseText = repeatHandoffText;
          intent = 'REPEAT_HANDOFF';
          suggestedActions = ['Owner Follow-up'];
        }
      }
    }

    // 4. Match Intent & generate response

    // --- AI-FIRST (ongoing conversations): reply with full-chat context ---
    // Once this person already has a chat history, the AI reads the ENTIRE
    // previous conversation and answers contextually — it remembers which
    // plan/region was already quoted, whether they said they will pay, what was
    // already answered, and continues from there. Escalations (payment proof,
    // discount, refund) still take priority below with their safe canned replies.
    let aiContextReply = null;
    let aiAlreadyTried = false;
    if (!escalationTrigger && geminiService.isConfigured() && priorHistory.length >= 2 && repeatState === 'none') {
      aiAlreadyTried = true;
      const gem = await geminiService.generate(this.kb, rawText, '', priorHistory);
      if (gem.ok) aiContextReply = gem.text;
    }

    if (aiContextReply) {
      intent = 'AI_CONTEXT';
      responseText = aiContextReply;
      suggestedActions = ['Cheapest Plan', 'Plans Matrix', 'Payment Accounts'];
    }

    // --- Intent: Payment Proof Submitted / Verification ---
    else if (escalationTrigger && escalationTrigger.type === 'PAYMENT_VERIFICATION') {
      intent = 'PAYMENT_VERIFICATION';
      responseText = `Shukriya! Aapki payment details aur screenshot receive ho gaya hai. 🧾

🚨 Hamari policy k mutabiq *Owner* bank/wallet payment confirm kareinge. 
Jaise hi verification mukammal hoti hai (target *within 30 minutes* during working hours 9 AM – 12 AM PKT), aapko aapki *Dedicated Windows RDP IP, Username & Password* deliver kar di jaye gi. 🚀`;
      suggestedActions = ['Owner Verification Pending', 'Order Queue'];
    }

    // --- Intent: Discount / Bargaining / Long-Term ---
    else if (escalationTrigger && escalationTrigger.type === 'DISCOUNT_REQUEST') {
      intent = 'DISCOUNT_REQUEST';
      const cleanText = lowerText.replace(/-/g, ' ');
      if (
        lowerText.includes('long-term') ||
        cleanText.includes('long term') || 
        cleanText.includes('longterm') || 
        cleanText.includes('3 month') || 
        cleanText.includes('6 month') || 
        cleanText.includes('12 month') ||
        cleanText.includes('year') || 
        cleanText.includes('annual') ||
        cleanText.includes('quarter') ||
        cleanText.includes('subscription') ||
        cleanText.includes('advance') ||
        cleanText.includes('bulk')
      ) {
        responseText = this.kb.cannedReplies.longTermDiscount;
        suggestedActions = ['3 Months Commitment', '6 Months Commitment', '1 Year Commitment', 'Escalated to Owner'];
      } else {
        responseText = `PakCloudRDP par har customer ko *100% Dedicated Machine + Dedicated Private IP* provide ki jati hai. Hamari pricing high-performance servers k hisab se fixed monthly rates par set hai. 💼

Aapki discount request Owner ko escalate kar di gayi hai. Agar koi special bulk order ya offer applicable hua toh Owner review kareinge.`;
        suggestedActions = ['Show Plans', 'Escalated to Owner'];
      }
    }

    // --- Intent: Refund Request ---
    else if (escalationTrigger && escalationTrigger.type === 'REFUND_REQUEST') {
      intent = 'REFUND_REQUEST';
      responseText = `Aapki refund inquiry receive ho chuki hai. Policy k mutabiq refund requests directly *Management/Owner* review karti hai. Humne ye request Owner ko forward kar di hai, wo aapse jald rabta kareinge.`;
      suggestedActions = ['Escalated to Owner'];
    }

    // --- Intent: Specific Plan + Region Price Quote ---
    else if (planMatch && regionMatch) {
      intent = 'PRICE_QUOTE_EXACT';
      const price = this.getPrice(planMatch.id, regionMatch.id);
      responseText = `Here are the details for *${planMatch.name} (${regionMatch.name})*:

💻 *Plan*: ${planMatch.name} (${planMatch.vcpu} · ${planMatch.ram} RAM)
💾 *Storage*: ${planMatch.nvme} NVMe (or ${planMatch.ssdAlt} SSD Alt)
🌍 *Region*: ${regionMatch.name} ${regionMatch.flag}
🌐 *IP*: 100% Dedicated Private IP
⚡ *Speed*: 1 Gbps Uplink (Unmetered Bandwidth)

💰 *Price: ₨${price.toLocaleString()}/month (Fixed PKR)*

Order karne k liye reply karein ya payment accounts mangwayen. Delivery time: *~30 mins* after payment verification. 🚀`;
      suggestedActions = ['Send Payment Details', 'View All Regions', 'Order Now'];
    }

    // --- Intent: Specific Plan Price (without region) ---
    else if (planMatch && !regionMatch) {
      intent = 'PRICE_QUOTE_PLAN';
      const euPrice = this.getPrice(planMatch.id, 'eu');
      const ukPrice = this.getPrice(planMatch.id, 'uk');
      const usPrice = this.getPrice(planMatch.id, 'us');
      const inPrice = this.getPrice(planMatch.id, 'in');
      const sgPrice = this.getPrice(planMatch.id, 'sg');

      responseText = `*${planMatch.name} Plan Specs & Pricing:*
⚡ ${planMatch.vcpu} · ${planMatch.ram} RAM · ${planMatch.nvme} NVMe
✅ 100% Dedicated Machine + Dedicated IP

🌍 *Popular Regional Prices (₨/Month):*
• 🇪🇺 EU: *₨${euPrice.toLocaleString()}* (Cheapest)
• 🇬🇧 UK: *₨${ukPrice.toLocaleString()}*
• 🇺🇸 US: *₨${usPrice.toLocaleString()}*
• 🇮🇳 India: *₨${inPrice.toLocaleString()}* (Lowest Ping)
• 🇸🇬 Singapore: *₨${sgPrice.toLocaleString()}*

*(Available regions: EU, UK, US, India, Australia, Singapore, Japan).*
Aapko kis region mein chahiye? 📍`;
      suggestedActions = ['EU Region', 'US Region', 'India', 'UK'];
    }

    // --- Intent: Polite Acknowledgment or Exit ---
    else if (
      /^(ok|okay|theek|thik|thek|acha|achha|got it|hnn|hn|ji|jee|sahi|bilkul)[\.\!\s]*$/i.test(lowerText) ||
      /^(ok|okay)\s+(bhai|sir|bro|janab|dear)[\.\!\s]*$/i.test(lowerText)
    ) {
      intent = 'ACKNOWLEDGMENT';
      responseText = 'Jee bilkul bhai! 👍 Jab bhi aap ready hon ya koi mazeed sawal ho, bas bata dijiyega. Hum yahan madad ke liye hazir hain! 🚀';
      suggestedActions = ['View Plans', 'Payment Accounts'];
    }
    else if (/\b(filhal nahi|filhal nhi|abhi nahi|abhi nhi|baad me|baad mein|not now|later|cancel)\b/i.test(lowerText)) {
      intent = 'DEFERRAL';
      responseText = 'Koi masla nahi bhai, bilkul apna time lein! Jab bhi aapko RDP ki zaroorat ho, hum 24/7 yahan available hain. Have a great day! 😊';
      suggestedActions = ['View Plans'];
    }
    else if (/^(shukriya|thanks|thank you|jazakallah|bohat shukriya)[\.\!\s]*(bhai|sir|bro)?[\.\!\s]*$/i.test(lowerText)) {
      intent = 'COURTESY';
      responseText = 'Aapka bohat shukriya! Koi bhi mazeed help chahiye ho toh bila-jhijhak pooch sakte hain. 🤝';
      suggestedActions = ['View Plans', 'Payment Accounts'];
    }

    // --- Intent: Ready to Buy / Send Payment Request (High Buying Intent) ---
    else if (
      (
        /\b(number|account|accounts|bank|iban|jazzcash|easypaisa|nayapay|raast)\b/i.test(lowerText) &&
        /\b(do|dein|den|bhejo|bhej dein|bhej den|send|kahan|share|batao|bata den|chahiye|details)\b/i.test(lowerText)
      ) ||
      /\b(pay kar|pay kr|paise kahan|pay kahan|abhi lena|buy karna|order karna|pay kar doon|pay kr don|payment details)\b/i.test(lowerText)
    ) {
      intent = 'PAYMENT_METHODS';
      responseText = `Aap bilkul foran order kar sakte hain! 🚀 Payment transfer details yeh hain:

📱 *JazzCash / Raast / NayaPay*: 03014149031
Title: *Muhammad Jawad Iqbal Khan*

🏦 *UBL Bank*:
A/C: *300841314*
IBAN: *PK77UNIL0109000300841314*
Title: *Muhammad Jawad Iqbal Khan*

Payment karne ke baad uska *screenshot ya Transaction ID* yahan share kar dein. Owner verify hotay hi *~30 mins* mein aapka RDP prepare ho kar deliver ho jayega! ✅`;
      suggestedActions = ['Sent Payment Proof', 'Delivery ETA', 'Setup Help'];
    }

    // --- Intent: Delivery / Setup Time / Availability ETA ---
    else if (
      (
        /\b(kb|kab|kitna time|kitni der)\b/i.test(lowerText) &&
        /\b(milega|mil jayga|mil jayega|available|ready|deliver|tayyar|hoga)\b/i.test(lowerText)
      ) ||
      /\b(how long|setup time|delivery time|delivery eta|how fast|when will i get)\b/i.test(lowerText)
    ) {
      intent = 'DELIVERY_ETA';
      responseText = `⏱️ *Account Setup Time & Delivery SLA:*
Working hours (*9:00 AM – 12:00 AM PKT*) mein payment owner verify hotay hi aapka dedicated RDP *within 30 minutes* prepare ho kar deliver ho jata hai! 🚀

Aapko WhatsApp par Dedicated IP, Username aur Password foran send kar diye jatay hain. (12 AM ke baad aane walay orders aglay roz subah deliver hotay hain).

Customer ko complete details milti hain:
• Dedicated RDP IP Address
• Administrator Username & Password
• Remote Desktop connection guide 📱`;
      suggestedActions = ['Payment Accounts', 'View Starter Specs', 'Order Now'];
    }

    // --- Intent: Cheapest Plan / Sasta RDP ---
    else if (
      lowerText.includes('sasta') ||
      lowerText.includes('cheapest') ||
      lowerText.includes('low budget') ||
      lowerText.includes('kam qeemat') ||
      lowerText.includes('minimum price') ||
      lowerText.includes('starting price') ||
      lowerText.includes('lowest price')
    ) {
      intent = 'CHEAPEST_PLAN';
      responseText = this.kb.cannedReplies.cheapestPlan;
      suggestedActions = ['Little EU (₨1,500)', 'Starter EU (₨2,800)', 'View All Plans'];
    }

    // --- Intent: All Plans List / Full Price List / Plan Pricing ---
    else if (
      /\b(pricing|price list|plans list|package list|all plans|all plan|sab plans|sab plan|rate list|rates list|kitne ka|sab ke rate|qeemat|poori list)\b/i.test(lowerText) ||
      lowerText === 'plans' || lowerText === 'price' || lowerText === 'pricing'
    ) {
      intent = 'ALL_PLANS';
      responseText = `💵 *PAKCLOUDRDP — COMPLETE PRICE & SPECS LIST*
*(100% Dedicated Machine + Dedicated Private IP · 1 Gbps Port)*
━━━━━━━━━━━━━━━━━━
1️⃣ *Little*: 1 vCPU · 3 GB RAM · 30 GB NVMe ➔ *₨1,500/mo*
2️⃣ *Starter*: 4 vCPU · 8 GB RAM · 75 GB NVMe ➔ *₨2,800/mo* ⭐ *(Most Popular)*
3️⃣ *Standard*: 6 vCPU · 12 GB RAM · 100 GB NVMe ➔ *₨3,800/mo*
4️⃣ *Plus*: 8 vCPU · 24 GB RAM · 200 GB NVMe ➔ *₨7,000/mo*
5️⃣ *Pro*: 12 vCPU · 48 GB RAM · 250 GB NVMe ➔ *₨12,500/mo*
6️⃣ *Elite*: 16 vCPU · 64 GB RAM · 300 GB NVMe ➔ *₨18,500/mo*
7️⃣ *Flagship*: 18 vCPU · 96 GB RAM · 350 GB NVMe ➔ *₨24,400/mo*
━━━━━━━━━━━━━━━━━━
🌍 *Available Regions:*
🇪🇺 EU | 🇬🇧 UK | 🇺🇸 US | 🇮🇳 India | 🇦🇺 Australia | 🇸🇬 Singapore | 🇯🇵 Japan

Aapko kis use-case aur region ke liye plan chahiye? 🚀`;
      suggestedActions = ['Order Starter EU (₨2,800)', 'Order Little EU (₨1,500)', 'Select Region'];
    }

    // --- Intent: Regions Query ---
    else if (
      lowerText.includes('region') ||
      lowerText.includes('location') ||
      lowerText.includes('country') ||
      lowerText.includes('countries') ||
      lowerText.includes('locations')
    ) {
      intent = 'REGIONS_LIST';
      responseText = `🌍 *PakCloudRDP — Available Global Regions:*

1. 🇪🇺 *EU (Europe)* — Economical & Most Popular
2. 🇬🇧 *UK (United Kingdom)*
3. 🇺🇸 *US (United States)*
4. 🇮🇳 *India* — Lowest ping from Pakistan
5. 🇦🇺 *Australia*
6. 🇸🇬 *Singapore* — Asia Hub
7. 🇯🇵 *Japan* — East Asia

*(Note: We quote a single US price covering all US locations).*

Har machine ke sath 100% Dedicated Private IP milti hai. Aap kis region ki pricing dekhna chahte hain?`;
      suggestedActions = ['EU (Cheapest)', 'US Region', 'India (Low Ping)', 'UK'];
    }

    // --- Intent: Netflix / Banking / Use cases / Legality ---
    else if (
      (
        /\b(netflix|banking|youtube|streaming|forex|trading|crypto)\b/i.test(lowerText) ||
        /\b(automation|trading bot|forex bot|crypto bot|bot run|bot chalana|bot chalta)\b/i.test(lowerText) ||
        /\b(use kar sakta|chala sakta|allowed hai|chale ga|chalega)\b/i.test(lowerText)
      ) &&
      !/\b(bot kyu|bot kyun|bot sai|bot sahi|bot baat|bot bat|chatbot|apka bot)\b/i.test(lowerText)
    ) {
      intent = 'USE_CASE_COMPLIANCE';
      responseText = this.kb.cannedReplies.streamingBanking;
      suggestedActions = ['Choose Plan', 'Payment Details', 'Cheapest Plan'];
    }

    // --- Intent: What is RDP / How does it work ---
    else if (
      lowerText.includes('what is rdp') ||
      lowerText.includes('rdp kya') ||
      lowerText.includes('how does rdp work') ||
      lowerText.includes('rdp meaning') ||
      lowerText.includes('rdp ka matlab')
    ) {
      intent = 'WHAT_IS_RDP';
      responseText = `❓ *What is RDP & How Does It Work?*
RDP (Remote Desktop Protocol) ka matlab hai ke aapko cloud mein ek *100% Dedicated Windows PC* milta hai jise aap apne phone, laptop ya computer se internet ke zariye chalate hain. 🖥️✨

• Is par ultra-fast *1 Gbps internet* chalta hai.
• Ye *24/7 online* rehta hai (downloads ya background tasks ke liye).
• Aapko apna *Private Dedicated IP* aur Administrator login milta hai jahan full privacy aapki hoti hai! 🚀`;
      suggestedActions = ['View Plans & Specs', 'Cheapest Plan', 'Order Little EU (₨1,500)'];
    }

    // --- Intent: GPU / Gaming RDP Inquiry ---
    else if (
      lowerText.includes('gpu') ||
      lowerText.includes('graphic') ||
      lowerText.includes('graphics') ||
      lowerText.includes('gaming') ||
      lowerText.includes('nvidia')
    ) {
      intent = 'GPU_INQUIRY';
      responseText = `🎮 *GPU RDP Inquiry & High CPU Alternative:*
Filhal hamaray paas dedicated high-performance CPU-based Windows RDPs available hain (up to 18 vCPU / 96 GB RAM / NVMe storage) jo web browsing, automation, multiple apps aur heavy workloads ke liye super fast hain. ⚡

Dedicated GPU (Nvidia/Gaming/Heavy 3D rendering) machines standard inventory mein nahi hain. Agar aapko enterprise custom GPU setup chahiye to hum owner ko inquiry forward kar sakte hain! 🤝`;
      suggestedActions = ['View High CPU Plans', 'Starter EU (4 vCPU)', 'Plus EU (8 vCPU)'];
    }

    // --- Intent: Mobile / Android / iPhone Connection ---
    else if (
      lowerText.includes('mobile') ||
      lowerText.includes('phone') ||
      lowerText.includes('android') ||
      lowerText.includes('iphone') ||
      lowerText.includes('ios') ||
      lowerText.includes('connect from phone')
    ) {
      intent = 'MOBILE_CONNECTION';
      responseText = `📱 *How to Connect from Mobile (Android / iPhone):*
Jee bilkul! Aap apne Android ya iPhone se bhi asani se connect kar sakte hain:
1. Play Store / App Store se *"RD Client"* (Microsoft Remote Desktop) app install karein.
2. "+" icon daba kar "Add PC" select karein.
3. Hamari di gayi *Dedicated IP* enter karein.
4. Diya gaya *Username* aur *Password* enter kar ke Connect karein! 📱🚀`;
      suggestedActions = ['Order Starter EU', 'View Plans', 'Payment Details'];
    }

    // --- Intent: Full Admin Access ---
    else if (
      lowerText.includes('admin') ||
      lowerText.includes('administrator') ||
      lowerText.includes('root access') ||
      lowerText.includes('install software')
    ) {
      intent = 'ADMIN_ACCESS';
      responseText = `👑 *Full Administrator (Root) Access:*
Jee aapko machine ka *Full Administrator (Root)* access milta hai! Aap apne zaroori legal software, Chrome browsers, bots, trading platforms aur tools directly install aur run kar sakte hain. ✅`;
      suggestedActions = ['View Plans', 'Order Starter Plan', 'Payment Methods'];
    }

    // --- Intent: Payment Accounts / How to pay ---
    else if (
      lowerText.includes('payment method') ||
      lowerText.includes('payment account') ||
      lowerText.includes('payment') ||
      lowerText.includes('jazzcash') ||
      lowerText.includes('easypaisa') ||
      lowerText.includes('nayapay') ||
      lowerText.includes('bank account') ||
      lowerText.includes('bank transfer') ||
      lowerText.includes('ubl') ||
      lowerText.includes('iban') ||
      lowerText.includes('raast') ||
      lowerText.includes('paise kaise bhejne') ||
      lowerText.includes('how to pay') ||
      lowerText.includes('account number') ||
      lowerText.includes('accounts')
    ) {
      intent = 'PAYMENT_METHODS';
      responseText = this.kb.cannedReplies.paymentAccounts;
      suggestedActions = ['I have paid (Send Proof)', 'Confirm Order Details'];
    }

    // --- Intent: Shared vs Dedicated / Why Choose PakCloudRDP ---
    else if (
      lowerText.includes('shared') ||
      lowerText.includes('difference') ||
      lowerText.includes('kyun mehanga') ||
      lowerText.includes('cheap rdp') ||
      lowerText.includes('dedicated kya hota')
    ) {
      intent = 'SHARED_VS_DEDICATED';
      responseText = this.kb.cannedReplies.sharedVsDedicated;
      suggestedActions = ['View Starter Specs', 'View Cheapest Plan'];
    }

    // --- Intent: Trial Request ---
    else if (
      /\b(trial|free trial|demo)\b/i.test(lowerText) ||
      /\b(test rdp|test machine|free test)\b/i.test(lowerText)
    ) {
      intent = 'TRIAL_INQUIRY';
      responseText = this.kb.cannedReplies.trial;
      suggestedActions = ['Order Little EU (₨1,500)', 'See Pricing'];
    }


    // --- Intent: Support Hours / Help / Machine Down ---
    else if (
      lowerText.includes('down') ||
      lowerText.includes('issue') ||
      lowerText.includes('problem') ||
      lowerText.includes('support') ||
      lowerText.includes('rabta') ||
      lowerText.includes('contact') ||
      lowerText.includes('help')
    ) {
      intent = 'SUPPORT_INQUIRY';
      responseText = `🛠️ *PakCloudRDP Support:*
• Working Hours: *9:00 AM – 12:00 AM PKT* (Every day including weekends)
• Target Response Time: *<15 minutes* during working hours.

Support Covers:
✅ RDP Connectivity & Login issues
✅ Password resets
✅ Basic troubleshooting

Agar machine down hai ya urgent issue hai toh direct WhatsApp par message karein (*${this.kb.brand.whatsappNumberRaw}*).`;
      suggestedActions = ['Password Reset', 'Technical Help'];
    }

    // --- Intent: Upgrade / Downgrade / IP Change / Policy ---
    else if (lowerText.includes('upgrade') || lowerText.includes('downgrade') || lowerText.includes('ip change') || lowerText.includes('backup')) {
      intent = 'POLICY_INQUIRY';
      if (lowerText.includes('upgrade')) {
        responseText = `⬆️ *Upgrade Policy:*
Upgrade kisi bhi waqt ho sakta hai! Aapko sirf baqi bache huwe dino ka pro-rated difference pay karna hota hai aur naya plan foran activate ho jata hai. ✅`;
      } else if (lowerText.includes('downgrade')) {
        responseText = `⬇️ *Downgrade Policy:*
Downgrade sirf next monthly renewal cycle par apply hota hai. Mid-cycle downgrade allowed nahi hai.`;
      } else if (lowerText.includes('ip change')) {
        responseText = `🌐 *IP Change Policy:*
• 1 Free IP change per subscription lifetime! 🎁
• Uske baad $5 per change.
• Processing SLA: 24 hours (subject to provider availability).
⚠️ *Note*: IP change par customer data migrate nahi hota, backup pehle le lein.`;
      } else {
        responseText = `💾 *Backup Policy:*
Data backup ki zimadari customer ki hoti hai. PakCloudRDP backup service provide nahi karta. Region change, IP change ya expiry se pehle zaroor apna backup save kar lein.`;
      }
      suggestedActions = ['Contact Support', 'View Plans'];
    }

    // --- Intent: Greetings / Intro ---
    else if (
      lowerText.startsWith('hi') ||
      lowerText.startsWith('hello') ||
      lowerText.startsWith('salam') ||
      lowerText.startsWith('assalam') ||
      lowerText.startsWith('hey') ||
      lowerText === 'aoa'
    ) {
      intent = 'GREETING';
      responseText = `Wa Alaikum Assalam! 🚀 Welcome to *PakCloudRDP — Your Dedicated Windows RDP*.

Hum provide karte hain:
✅ 100% Dedicated Machines
✅ Dedicated Private IP
✅ 1 Gbps Uplink & Unmetered Bandwidth
✅ 9 Global Regions (EU, UK, US, India, SG, etc.)

Sabse sasta plan *Little EU* sirf *₨1,500/month* se start hota hai.
Aapko kis maqsad k liye RDP chahiye ya kisi specific plan ki details check karni hain? 😊`;
      suggestedActions = ['View Cheapest Plan', 'All Plans & Specs', 'Payment Methods'];
    }

    // --- Default Fallback (Gemini-assisted, strictly KB-constrained) ---
    else {
      intent = 'FALLBACK_HELP';
      // Avoid repeating the same 5-line static pitch if recently sent
      const alreadySentPitch = priorHistory.slice(-3).some(
        (m) => m.sender === 'agent' && (m.text || '').includes('Sabse sasta *Little EU*')
      );
      const staticFallback = alreadySentPitch
        ? `Jee bhai, batayein main aapki kis cheez mein madad karoon? Agar kisi specific plan, payment details ya setup ke baare mein poochna hai toh zaroor batayein. 🤝`
        : `Jee bhai, main yahan hoon! 🙏
Aapko jo bhi chahiye — *plans & pricing*, *regions*, *payment details*, ya *delivery/support* — bata dein, main foran jawab deta hoon.

Sabse sasta *Little EU* sirf *₨1,500/month* se start hota hai aur payment verification ke baad delivery *~30 min* mein ho jati hai.

Aapko kis kaam ke liye RDP chahiye? Bata dein, main aapko best plan suggest karta hoon. 🚀`;

      if (geminiService.isConfigured() && !aiAlreadyTried && repeatState === 'none') {
        const gem = await geminiService.generate(this.kb, rawText, staticFallback, priorHistory);
        if (gem.ok) {
          responseText = gem.text;
        } else {
          responseText = staticFallback;
        }
      } else {
        responseText = staticFallback;
      }
      suggestedActions = ['Cheapest Plan', 'Plans Matrix', 'Payment Accounts'];
    }

    // Anti-repeat guard takes precedence over the rule/AI ladder output so the
    // customer never receives the same pitch twice.
    if (repeatState === 'silent') {
      responseText = '';
      intent = 'REPEAT_SILENT';
    } else if (repeatState === 'handoff') {
      responseText = repeatHandoffText;
      intent = 'REPEAT_HANDOFF';
      suggestedActions = ['Owner Follow-up'];
    }

    return {
      replyText: responseText,
      intent: intent,
      escalation: escalationRecord,
      detectedPlan: planMatch ? planMatch.name : null,
      detectedRegion: regionMatch ? regionMatch.name : null,
      suggestedActions: suggestedActions,
      timestamp: new Date().toISOString()
    };
  }

  detectPlan(text) {
    if (/\bflagship\b/i.test(text) || /\b(96\s*gb|18\s*vcpu)\b/i.test(text)) return this.kb.plans.find(p => p.id === 'flagship');
    if (/\belite\b/i.test(text) || /\b(64\s*gb|16\s*vcpu)\b/i.test(text)) return this.kb.plans.find(p => p.id === 'elite');
    // Ensure "pro" does not match problem, proceed, proxy, provider, promise, product, profile, program, etc.
    if (
      (/\bpro\b/i.test(text) && !/\b(problem|proceed|profile|prompt|provider|proxy|product|promise|program|proper|protect|project)\b/i.test(text)) ||
      /\b(48\s*gb|12\s*vcpu)\b/i.test(text)
    ) {
      return this.kb.plans.find(p => p.id === 'pro');
    }
    if (/\bplus\b/i.test(text) || /\b(24\s*gb|8\s*vcpu)\b/i.test(text)) return this.kb.plans.find(p => p.id === 'plus');
    if (/\bstandard\b/i.test(text) || /\b(12\s*gb|6\s*vcpu)\b/i.test(text)) return this.kb.plans.find(p => p.id === 'standard');
    if (/\bstarter\b/i.test(text) || /\b(8\s*gb|4\s*vcpu)\b/i.test(text)) return this.kb.plans.find(p => p.id === 'starter');
    if (/\blittle\b/i.test(text) || /\b(3\s*gb|1\s*vcpu|1500\s*wala)\b/i.test(text)) return this.kb.plans.find(p => p.id === 'little');
    return null;
  }

  detectRegion(text) {
    if (/\b(singapore|sg)\b/i.test(text)) return this.kb.regions.find(r => r.id === 'sg');
    if (/\b(japan|tokyo|jp)\b/i.test(text)) return this.kb.regions.find(r => r.id === 'jp');
    // Use word boundary for au so "aur" never matches Australia!
    if (/\b(australia|sydney|aus)\b/i.test(text) || (/\bau\b/i.test(text) && !/\b(aur|auto|audio)\b/i.test(text))) return this.kb.regions.find(r => r.id === 'au');
    if (/\b(india|mumbai|bombay|ind)\b/i.test(text)) return this.kb.regions.find(r => r.id === 'in');
    // US and states / cities
    if (
      /\b(us|usa|united states|us central|us-c|central us|us west|us-w|california|us east|us-e|new york|virginia|texas|dallas|houston|pennsylvania)\b/i.test(text)
    ) {
      return this.kb.regions.find(r => r.id === 'us');
    }
    if (/\b(uk|london|britain|england|birmingham|united kingdom)\b/i.test(text)) return this.kb.regions.find(r => r.id === 'uk');
    if (/\b(eu|europe|germany|france|frankfurt)\b/i.test(text)) return this.kb.regions.find(r => r.id === 'eu');
    return null;
  }

  /**
   * Return the price to quote for a plan + region.
   * For any US request we ALWAYS quote the single maximum US price across the
   * US variants (us, us-c, us-w, us-e) and never expose sub-regions.
   */
  getUSMax(planId) {
    const row = this.kb.priceMatrix[planId] || {};
    const usPrices = ['us', 'us-c', 'us-w', 'us-e']
      .map((k) => row[k])
      .filter((v) => typeof v === 'number');
    return usPrices.length ? Math.max(...usPrices) : 0;
  }

  getPrice(planId, regionId) {
    const row = this.kb.priceMatrix[planId];
    if (!row) return 0;
    // US request (or any US sub-region) -> single max US price
    if (regionId === 'us' || regionId === 'us-c' || regionId === 'us-w' || regionId === 'us-e') {
      return this.getUSMax(planId);
    }
    return row[regionId] || 0;
  }
}

export const cssAgent = new CSSAgent();
