/**
 * Order Management API Route
 */
import express from 'express';
import { orderManager } from '../agents/orderManager.js';

const router = express.Router();

// Get all orders
router.get('/', (req, res) => {
  res.json({ orders: orderManager.getAll() });
});

// Get order by ID
router.get('/:id', (req, res) => {
  const order = orderManager.getById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order });
});

// Create new order record
router.post('/', (req, res) => {
  try {
    const newOrder = orderManager.createOrder(req.body);
    const whatsappFormatted = orderManager.generateQuickRecord(newOrder);
    res.status(201).json({
      success: true,
      order: newOrder,
      whatsappFormatted
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update order status
router.patch('/:id', (req, res) => {
  const updated = orderManager.update(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Order not found' });
  res.json({ success: true, order: updated });
});

// Generate and format ready-to-send RDP delivery text
router.post('/:id/delivery', (req, res) => {
  const order = orderManager.getById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const { ip, username, password } = req.body;

  let deliveryMessage;
  try {
    // Requires an explicit IP (orders.rdpIp or body.ip) and an explicit password.
    deliveryMessage = orderManager.generateDeliveryMessage(order, { ip, username, password });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (ip) {
    orderManager.update(req.params.id, { rdpIp: ip, rdpDelivered: 'Yes', orderStatus: 'Delivered' });
  }

  res.json({ success: true, deliveryMessage, order: orderManager.getById(req.params.id) });
});

// Delete order
router.delete('/:id', (req, res) => {
  const deleted = orderManager.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Order not found' });
  res.json({ success: true, message: 'Order removed' });
});

export default router;
