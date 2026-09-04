/**
 * Meta connectivity self-check.
 *
 *   node scripts/check-meta.js
 *
 * Answers the one question the logs cannot: is this server actually able to
 * send a reply right now? Every failure mode below has the same symptom in
 * production - the customer gets nothing - so they are separated here.
 *
 * Read-only: it never sends a message to anyone.
 */
import { META_CONFIG } from '../server/config/metaConfig.js';
import { MetaMessagingService } from '../server/services/metaMessagingService.js';

const v = META_CONFIG.apiVersion;
const ok = (m) => console.log('  PASS  ' + m);
const bad = (m) => console.log('  FAIL  ' + m);
const warn = (m) => console.log('  WARN  ' + m);

let failures = 0;
const fail = (m) => { failures++; bad(m); };

console.log('\nMeta configuration check (Graph ' + v + ')\n');

// --- 1. Environment --------------------------------------------------------
console.log('1. Environment variables');
const pageId = META_CONFIG.messenger.pageId;
const pageToken = META_CONFIG.messenger.pageAccessToken;

if (!pageId) fail('FACEBOOK_PAGE_ID is not set - every Messenger reply is dropped before it is sent.');
else ok('FACEBOOK_PAGE_ID = ' + pageId);

if (!pageToken) fail('FACEBOOK_PAGE_ACCESS_TOKEN (or META_ACCESS_TOKEN) is not set - no reply can be sent.');
else ok('page access token present (' + pageToken.length + ' chars)');

if (!META_CONFIG.appSecret) {
  fail('META_APP_SECRET is not set - every inbound webhook is now rejected, so nothing is ever processed.');
} else {
  ok('META_APP_SECRET present (' + META_CONFIG.appSecret.length + ' chars)');
}

if (!META_CONFIG.geminiApiKey) warn('GEMINI_API_KEY not set - unmatched messages get the static welcome text.');

if (failures > 0) {
  console.log('\nStop here and fix the environment. Nothing below can pass without it.\n');
  process.exit(1);
}

// --- 2. Is the token real, and is it the right kind? -----------------------
console.log('\n2. Token validity');
const resolved = await MetaMessagingService._getPageToken();
if (!resolved) {
  fail('could not resolve a page token at all.');
  process.exit(1);
}

const meRes = await fetch('https://graph.facebook.com/' + v + '/me?fields=id,name&access_token=' + encodeURIComponent(resolved));
const me = await meRes.json();

if (me.error) {
  fail('token rejected by Meta: [' + me.error.code + '] ' + me.error.message);
  if (me.error.code === 190) {
    console.log('        Code 190 means the token expired or was revoked. Mint a new page');
    console.log('        token in the App Dashboard and update FACEBOOK_PAGE_ACCESS_TOKEN.');
  }
  process.exit(1);
}

ok('token resolves to: ' + me.name + ' (' + me.id + ')');

if (String(me.id) !== String(pageId)) {
  fail('token belongs to ' + me.id + ' but FACEBOOK_PAGE_ID is ' + pageId + '.');
  console.log('        A USER token will pass the check above and still fail to send: replies');
  console.log('        must go out as the Page. Generate a PAGE token for ' + pageId + '.');
  process.exit(1);
}
ok('token is page-scoped and matches FACEBOOK_PAGE_ID');

// --- 3. Can it actually reach the messaging surface? -----------------------
console.log('\n3. Messaging access');
const convRes = await fetch(
  'https://graph.facebook.com/' + v + '/' + pageId + '/conversations?platform=messenger&fields=updated_time&limit=1&access_token=' + encodeURIComponent(resolved)
);
const conv = await convRes.json();
if (conv.error) {
  fail('cannot read Messenger conversations: [' + conv.error.code + '] ' + conv.error.message);
  console.log('        Usually a missing pages_messaging permission on the token.');
} else {
  ok('Messenger conversations readable (' + (conv.data ? conv.data.length : 0) + ' returned)');
}

// --- 4. Is this app the one subscribed to the page? ------------------------
console.log('\n4. Page subscription');
const subRes = await fetch(
  'https://graph.facebook.com/' + v + '/' + pageId + '/subscribed_apps?access_token=' + encodeURIComponent(resolved)
);
const sub = await subRes.json();
if (sub.error) {
  warn('could not read subscribed apps: ' + sub.error.message);
} else if (!sub.data || sub.data.length === 0) {
  fail('NO app is subscribed to this page - Meta will never deliver a webhook.');
} else {
  for (const a of sub.data) {
    const fields = (a.subscribed_fields || []).join(', ');
    const hasMessages = (a.subscribed_fields || []).includes('messages');
    (hasMessages ? ok : bad)(a.name + ': [' + fields + ']');
    if (!hasMessages) failures++;
  }
  if (sub.data.length > 1) {
    warn(sub.data.length + ' apps are subscribed. Each one replies, so customers get ' + sub.data.length + ' replies per message.');
  }
}

console.log('\n' + (failures === 0
  ? 'All checks passed. If replies still are not arriving, the fault is after the send:\n  grep the logs for "REPLY NOT DELIVERED".'
  : failures + ' check(s) failed - fix those first.') + '\n');

process.exit(failures === 0 ? 0 : 1);
