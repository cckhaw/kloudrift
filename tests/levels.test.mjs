import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_LEVELS, WORLDS, isLevelUnlocked, nextLevel, evaluateStars, bonusProgress, sparkTarget } from '../src/game/levels.js';

test('level data is complete and ids are unique', () => {
  assert.equal(new Set(ALL_LEVELS.map((l) => l.id)).size, ALL_LEVELS.length);
  for (const l of ALL_LEVELS) {
    if (l.dim === '3d') assert.ok(l.length >= 2400 && l.speed >= 30 && l.orbs > 0 && l.rings >= 5 && l.obstacles > 0, l.id);
    else assert.ok(l.length >= 5000 && l.speed >= 90, l.id);
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
  for (const w of WORLDS.filter((w) => w.dim === '3d')) {
    const ob = w.levels.map((l) => l.obstacles);
    assert.deepEqual(ob, [...ob].sort((a, b) => a - b), `${w.id} obstacles non-decreasing`);
  }
  assert.ok(ALL_LEVELS.at(-1).speed > ALL_LEVELS[0].speed || ALL_LEVELS.at(-1).dim === '3d');
});

test('3D worlds follow the 2D journey and rings bonus works', () => {
  const idx = (id) => ALL_LEVELS.findIndex((l) => l.id === id);
  assert.ok(idx('canyon-1') > idx('frost-4') && idx('starfall-1') > idx('canyon-4'));
  assert.ok(WORLDS.filter((w) => w.dim === '3d').every((w) => w.levels.every((l) => l.dim === '3d')));
  assert.ok(ALL_LEVELS.filter((l) => l.dim === '2d').length === 16);
  assert.deepEqual(bonusProgress({ type: 'rings', amount: 5 }, { rings: 4 }, 0), { value: 4, target: 5, done: false });
  assert.equal(bonusProgress({ type: 'rings', amount: 5 }, { rings: 5 }, 0).done, true);
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
