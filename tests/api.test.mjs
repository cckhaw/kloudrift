import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import handler from '../api/bottles.js';
import { store } from '../api/_lib/store.js';
import { moderate, sanitize } from '../api/_lib/moderation.js';

// These tests exercise the in-memory store; make sure no real database is configured.
assert.equal(store.kind, 'memory', 'run tests without DATABASE_URL / KV_* set');

async function call(method, url, body, ip = '1.1.1.1') {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  Object.assign(req, { method, url, headers: { 'x-forwarded-for': ip } });
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } };
  await handler(req, res);
  return res;
}
const A = 'client-aaaaaaaa';
const B = 'client-bbbbbbbb';

test('moderation', () => {
  assert.equal(moderate(sanitize('You are doing great today')), null);
  assert.equal(moderate('visit www.spam.com now'), 'links');
  assert.equal(moderate('mail me bob@example.com'), 'contact');
  assert.equal(moderate('call 555 123 4567 please'), 'contact');
  assert.equal(moderate('you are an idiot'), 'unkind');
  assert.equal(moderate('i want to die'), 'heavy');
  assert.equal(moderate('aaaaaaaaaaaa'), 'spam');
  assert.equal(moderate('hi'), 'too_short');
  assert.equal(sanitize('x'.repeat(500)).length, 140);
});

test('release, catch, exclude, report', async () => {
  store._reset();
  let r = await call('POST', '/api/bottles', { client: A, text: 'Be gentle with yourself today.' });
  assert.equal(r.statusCode, 201);
  const id = r.body.bottle.id;
  assert.ok(!('by' in r.body.bottle), 'author hash never leaves the server');

  r = await call('POST', '/api/bottles', { client: A, text: 'see https://evil.com' }, '2.2.2.2');
  assert.equal(r.statusCode, 422);
  assert.equal(r.body.reason, 'links');
  r = await call('POST', '/api/bottles', { client: 'x', text: 'hello there' }, '3.3.3.3');
  assert.equal(r.statusCode, 400);

  r = await call('GET', `/api/bottles?client=${A}`);
  assert.equal(r.body.bottle, null, 'author does not catch own bottle');
  r = await call('GET', `/api/bottles?client=${B}`);
  assert.equal(r.body.bottle.id, id);
  r = await call('GET', `/api/bottles?client=${B}&exclude=${id}`);
  assert.equal(r.body.bottle, null, 'exclude list respected');

  await call('POST', '/api/bottles', { client: B, action: 'report', id });
  r = await call('GET', `/api/bottles?client=${B}`);
  assert.ok(r.body.bottle, 'still visible after 1 report');
  await call('POST', '/api/bottles', { client: B, action: 'report', id });
  r = await call('GET', `/api/bottles?client=${B}`);
  assert.equal(r.body.bottle, null, 'hidden after 2 reports');
});

test('rate limit and methods', async () => {
  store._reset();
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await call('POST', '/api/bottles', { client: A, text: `kind thought number ${i}` }, '9.9.9.9')).statusCode);
  assert.deepEqual(codes, [201, 201, 201, 201, 201, 429, 429]);
  assert.equal((await call('PUT', '/api/bottles')).statusCode, 405);
  const status = await call('GET', '/api/bottles?status=1');
  assert.deepEqual(status.body, { storage: 'memory', durable: false });
});
