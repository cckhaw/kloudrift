// Runs the same behavioural contract against every store backend that can run offline:
// the in-memory store, and the Postgres store's real SQL against an in-process Postgres (PGlite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { store as selected, createPgStore } from '../api/_lib/store.js';

assert.equal(selected.kind, 'memory', 'run tests without DATABASE_URL / KV_* set');

const backends = {
  memory: () => selected,
  postgres: () => {
    const db = new PGlite();
    return createPgStore(async (text, params = []) => (await db.query(text, params)).rows);
  },
};

for (const [name, make] of Object.entries(backends)) {
  test(`${name}: bottles come back newest first with the right fields`, async () => {
    const s = make();
    selected._reset?.();
    await s.push({ id: 'aaaa1111', text: 'first', ts: 1000, by: 'h1' });
    await s.push({ id: 'bbbb2222', text: 'second', ts: 2000, by: 'h2' });
    const rows = await s.recent(10);
    assert.deepEqual(rows.map((r) => r.id), ['bbbb2222', 'aaaa1111']);
    assert.deepEqual(rows[0], { id: 'bbbb2222', text: 'second', ts: 2000, by: 'h2' });
    assert.equal((await s.recent(1)).length, 1, 'limit respected');
  });

  test(`${name}: report counts accumulate per bottle`, async () => {
    const s = make();
    await s.report('aaaa1111');
    await s.report('aaaa1111');
    await s.report('cccc3333');
    assert.deepEqual(await s.reportCounts(['aaaa1111', 'cccc3333', 'zzzz9999']), { aaaa1111: 2, cccc3333: 1, zzzz9999: 0 });
    assert.deepEqual(await s.reportCounts([]), {});
  });

  test(`${name}: counters count up within the window and reset after it`, async () => {
    const s = make();
    assert.deepEqual([await s.hit('k1', 3600), await s.hit('k1', 3600), await s.hit('k1', 3600)], [1, 2, 3]);
    assert.equal(await s.hit('k2', 3600), 1, 'keys are independent');
    // a window in the past is already expired, so every hit starts over
    assert.deepEqual([await s.hit('k3', -1), await s.hit('k3', -1)], [1, 1]);
  });
}

test('postgres: schema setup is idempotent and the store trims to 500 bottles', async () => {
  const db = new PGlite();
  const s = createPgStore(async (text, params = []) => (await db.query(text, params)).rows);
  for (let i = 0; i < 505; i++) await s.push({ id: `id${String(i).padStart(6, '0')}`, text: `n${i}`, ts: i, by: 'h' });
  const all = await s.recent(1000);
  assert.equal(all.length, 500);
  assert.equal(all[0].ts, 504);
  assert.equal(all.at(-1).ts, 5, 'oldest five were trimmed');
  const again = createPgStore(async (text, params = []) => (await db.query(text, params)).rows);
  assert.equal((await again.recent(5)).length, 5, 'a second instance reuses existing tables');
});
