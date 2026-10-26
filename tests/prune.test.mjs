import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectDeletions } from '../scripts/prune-deployments.mjs';

const d = (uid, created, target, state = 'READY') => ({ uid, created, target, state, url: `${uid}.vercel.app` });

test('keeps only the newest READY production deployment and removes the rest', () => {
  const r = selectDeletions([
    d('prod-old', 1, 'production'),
    d('prev-1', 2, null),
    d('prod-new', 5, 'production'),
    d('prev-2', 6, null),
    d('prod-mid', 3, 'production'),
    d('prev-err', 4, null, 'ERROR'),
  ]);
  assert.equal(r.keep.uid, 'prod-new');
  assert.deepEqual(r.remove.map((x) => x.uid).sort(), ['prev-1', 'prev-2', 'prev-err', 'prod-mid', 'prod-old']);
  assert.equal(r.error, undefined);
});

test('a preview that is newer than production is still removed, never kept', () => {
  const r = selectDeletions([d('prod', 1, 'production'), d('prev-newer', 9, null)]);
  assert.equal(r.keep.uid, 'prod');
  assert.deepEqual(r.remove.map((x) => x.uid), ['prev-newer']);
});

test('refuses while a newer production build is still in flight', () => {
  const r = selectDeletions([d('prod-live', 1, 'production'), d('prod-building', 2, 'production', 'BUILDING'), d('old', 0, 'production')]);
  assert.match(r.error, /still BUILDING/);
  assert.deepEqual(r.remove, []);
});

test('never deletes in-flight deployments', () => {
  const r = selectDeletions([d('prod', 5, 'production'), d('prev-building', 6, null, 'BUILDING'), d('prev-done', 3, null)]);
  assert.deepEqual(r.skipped.map((x) => x.uid), ['prev-building']);
  assert.deepEqual(r.remove.map((x) => x.uid), ['prev-done']);
});

test('refuses to delete anything when there is no READY production deployment', () => {
  const r = selectDeletions([d('prev', 1, null), d('prod-err', 2, 'production', 'ERROR')]);
  assert.ok(r.error);
  assert.deepEqual(r.remove, []);
  assert.equal(r.keep, null);
});
