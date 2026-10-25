// Wind-bottle service.
//
// Prototype: runs entirely on-device with a pool of hand-written kind notes.
// Every method is async so a real backend (POST /bottles, GET /bottles/random)
// can replace this module without touching callers. A real backend must add
// server-side moderation and rate limiting before showing strangers' text.

export const MAX_BOTTLE_LENGTH = 140;

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

export const bottleService = {
  async release(text) {
    const clean = sanitize(text);
    if (!clean) throw new Error('empty');
    return { id: uid(), text: clean, ts: Date.now() };
  },

  /** Returns a random note the player has not caught yet (recycles once all are caught). */
  async catchOne(alreadyCaught = []) {
    const seen = new Set(alreadyCaught.map((b) => b.text));
    const fresh = SEEDS.filter((s) => !seen.has(s));
    const pool = fresh.length ? fresh : SEEDS;
    const text = pool[Math.floor(Math.random() * pool.length)];
    return { id: uid(), text, ts: Date.now() };
  },
};
