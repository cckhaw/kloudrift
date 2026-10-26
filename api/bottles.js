// Wind-bottle API (Vercel serverless function; also served by the Vite dev server).
//   GET  /api/bottles?client=<id>&exclude=<id,id>   → { bottle | null }  a random bottle from another wanderer
//   POST /api/bottles  { client, text }              → 201 { bottle }     release a bottle
//   POST /api/bottles  { client, action:'report', id } → { ok }           flag a bottle (hidden after 2 reports)
// Plain Node req/res only, so it runs unchanged on Vercel and in dev.

import { createHash, randomUUID } from 'node:crypto';
import { moderate, sanitize } from './_lib/moderation.js';
import { store } from './_lib/store.js';

const HIDE_AFTER_REPORTS = 2;
const RELEASES_PER_HOUR = 5;
const REPORTS_PER_HOUR = 20;
const READS_PER_HOUR = 120;
const MAX_BODY = 2048;

const hash = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new Error('too_large');
  }
  return raw ? JSON.parse(raw) : {};
}

const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
const validClient = (c) => typeof c === 'string' && /^[\w-]{8,64}$/.test(c);

export default async function handler(req, res) {
  try {
    const ip = hash(ipOf(req));

    if (req.method === 'GET') {
      if ((await store.hit(`rl:get:${ip}`, 3600)) > READS_PER_HOUR) return send(res, 429, { error: 'slow_down' });
      const q = new URL(req.url, 'http://localhost').searchParams;
      const client = q.get('client');
      if (!validClient(client)) return send(res, 400, { error: 'bad_client' });
      const exclude = new Set((q.get('exclude') || '').split(',').filter(Boolean).slice(0, 200));
      const me = hash(client);
      const rows = (await store.recent(100)).filter((b) => b.by !== me && !exclude.has(b.id));
      const counts = await store.reportCounts(rows.map((b) => b.id));
      const pool = rows.filter((b) => (counts[b.id] || 0) < HIDE_AFTER_REPORTS);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      return send(res, 200, { bottle: pick ? { id: pick.id, text: pick.text, ts: pick.ts } : null });
    }

    if (req.method === 'POST') {
      let body;
      try {
        body = await readBody(req);
      } catch {
        return send(res, 400, { error: 'bad_body' });
      }
      if (!validClient(body.client)) return send(res, 400, { error: 'bad_client' });

      if (body.action === 'report') {
        if ((await store.hit(`rl:report:${ip}`, 3600)) > REPORTS_PER_HOUR) return send(res, 429, { error: 'slow_down' });
        if (typeof body.id !== 'string' || !/^[\w-]{4,40}$/.test(body.id)) return send(res, 400, { error: 'bad_id' });
        await store.report(body.id);
        return send(res, 200, { ok: true });
      }

      if ((await store.hit(`rl:post:${ip}`, 3600)) > RELEASES_PER_HOUR) return send(res, 429, { error: 'slow_down' });
      const text = sanitize(body.text);
      const reason = moderate(text);
      if (reason) return send(res, 422, { error: 'rejected', reason });
      const bottle = { id: randomUUID().slice(0, 8), text, ts: Date.now(), by: hash(body.client) };
      await store.push(bottle);
      return send(res, 201, { bottle: { id: bottle.id, text: bottle.text, ts: bottle.ts } });
    }

    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    console.error('bottles api error', err);
    return send(res, 500, { error: 'server_error' });
  }
}
