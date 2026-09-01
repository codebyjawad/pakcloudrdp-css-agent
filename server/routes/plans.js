/**
 * Plans & Price Matrix API Route
 */
import express from 'express';
import { KNOWLEDGE_BASE } from '../config/knowledgeBase.js';

const router = express.Router();

// Get full knowledge base overview
router.get('/', (req, res) => {
  res.json({
    brand: KNOWLEDGE_BASE.brand,
    whatWeSell: KNOWLEDGE_BASE.whatWeSell,
    plans: KNOWLEDGE_BASE.plans,
    regions: KNOWLEDGE_BASE.regions,
    priceMatrix: KNOWLEDGE_BASE.priceMatrix,
    network: KNOWLEDGE_BASE.network,
    delivery: KNOWLEDGE_BASE.delivery,
    payment: KNOWLEDGE_BASE.payment,
    policies: KNOWLEDGE_BASE.policies,
    support: KNOWLEDGE_BASE.support,
    goldenRules: KNOWLEDGE_BASE.goldenRules
  });
});

// Calculate quote for specific plan + region
router.get('/calculate', (req, res) => {
  const { plan, region } = req.query;
  if (!plan || !region) {
    return res.status(400).json({ error: 'Please provide both plan and region parameters.' });
  }

  const pId = plan.toLowerCase();
  const rId = region.toLowerCase();

  const planObj = KNOWLEDGE_BASE.plans.find(p => p.id === pId);
  const regionObj = KNOWLEDGE_BASE.regions.find(r => r.id === rId);

  if (!planObj || !regionObj) {
    return res.status(404).json({ error: 'Invalid plan or region.' });
  }

  const price = KNOWLEDGE_BASE.priceMatrix[pId]?.[rId];

  // WhatsApp-ready formatted snippet
  const formattedWhatsAppQuote = `🚀 *PAKCLOUDRDP QUOTATION*
━━━━━━━━━━━━━━━━━━
💻 *Plan*: ${planObj.name}
⚙️ *Specs*: ${planObj.vcpu} · ${planObj.ram} RAM
💾 *Storage*: ${planObj.nvme} NVMe (or ${planObj.ssdAlt} SSD Alt)
🌍 *Region*: ${regionObj.name} ${regionObj.flag}
🌐 *IP*: 100% Dedicated Private IP
⚡ *Speed*: 1 Gbps Uplink · Unmetered Bandwidth

💰 *Price: ₨${price.toLocaleString()}/month (Fixed PKR)*
━━━━━━━━━━━━━━━━━━
⏱️ *Delivery*: ~30 mins after payment verification
📱 *Order*: Reply to proceed with payment!`;

  res.json({
    plan: planObj,
    region: regionObj,
    pricePKR: price,
    formattedWhatsAppQuote
  });
});

export default router;
