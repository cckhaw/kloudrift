// Storage adapter for wind-bottles. Chosen once at startup from the environment:
//   1. DATABASE_URL / POSTGRES_URL                       → Postgres (Neon, via Vercel Storage; free plan available)
//   2. KV_REST_API_URL + KV_REST_API_TOKEN               → Redis REST (Upstash / Vercel KV)
//   3. nothing                                           → in-memory (local dev only: on serverless it is
//      per-instance and resets, so bottles will not reliably reach other players)

const MAX_STORED = 500;

// ───────────────────────── memory ─────────────────────────

function createMemoryStore() {
  const mem = { list: [], reports: new Map(), counters: new Map() };
  return {
    kind: 'memory',
    durable: false,
    async push(bottle) {
      mem.list.unshift(bottle);
      mem.list.length = Math.min(mem.list.length, MAX_STORED);
    },
    async recent(n = 100) {
      return mem.list.slice(0, n);
    },
    async report(id) {
      mem.reports.set(id, (mem.reports.get(id) || 0) + 1);
    },
    async reportCounts(ids) {
      return Object.fromEntries(ids.map((id) => [id, mem.reports.get(id) || 0]));
    },
    async hit(key, windowSec) {
      const now = Date.now();
      const cur = mem.counters.get(key);
      if (!cur || cur.until < now) {
        mem.counters.set(key, { n: 1, until: now + windowSec * 1000 });
        return 1;
      }
      return ++cur.n;
    },
    _reset() {
      mem.list = [];
      mem.reports.clear();
      mem.counters.clear();
    },
  };
}

// ───────────────────────── postgres ─────────────────────────

/** `query(text, params) → rows[]`. Injected so tests can run the same SQL against an in-process Postgres. */
export function createPgStore(query) {
  let ready;
  const ensure = () =>
    (ready ??= (async () => {
      await query('CREATE TABLE IF NOT EXISTS bottles (id text PRIMARY KEY, body text NOT NULL, ts bigint NOT NULL, author text NOT NULL)');
      await query('CREATE INDEX IF NOT EXISTS bottles_ts_idx ON bottles (ts DESC)');
      await query('CREATE TABLE IF NOT EXISTS bottle_reports (id text PRIMARY KEY, n integer NOT NULL)');
      await query('CREATE TABLE IF NOT EXISTS rate_counters (key text PRIMARY KEY, n integer NOT NULL, until bigint NOT NULL)');
    })().catch((err) => {
      ready = undefined; // retry on the next request
      throw err;
    }));

  return {
    kind: 'postgres',
    durable: true,
    async push(b) {
      await ensure();
      await query('INSERT INTO bottles (id, body, ts, author) VALUES ($1, $2, $3, $4)', [b.id, b.text, b.ts, b.by]);
      await query('DELETE FROM bottles WHERE id NOT IN (SELECT id FROM bottles ORDER BY ts DESC LIMIT $1)', [MAX_STORED]);
      await query('DELETE FROM rate_counters WHERE until < $1', [Date.now()]);
    },
    async recent(n = 100) {
      await ensure();
      const rows = await query('SELECT id, body, ts, author FROM bottles ORDER BY ts DESC LIMIT $1', [n]);
      return rows.map((r) => ({ id: r.id, text: r.body, ts: Number(r.ts), by: r.author }));
    },
    async report(id) {
      await ensure();
      await query('INSERT INTO bottle_reports (id, n) VALUES ($1, 1) ON CONFLICT (id) DO UPDATE SET n = bottle_reports.n + 1', [id]);
    },
    async reportCounts(ids) {
      if (!ids.length) return {};
      await ensure();
      const rows = await query('SELECT id, n FROM bottle_reports WHERE id = ANY($1)', [ids]);
      const out = Object.fromEntries(ids.map((id) => [id, 0]));
      for (const r of rows) out[r.id] = Number(r.n);
      return out;
    },
    /** Fixed-window counter; atomic upsert. Returns the count including this hit. */
    async hit(key, windowSec) {
      await ensure();
      const now = Date.now();
      const rows = await query(
        `INSERT INTO rate_counters (key, n, until) VALUES ($1, 1, $2::bigint)
         ON CONFLICT (key) DO UPDATE SET
           n = CASE WHEN rate_counters.until < $3::bigint THEN 1 ELSE rate_counters.n + 1 END,
           until = CASE WHEN rate_counters.until < $3::bigint THEN $2::bigint ELSE rate_counters.until END
         RETURNING n`,
        [key, now + windowSec * 1000, now],
      );
      return Number(rows[0].n);
    },
  };
}

function neonQuery(connectionString) {
  let sql;
  return async (text, params = []) => {
    sql ??= (await import('@neondatabase/serverless')).neon(connectionString);
    return sql.query(text, params);
  };
}

// ───────────────────────── redis rest ─────────────────────────

const KEY = 'kloudrift:bottles';
const REPORTS = 'kloudrift:reports';

function createKvStore(url, token) {
  const cmd = async (...args) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error(`kv ${r.status}`);
    return (await r.json()).result;
  };
  return {
    kind: 'kv',
    durable: true,
    async push(b) {
      await cmd('LPUSH', KEY, JSON.stringify(b));
      await cmd('LTRIM', KEY, 0, MAX_STORED - 1);
    },
    async recent(n = 100) {
      return ((await cmd('LRANGE', KEY, 0, n - 1)) || []).map((r) => JSON.parse(r));
    },
    async report(id) {
      await cmd('HINCRBY', REPORTS, id, 1);
    },
    async reportCounts(ids) {
      if (!ids.length) return {};
      const vals = await cmd('HMGET', REPORTS, ...ids);
      return Object.fromEntries(ids.map((id, i) => [id, Number(vals?.[i] || 0)]));
    },
    async hit(key, windowSec) {
      const n = await cmd('INCR', key);
      if (n === 1) await cmd('EXPIRE', key, windowSec);
      return n;
    },
  };
}

// ───────────────────────── selection ─────────────────────────

function pick() {
  const pg = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (pg) return createPgStore(neonQuery(pg));
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return createKvStore(url, token);
  return createMemoryStore();
}

export const store = pick();
