// Storage adapter for wind-bottles.
//  - With KV_REST_API_URL / KV_REST_API_TOKEN (Vercel KV or Upstash Redis REST) set, data is durable and shared.
//  - Otherwise an in-memory store is used: fine for local dev, but on serverless it is per-instance and
//    resets on cold starts, so bottles will not reliably reach other players.

const KEY = 'kloudrift:bottles';
const REPORTS = 'kloudrift:reports';
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const mem = { list: [], reports: new Map(), counters: new Map() };

async function cmd(...args) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`kv ${r.status}`);
  return (await r.json()).result;
}

export const store = {
  durable: Boolean(url && token),

  async push(bottle) {
    if (!this.durable) {
      mem.list.unshift(bottle);
      mem.list.length = Math.min(mem.list.length, 500);
      return;
    }
    await cmd('LPUSH', KEY, JSON.stringify(bottle));
    await cmd('LTRIM', KEY, 0, 499);
  },

  async recent(n = 100) {
    if (!this.durable) return mem.list.slice(0, n);
    const rows = await cmd('LRANGE', KEY, 0, n - 1);
    return (rows || []).map((r) => JSON.parse(r));
  },

  async report(id) {
    if (!this.durable) {
      mem.reports.set(id, (mem.reports.get(id) || 0) + 1);
      return;
    }
    await cmd('HINCRBY', REPORTS, id, 1);
  },

  async reportCounts(ids) {
    if (!ids.length) return {};
    if (!this.durable) return Object.fromEntries(ids.map((id) => [id, mem.reports.get(id) || 0]));
    const vals = await cmd('HMGET', REPORTS, ...ids);
    return Object.fromEntries(ids.map((id, i) => [id, Number(vals?.[i] || 0)]));
  },

  /** Fixed-window counter; returns the count including this hit. */
  async hit(key, windowSec) {
    if (!this.durable) {
      const now = Date.now();
      const cur = mem.counters.get(key);
      if (!cur || cur.until < now) {
        mem.counters.set(key, { n: 1, until: now + windowSec * 1000 });
        return 1;
      }
      return ++cur.n;
    }
    const n = await cmd('INCR', key);
    if (n === 1) await cmd('EXPIRE', key, windowSec);
    return n;
  },

  _reset() {
    mem.list = [];
    mem.reports.clear();
    mem.counters.clear();
  },
};
