/**
 * Escalation Queue API Route
 */
import express from 'express';
import { escalationEngine } from '../agents/escalationEngine.js';
import { MetaMessagingService } from '../services/metaMessagingService.js';
import { conversationStore } from '../services/conversationStore.js';
import { appendOwnerMessageToConversation } from './chat.js';

const router = express.Router();

// Get all escalations (enriched with the customer's chat history for context)
router.get('/', (req, res) => {
  const escalations = escalationEngine.getAll().map((esc) => ({
    ...esc,
    conversation: conversationStore.get(esc.customerId || '')
  }));
  res.json({ escalations });
});

// Owner Action & Customer Inform Route
router.post('/:id/action', async (req, res) => {
  const { actionType, discountPrice, customMessage } = req.body;
  const result = escalationEngine.processOwnerAction(req.params.id, actionType, {
    discountPrice,
    customMessage
  });

  if (!result) {
    return res.status(404).json({ error: 'Escalation ticket not found' });
  }

  const { escalation, responseMessage, resolutionSummary } = result;

  // Append message to chat conversation history (tagged as owner escalation reply)
  if (escalation.customerId) {
    appendOwnerMessageToConversation(escalation.customerId, responseMessage, escalation.channel, 'owner_escalation');
  }

  // Dispatch message to customer via Meta API (WhatsApp / Messenger / Instagram)
  try {
    const dispatchResult = await MetaMessagingService.dispatch(
      escalation.channel,
      escalation.customerId,
      responseMessage
    );


    res.json({
      success: true,
      escalation,
      responseMessage,
      resolutionSummary,
      dispatchResult
    });
  } catch (err) {
    console.error('Error dispatching owner message:', err);
    res.json({
      success: true,
      escalation,
      responseMessage,
      resolutionSummary,
      dispatchWarning: 'Action logged, but message could not be sent to Meta API: ' + err.message
    });
  }
});

// Simple resolve route
router.post('/:id/resolve', (req, res) => {
  const { notes } = req.body;
  const resolved = escalationEngine.resolve(req.params.id, notes);
  if (!resolved) {
    return res.status(404).json({ error: 'Escalation not found' });
  }
  res.json({ success: true, escalation: resolved });
});

export default router;

