// Wind-bottle client. Talks to the /api/bottles serverless function (see api/bottles.js).
// If the API is unreachable (offline, local preview without it) the game keeps working:
// releases stay on this device and catches fall back to a pool of hand-written kind notes.

export const MAX_BOTTLE_LENGTH = 140;

const CLIENT_KEY = 'kloudrift:client';
let memoryId = null;

/** Random anonymous id, stored only on this device. It lets the server avoid handing you your own bottles. */
export function clientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return (memoryId ??= crypto.randomUUID());
  }
}

export class BottleRejected extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

export const REJECT_MESSAGES = {
  links: 'Please leave links out of your bottle.',
  contact: 'Please keep names, emails and phone numbers out of your bottle.',
  unkind: 'That wording isn\u2019t very kind \u2014 try something gentler.',
  spam: 'That looks a bit repetitive. Try a few real words.',
  too_short: 'Add a few more words.',
  heavy:
    'If you\u2019re carrying something heavy, please reach out to someone you trust or a local helpline. Bottles are for gentle, uplifting notes.',
  slow_down: 'Lots of bottles for now \u2014 try again a little later.',
};

const SEEDS = [
  'You are doing better than you think.',
  'Breathe in slowly. The sky is wide and so are you.',
  'Someone is glad you exist today.',
  'Rest is productive too.',
  'Small steps still cover the whole distance.',
  'May your next hour be gentle.',
  'The storm passes. It always does.',
  'You do not have to earn your calm.',
  'Be as kind to yourself as you are to others.',
  'Today I noticed the light on the wall and it felt like a hug.',
  'Drink some water. Unclench your shoulders. Good.',
  'Whatever you are carrying, you can set it down for a minute.',
  'The clouds do not hurry, and they still arrive.',
  'Your best today is enough.',
  'Wishing you a warm drink and a quiet evening.',
  'Not every day needs to be a victory. Some are just for floating.',
  'I hope something small and lovely happens to you today.',
  'You made it this far. That counts for a lot.',
];

const uid = () => Math.random().toString(36).slice(2, 10);

export function sanitize(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_BOTTLE_LENGTH);
}

async function api(method, path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!(r.headers.get('content-type') || '').includes('json')) throw new Error('no_api'); // e.g. SPA fallback html
    return { status: r.status, data: await r.json() };
  } finally {
    clearTimeout(timer);
  }
}

export const bottleService = {
  /** Resolves { bottle, shared }. Throws BottleRejected when the server declines the text. */
  async release(text) {
    const clean = sanitize(text);
    if (!clean) throw new BottleRejected('too_short');
    try {
      const { status, data } = await api('POST', '/api/bottles', { client: clientId(), text: clean });
      if (status === 201) return { bottle: data.bottle, shared: true };
      if (status === 422) throw new BottleRejected(data.reason);
      if (status === 429) throw new BottleRejected('slow_down');
    } catch (err) {
      if (err instanceof BottleRejected) throw err;
    }
    return { bottle: { id: uid(), text: clean, ts: Date.now() }, shared: false };
  },

  /** A bottle from another wanderer when available, otherwise a note from the sky. */
  async catchOne(alreadyCaught = []) {
    try {
      const exclude = alreadyCaught.slice(0, 50).map((b) => b.id).join(',');
      const { status, data } = await api('GET', `/api/bottles?client=${encodeURIComponent(clientId())}&exclude=${encodeURIComponent(exclude)}`);
      if (status === 200 && data.bottle) return { ...data.bottle, source: 'wanderer' };
    } catch {
      /* fall through to local notes */
    }
    const seen = new Set(alreadyCaught.map((b) => b.text));
    const fresh = SEEDS.filter((s) => !seen.has(s));
    const pool = fresh.length ? fresh : SEEDS;
    return { id: uid(), text: pool[Math.floor(Math.random() * pool.length)], ts: Date.now(), source: 'sky' };
  },

  async report(id) {
    try {
      await api('POST', '/api/bottles', { client: clientId(), action: 'report', id });
    } catch {
      /* best effort */
    }
  },
};
