import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_LEVELS, WORLDS, isLevelUnlocked, nextLevel, evaluateStars, bonusProgress, sparkTarget } from '../src/game/levels.js';

test('level data is complete and ids are unique', () => {
  assert.equal(new Set(ALL_LEVELS.map((l) => l.id)).size, ALL_LEVELS.length);
  for (const l of ALL_LEVELS) {
    assert.ok(l.length >= 5000 && l.speed >= 90, l.id);
    assert.ok(l.weather && l.bonus?.label, l.id);
    if (l.gust) assert.ok(l.gust.every[0] < l.gust.every[1] && l.gust.strength > 0, l.id);
  }
});

test('difficulty ramps within each world and across the journey', () => {
  for (const w of WORLDS) {
    const speeds = w.levels.map((l) => l.speed);
    assert.deepEqual(speeds, [...speeds].sort((a, b) => a - b), `${w.id} speeds non-decreasing`);
    const lengths = w.levels.map((l) => l.length);
    assert.deepEqual(lengths, [...lengths].sort((a, b) => a - b), `${w.id} lengths non-decreasing`);
  }
  assert.ok(ALL_LEVELS.at(-1).speed > ALL_LEVELS[0].speed);
});

test('unlocking is sequential and needs one star', () => {
  const [a, b, c] = ALL_LEVELS;
  assert.equal(isLevelUnlocked(a, {}), true);
  assert.equal(isLevelUnlocked(b, {}), false);
  assert.equal(isLevelUnlocked(b, { [a.id]: 1 }), true);
  assert.equal(isLevelUnlocked(c, { [a.id]: 3 }), false);
  assert.equal(nextLevel(ALL_LEVELS.at(-1)), null);
  assert.equal(nextLevel(a), b);
});

test('star rules', () => {
  const lvl = ALL_LEVELS.find((l) => l.bonus.type === 'thermal');
  const total = 50;
  assert.equal(sparkTarget(total), 30);
  assert.deepEqual(evaluateStars(lvl, { sparks: 29, thermal: 0, bumps: 0, bottles: 0 }, total), [true, false, false]);
  assert.deepEqual(evaluateStars(lvl, { sparks: 30, thermal: lvl.bonus.amount, bumps: 5, bottles: 0 }, total), [true, true, true]);
  assert.equal(bonusProgress({ type: 'clean', amount: 0 }, { bumps: 1 }, 10).done, false);
  assert.equal(bonusProgress({ type: 'clean', amount: 0 }, { bumps: 0 }, 10).done, true);
  assert.equal(bonusProgress({ type: 'sparks', amount: 90 }, { sparks: 45 }, 50).done, true);
  assert.equal(bonusProgress({ type: 'sparks', amount: 90 }, { sparks: 44 }, 50).done, false);
  assert.equal(bonusProgress({ type: 'bottle', amount: 1 }, { bottles: 1 }, 50).done, true);
});
