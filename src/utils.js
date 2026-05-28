/* ═══════════════════════════════════════════
   🛠️  Utility Functions
   ═══════════════════════════════════════════ */

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function timeSince(isoString) {
  const ms = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);

  const parts = [];
  if (d) parts.push(`${d} day${d > 1 ? 's' : ''}`);
  if (h % 24) parts.push(`${h % 24} hr${h % 24 > 1 ? 's' : ''}`);
  if (m % 60) parts.push(`${m % 60} min${m % 60 > 1 ? 's' : ''}`);
  if (!parts.length) parts.push('a few seconds');
  return parts.join(' ');
}

module.exports = { pick, timeSince };
