/**
 * Formatting and display helper utilities
 */

/**
 * Format timestamp to live relative time: Just now, 5m, 2h, Yesterday, 3d, or MMM D
 */
export function formatRelativeTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;

    // Future or invalid date protection
    if (diffMs < 0 || isNaN(diffMs)) return 'Just now';

    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      // Check if it's today vs yesterday
      if (d.getDate() === now.getDate()) {
        return `${diffHours}h`;
      }
      return 'Yesterday';
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d`;

    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Sanitize customer name to prevent bare '?', '.', or placeholder strings
 */
export function getCustomerDisplayName(chatOrEsc) {
  if (!chatOrEsc) return 'Customer';
  const name = (chatOrEsc.contactName || chatOrEsc.customerName || '').trim();

  // If name is a bare question mark, dots, or 'Customer' with punctuation
  if (!name || /^(\?|\.+|\s+)+$/.test(name) || name === 'Customer') {
    const sid = (chatOrEsc.senderId || chatOrEsc.customerId || chatOrEsc.sessionId || '').trim();
    if (sid) return sid;
    return 'Customer';
  }

  // Clean trailing punctuation artifacts like "Happy?" or "M.." if it was auto-parsed poorly
  return name;
}

/**
 * Safe avatar initial (never returns a bare '?')
 */
export function getAvatarInitial(name, fallbackId) {
  const cleanName = (name || '').replace(/^[^\w\d]+/, '').trim();
  if (cleanName.length > 0) return cleanName[0].toUpperCase();

  const cleanFallback = (fallbackId || '').replace(/^[^\w\d]+/, '').trim();
  if (cleanFallback.length > 0) return cleanFallback[0].toUpperCase();

  return '#';
}
