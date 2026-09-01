/**
 * Order Manager for PakCloudRDP - SQLite backed.
 * Follows Section 22: Quick Order Record from Cheat Sheet.
 */
import { KNOWLEDGE_BASE } from '../config/knowledgeBase.js';
import { db } from '../services/db.js';

const INSERT = db.prepare(`
  INSERT INTO orders (
    id, customer, phone, channel, plan, planId, region, regionId,
    price, currency, paymentMethod, proof, ownerVerification, orderStatus,
    rdpDelivered, rdpIp, activation, renewal, notes, createdAt
  ) VALUES (
    @id, @customer, @phone, @channel, @plan, @planId, @region, @regionId,
    @price, @currency, @paymentMethod, @proof, @ownerVerification, @orderStatus,
    @rdpDelivered, @rdpIp, @activation, @renewal, @notes, @createdAt
  )
`);

const UPDATE = db.prepare(`
  UPDATE orders SET
    customer=@customer, phone=@phone, channel=@channel, plan=@plan, planId=@planId,
    region=@region, regionId=@regionId, price=@price, currency=@currency,
    paymentMethod=@paymentMethod, proof=@proof, ownerVerification=@ownerVerification,
    orderStatus=@orderStatus, rdpDelivered=@rdpDelivered, rdpIp=@rdpIp,
    activation=@activation, renewal=@renewal, notes=@notes
  WHERE id=@id
`);

class OrderManager {
  constructor() {
    this._seq = this._nextSeq();
  }

  _nextSeq() {
    const rows = db.prepare('SELECT id FROM orders ORDER BY id DESC LIMIT 1').all();
    const last = rows[0]?.id || '';
    const m = last.match(/^ORD-(\d+)$/);
    return m ? parseInt(m[1], 10) : 100;
  }

  createOrder(data = {}) {
    const planId = (data.planId || data.plan || '').toString().toLowerCase();
    const regionId = (data.regionId || data.region || '').toString().toLowerCase();

    const planObj = planId
      ? KNOWLEDGE_BASE.plans.find(p => p.id === planId)
      : null;
    const regionObj = regionId
      ? KNOWLEDGE_BASE.regions.find(r => r.id === regionId)
      : null;

    if (!planObj) {
      throw new Error(`Invalid plan: "${planId}". Valid plans: ${KNOWLEDGE_BASE.plans.map(p => p.id).join(', ')}`);
    }
    if (!regionObj) {
      throw new Error(`Invalid region: "${regionId}". Valid regions: ${KNOWLEDGE_BASE.regions.map(r => r.id).join(', ')}`);
    }

    const price = KNOWLEDGE_BASE.priceMatrix[planObj.id]?.[regionObj.id];
    if (typeof price !== 'number') {
      throw new Error(`No price defined for plan "${planObj.id}" in region "${regionObj.id}".`);
    }

    const today = new Date();
    const renewalDate = new Date();
    renewalDate.setDate(today.getDate() + 30);

    const newOrder = {
      id: 'ORD-' + (++this._seq),
      customer: (data.customer || 'Customer').toString(),
      phone: (data.phone || '').toString(),
      channel: (data.channel || 'WhatsApp').toString(),
      plan: planObj.name,
      planId: planObj.id,
      region: regionObj.name,
      regionId: regionObj.id,
      price: price,
      currency: 'PKR',
      paymentMethod: (data.paymentMethod || 'Pending Selection').toString(),
      proof: (data.proof || 'Pending').toString(),
      ownerVerification: (data.ownerVerification || 'Pending').toString(),
      orderStatus: (data.orderStatus || 'Payment Pending').toString(),
      rdpDelivered: 'No',
      rdpIp: '',
      activation: today.toISOString().split('T')[0],
      renewal: renewalDate.toISOString().split('T')[0],
      notes: (data.notes || 'Order logged via CSS Agent').toString(),
      createdAt: new Date().toISOString()
    };

    INSERT.run(newOrder);
    return newOrder;
  }

  getAll() {
    return db.prepare('SELECT * FROM orders ORDER BY createdAt DESC').all();
  }

  getById(id) {
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(id) || null;
  }

  update(id, updates = {}) {
    const order = this.getById(id);
    if (!order) return null;

    const { id: _id, createdAt: _c, ...rest } = updates;
    const merged = { ...order, ...rest, id };
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    INSERT.run(merged);
    return this.getById(id);
  }

  delete(id) {
    const result = db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    return result.changes > 0;
  }

  generateQuickRecord(order) {
    return `📋 *PAKCLOUDRDP — QUICK ORDER RECORD*
━━━━━━━━━━━━━━━━━━
👤 Customer: ${order.customer}
💻 Plan: ${order.plan}
🌍 Region: ${order.region}
💰 Price: ₨${order.price.toLocaleString()}/month
💳 Payment Method: ${order.paymentMethod}
🧾 Proof: ${order.proof}
🔐 Owner Verification: ${order.ownerVerification}
📦 Order Status: ${order.orderStatus}
🖥️ RDP Delivered: ${order.rdpDelivered} ${order.rdpIp ? `(${order.rdpIp})` : ''}
📅 Activation: ${order.activation}
🔄 Renewal: ${order.renewal}
━━━━━━━━━━━━━━━━━━`;
  }

  /**
   * Delivery message. Requires an explicit IP and password - never falls back to
   * hardcoded/insecure default credentials. Throws if critical fields are missing.
   */
  generateDeliveryMessage(order, { ip, username = 'Administrator', password } = {}) {
    const finalIp = ip || order.rdpIp;
    if (!finalIp) {
      throw new Error('Cannot generate delivery message: no RDP IP is set on the order and no IP was provided.');
    }
    if (!password) {
      throw new Error('Cannot generate delivery message: no password provided. Please pass the customer password explicitly.');
    }
    const first = String(order.customer || 'Valued Customer').split(' ')[0] || 'Valued Customer';
    return `🚀 *PAKCLOUDRDP — YOUR DEDICATED RDP IS READY!*
━━━━━━━━━━━━━━━━━━
Dear *${first}*, your 100% dedicated Windows machine has been successfully prepared!

🖥️ *Dedicated IP*: ${finalIp}
👤 *Username*: ${username}
🔑 *Password*: ${password}

⚙️ *Plan Specs*: ${order.plan} (${order.region})
🌐 *Network*: 1 Gbps Uplink · Unmetered Bandwidth
📅 *Renewal Date*: ${order.renewal}

━━━━━━━━━━━━━━━━━━
📌 *How to Connect*:
1. Open *Remote Desktop Connection* (\`mstsc.exe\`) on your Windows PC.
2. Enter the Dedicated IP above and click *Connect*.
3. Enter your Username & Password.

⚠️ *Reminder*: Please keep your credentials secure. For any support or renewal, reply directly to this chat! 🚀`;
  }
}

export const orderManager = new OrderManager();
