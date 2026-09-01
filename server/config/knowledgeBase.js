/**
 * PAKCLOUDRDP — SINGLE SOURCE OF TRUTH KNOWLEDGE BASE
 * Extracted directly from TEAM WHATSAPP CHEAT SHEET.md
 */

export const KNOWLEDGE_BASE = {
  brand: {
    name: 'PakCloudRDP',
    tagline: 'Your Dedicated Windows RDP',
    motto: 'Own Machine • Dedicated IP • Managed Service',
    facebook: 'facebook.com/PakCloudRDP',
    whatsapp: '923394149031',
    whatsappNumberRaw: '+923394149031',
    internalUsdRate: 290, // $1 = ₨290 (Reference only, quote PKR primarily)
  },

  whatWeSell: {
    summary: 'Managed Windows RDP. Every customer gets their OWN dedicated machine and 100% dedicated private IP.',
    features: [
      '✅ OWN dedicated machine',
      '✅ 100% dedicated private IP',
      '✅ Dedicated username + password',
      '✅ Full Windows desktop access',
      '✅ Setup + management included',
      '✅ 1 Gbps uplink',
      '✅ Unmetered bandwidth',
      '✅ Windows installed via our proprietary method'
    ],
    keyRule: 'One customer = One machine = One dedicated IP.'
  },

  plans: [
    { id: 'little', name: 'Little', vcpu: '1 vCPU', ram: '3 GB', nvme: '30 GB', ssdAlt: '60 GB', bestFor: 'Budget, light browsing, single apps' },
    { id: 'starter', name: 'Starter', vcpu: '4 vCPU', ram: '8 GB', nvme: '75 GB', ssdAlt: '150 GB', bestFor: 'General work, multi-tasking, moderate tools' },
    { id: 'standard', name: 'Standard', vcpu: '6 vCPU', ram: '12 GB', nvme: '100 GB', ssdAlt: '200 GB', bestFor: 'Heavy browsing, social media automation, 24/7 bots' },
    { id: 'plus', name: 'Plus', vcpu: '8 vCPU', ram: '24 GB', nvme: '200 GB', ssdAlt: '300 GB', bestFor: 'High concurrency, heavy data processing' },
    { id: 'pro', name: 'Pro', vcpu: '12 vCPU', ram: '48 GB', nvme: '250 GB', ssdAlt: '1 TB', bestFor: 'Professional server loads, large databases' },
    { id: 'elite', name: 'Elite', vcpu: '16 vCPU', ram: '64 GB', nvme: '300 GB', ssdAlt: '1.2 TB', bestFor: 'Enterprise multi-app workloads' },
    { id: 'flagship', name: 'Flagship', vcpu: '18 vCPU', ram: '96 GB', nvme: '350 GB', ssdAlt: '1.4 TB', bestFor: 'Maximum performance & heavy enterprise computing' }
  ],

  regions: [
    { id: 'eu', name: 'EU', flag: '🇪🇺', note: 'Cheapest pricing generally' },
    { id: 'uk', name: 'UK', flag: '🇬🇧', note: 'Popular UK location' },
    { id: 'us', name: 'US', flag: '🇺🇸', note: 'US General (East rate)' },
    { id: 'us-c', name: 'US Central', flag: '🇺🇸', note: 'Central USA latency' },
    { id: 'us-w', name: 'US West', flag: '🇺🇸', note: 'West Coast USA' },
    { id: 'us-e', name: 'US East', flag: '🇺🇸', note: 'East Coast USA' },
    { id: 'in', name: 'India', flag: '🇮🇳', note: 'Lowest ping from Pakistan' },
    { id: 'au', name: 'Australia', flag: '🇦🇺', note: 'Oceania region' },
    { id: 'sg', name: 'Singapore', flag: '🇸🇬', note: 'Southeast Asia hub (Higher tier)' },
    { id: 'jp', name: 'Japan', flag: '🇯🇵', note: 'East Asia hub (Higher tier)' }
  ],

  // Fixed Monthly PKR Prices (Section 4 of Cheat Sheet)
  // Format: priceMatrix[planId][regionId]
  priceMatrix: {
    little: {
      'eu': 1500,
      'uk': 1800,
      'us': 2000,
      'us-c': 1800,
      'us-w': 1900,
      'us-e': 2000,
      'in': 2200,
      'au': 2200,
      'sg': 2300,
      'jp': 2300
    },
    starter: {
      'eu': 2800,
      'uk': 3300,
      'us': 3600,
      'us-c': 3300,
      'us-w': 3500,
      'us-e': 3600,
      'in': 4000,
      'au': 3900,
      'sg': 4100,
      'jp': 4100
    },
    standard: {
      'eu': 3800,
      'uk': 4600,
      'us': 5000,
      'us-c': 4600,
      'us-w': 4800,
      'us-e': 5000,
      'in': 5700,
      'au': 5500,
      'sg': 5800,
      'jp': 5800
    },
    plus: {
      'eu': 7000,
      'uk': 8700,
      'us': 9500,
      'us-c': 8700,
      'us-w': 9100,
      'us-e': 9500,
      'in': 10800,
      'au': 10400,
      'sg': 11000,
      'jp': 11100
    },
    pro: {
      'eu': 12500,
      'uk': 15500,
      'us': 16800,
      'us-c': 15500,
      'us-w': 16100,
      'us-e': 16800,
      'in': 19200,
      'au': 18500,
      'sg': 19700,
      'jp': 19800
    },
    elite: {
      'eu': 18500,
      'uk': 22800,
      'us': 24900,
      'us-c': 22800,
      'us-w': 23900,
      'us-e': 24900,
      'in': 28500,
      'au': 27400,
      'sg': 29100,
      'jp': 29100
    },
    flagship: {
      'eu': 24400,
      'uk': 30200,
      'us': 32900,
      'us-c': 30200,
      'us-w': 31600,
      'us-e': 32900,
      'in': 37600,
      'au': 36300,
      'sg': 38500,
      'jp': 38400
    }
  },

  network: {
    bandwidth: 'Unmetered bandwidth (no normal data caps)',
    uplink: '1 Gbps uplink',
    sustainedSpeed: '~200–500 Mbps typical sustained speed',
    fairUse: 'Heavy sustained multi-TB transfers may be reviewed under Fair Use Policy.'
  },

  delivery: {
    turnaroundTime: 'As fast as 30 minutes after owner confirms payment (during working hours).',
    lateNightNote: 'Late-night orders are prepared and delivered the next morning.',
    packageIncludes: [
      'Dedicated RDP IP Address',
      'Username',
      'Password',
      'Basic Connection Instructions (Windows Remote Desktop / Mac / Mobile)'
    ]
  },

  payment: {
    terms: 'Monthly in advance. Proof required.',
    rule: '🚨 ONLY OWNER verifies payment. CSS agent/team must never confirm payment independently.',
    accounts: [
      { method: 'JazzCash', number: '03014149031', title: 'Muhammad Jawad Iqbal Khan' },
      { method: 'Raast', id: '03014149031', title: 'Muhammad Jawad Iqbal Khan' },
      { method: 'NayaPay', id: '03014149031', title: 'Muhammad Jawad Iqbal Khan' },
      {
        method: 'UBL Bank',
        title: 'Muhammad Jawad Iqbal Khan',
        accountNumber: '300841314',
        iban: 'PK77UNIL0109000300841314'
      }
    ]
  },

  policies: {
    upgrade: 'Can happen anytime. Customer pays the pro-rated difference for remaining days. Starts immediately.',
    downgrade: 'Takes effect only at the next monthly renewal. No mid-cycle downgrades.',
    regionChange: 'Region change = NEW MACHINE. Data is NOT automatically migrated. Customer MUST backup data before switching region.',
    multipleMachines: 'Allowed. Each machine has separate order, separate dedicated IP, separate credentials, and separate billing cycle. No auto bulk discount.',
    renewalAndExpiry: {
      cycle: 'Monthly from activation date.',
      reminder: 'Automated reminder sent 3 days before expiry date.',
      unpaidPolicy: 'RDP is suspended automatically on expiry date. No grace period.',
      suspensionWindow: 'Data is preserved only during a 7-day suspension window. After final non-payment period: machine is wiped, IP released, and data permanently lost.',
      recoveryWarning: 'Never guarantee data recovery after suspension window.'
    },
    backups: 'Customer is solely responsible for backups. PakCloudRDP does NOT provide a backup service.',
    ipChange: {
      terms: 'Possible but not guaranteed (depends on provider availability). Customer must provide reason.',
      freeQuota: '1 free IP change per subscription lifetime.',
      additionalCost: '$5 per change afterwards.',
      sla: 'Processed within 24 hours if approved.',
      warning: 'IP change does NOT migrate or preserve data.'
    },
    prohibited: [
      '❌ Hacking / Penetration attempts',
      '❌ Scamming / Fraud',
      '❌ Spamming / Bulk unsolicited messaging',
      '❌ Any illegal activities',
      'Violation results in IMMEDIATE termination without refund.'
    ]
  },

  support: {
    hours: '9:00 AM – 12:00 AM PKT (Every day including weekends)',
    responseSlaWorkingHours: 'Target <15 minutes response time',
    responseSlaOffHours: 'Maximum 12 hours response time',
    machineDownAdvice: 'If your machine is down, contact WhatsApp immediately (923394149031) for fastest priority response.',
    scope: {
      included: ['RDP connectivity', 'Password reset', 'Basic troubleshooting'],
      notIncluded: ['Custom software installation', 'Advanced server configuration', 'OS customization (May be available for an extra fee, escalated to owner)']
    }
  },

  escalationTriggers: [
    'Payment verification (customer sent receipt)',
    'Discount requests (customer insisting on price reduction)',
    'Refund requests (never promise refund, escalate immediately)',
    'Trial requests (customer demanding test RDP)',
    'Bulk machine discounts',
    'Custom software / OS customization requests',
    'Unusual technical or hardware failure issues',
    'Policy exceptions & compensation claims'
  ],

  goldenRules: [
    '1. Quote PKR primarily (fixed monthly prices).',
    '2. Use exact prices from the price matrix.',
    '3. All 9 regions are available.',
    '4. Never invent pricing, specs, or features.',
    '5. Never promise 100% uptime.',
    '6. Never confirm payment without owner verification.',
    '7. Never promise refunds.',
    '8. Never promise discounts.',
    '9. Always remind customers about backups for region/IP changes.',
    '10. One customer = One machine = One dedicated IP.',
    '11. When unsure → ESCALATE TO OWNER.'
  ],

  cannedReplies: {
    sharedVsDedicated: `Shared RDP mein resources aur IP dusre logon k saath share hotay hain. PakCloudRDP par aapko *100% Dedicated Machine + Dedicated Private IP* milti hai jahan full speed aur full privacy aapki hoti hai. 🚀`,
    discount: `Hamari prices fixed monthly rates par set hain jo best quality provide karti hain. Agar aapka koi specific bulk order hai toh hum ye request Owner ko escalate kar dete hain. 💼`,
    trial: `Currently free trials available nahi hain. Lekin payment confirmation k baad working hours mein delivery as fast as *30 minutes* mein ho jati hai. ⏱️`,
    streamingBanking: `PakCloudRDP par aapko apna dedicated machine milta hai jahan aap normal work, browsing, streaming (Netflix etc.) aur legal tools asani se use kar sakte hain. Illegal/hacking activities strictly prohibited hain. ✅`,
    cheapestPlan: `Sabse sasta option *Little EU* hai:
💰 *₨1,500/month*
⚡ 1 vCPU · 3 GB RAM · 30 GB NVMe (Dedicated IP)

Agar aapko better performance chahiye toh hamara most popular budget plan:
🚀 *Starter EU* — *₨2,800/month* (4 vCPU · 8 GB RAM · 75 GB NVMe)`,
    paymentAccounts: `Aap in accounts par payment transfer kar sakte hain:

📱 *JazzCash / Raast / NayaPay*: 03014149031
Account Title: *Muhammad Jawad Iqbal Khan*

🏦 *UBL Bank*:
A/C: *300841314*
IBAN: *PK77UNIL0109000300841314*
Title: *Muhammad Jawad Iqbal Khan*

⚠️ Payment k baad screenshot/receipt yahan zaroor share karein taake verification k baad RDP prepare ho sakay!`,
    longTermDiscount: `PakCloudRDP par standard pricing monthly basis par already lowest direct rates par fixed hai. Agar aap *3 Months, 6 Months ya 1 Year* ki advance payment ya multiple machines lena chahte hain, to hum aapka case Owner / Management ko escalate kar dete hain for special custom long-term package approval! Kindly batayein aapko kaunsa plan aur kitne months ke liye chahiye? 🤝`,
    deliveryEta: `Working hours (9 AM – 12 AM PKT) mein payment owner verify hotay hi RDP *30 minutes* mein deliver ho jata hai! 🚀`
  }
};
