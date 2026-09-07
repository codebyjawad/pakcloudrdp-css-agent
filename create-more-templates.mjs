import dotenv from 'dotenv';
dotenv.config();
const apiVersion = process.env.META_API_VERSION || 'v20.0';
const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const token = process.env.META_USER_ACCESS_TOKEN;
const graph = `https://graph.facebook.com/${apiVersion}`;

async function api(path, init = {}) {
  const res = await fetch(graph + path, {
    ...init,
    headers: { 'Authorization': `Bearer ${token}`, ...(init.headers || {}) }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`http ${res.status}: ${data.error?.message || JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const templates = [
  {
    name: 'pakcloudrdp_payment_confirmed',
    category: 'UTILITY',
    body:
      'PakCloudRDP — Payment Confirmed\n\n' +
      'Aslam-o-alaikum {{1}},\n' +
      'Aapki payment verify ho chuki hai — order confirm!\n\n' +
      'Plan: {{2}}\n' +
      'Amount: ₨{{3}}/month\n\n' +
      'Delivery within 30 minutes (working hours). RDP details isi chat mein bhej dein gay.\n' +
      'Shukriya!',
    example: ['Ali', 'Starter', '2,800'],
  },
  {
    name: 'pakcloudrdp_support_received',
    category: 'UTILITY',
    body:
      'PakCloudRDP — Support\n\n' +
      'Aslam-o-alaikum {{1}},\n' +
      'Aapka message mil gaya hai. Owner jal hi yahan reply karega (support hours: 9 AM to 12 AM).\n\n' +
      'Agar aapka issue urgent hai to "URGENT" likh kar bhejein.\n' +
      'Thanks for your patience!',
    example: ['Ali'],
  },
  {
    name: 'pakcloudrdp_credential_update',
    category: 'UTILITY',
    body:
      'PakCloudRDP — RDP Credentials Updated\n\n' +
      'Aslam-o-alaikum {{1}},\n' +
      'Aapke RDP ke naye details:\n\n' +
      'IP: {{2}}\n' +
      'Username: {{3}}\n' +
      'Password: {{4}}\n\n' +
      'Connect via Remote Desktop (mstsc) using these details.\n' +
      'Keep them secure and do not share.',
    example: ['Ali', '203.0.113.7', 'rdpuser', 'YourPassword123!'],
  },
  {
    name: 'pakcloudrdp_maintenance',
    category: 'UTILITY',
    body:
      'PakCloudRDP — Scheduled Maintenance\n\n' +
      'Your RDP will be temporarily unavailable during planned maintenance:\n\n' +
      'Window: {{1}}\n' +
      'Duration: approx {{2}}\n\n' +
      'During this time RDP may not connect. Service resumes automatically after maintenance.\n' +
      'Apologies for the inconvenience.',
    example: ['2026-09-06 02:00 - 03:00', '1 hour'],
  },
  {
    name: 'pakcloudrdp_suspended',
    category: 'UTILITY',
    body:
      'PakCloudRDP — Renewal Due\n\n' +
      'Aslam-o-alaikum {{1}},\n' +
      'Aapka RDP subscription renew nahi hui, is liye service temporarily suspended hai.\n\n' +
      'Monthly charge: ₨{{2}}\n\n' +
      'Pay karein (JazzCash / Raast / NayaPay): 03014149031\n' +
      'UBL A/C 300841314 · IBAN PK77UNIL0109000300841314\n\n' +
      'Payment screenshot bhejein — RDP foran active kar dein gay.',
    example: ['Ali', '2,800'],
  },
  {
    name: 'pakcloudrdp_upsell',
    category: 'MARKETING',
    body:
      'PakCloudRDP — Upgrade Available\n\n' +
      'Aslam-o-alaikum {{1}},\n' +
      'Kya aap apne RDP mein performance upgrade chahte hain?\n' +
      'More RAM, faster CPU, ya kisi aur region mein nayi machine — sab available hai!\n\n' +
      'Reply STOP to opt out.',
    example: ['Ali'],
    buttons: ['More RAM', 'Change Region', 'Speed Boost'],
  },
  {
    name: 'pakcloudrdp_referral',
    category: 'MARKETING',
    body:
      'PakCloudRDP — Refer a Friend\n\n' +
      'Aslam-o-alaikum {{1}},\n' +
      'Apne dost ko PakCloudRDP recommend karein aur premium discount paeien!\n' +
      'Jab dost order karega to aap dono ko discount milega.\n\n' +
      'Dost ko hamara number WhatsApp Business par bhej dein yahan.\n' +
      'Reply STOP to opt out.',
    example: ['Ali'],
  },
];

for (const t of templates) {
  const components = [{ type: 'BODY', text: t.body, example: { body_text: [t.example] } }];
  if (t.buttons) {
    components.push({ type: 'BUTTONS', buttons: t.buttons.map((b) => ({ type: 'QUICK_REPLY', text: b })) });
  }
  try {
    const created = await api(`/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: t.name, language: 'en', category: t.category, components }),
    });
    console.log(`CREATED ${t.name} (${t.category}) ->`, JSON.stringify(created));
  } catch (err) {
    console.log(`ERROR ${t.name}:`, err.message);
  }
}