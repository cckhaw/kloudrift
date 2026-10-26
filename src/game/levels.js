// Journey mode content: worlds made of short levels. Every level has one clear goal —
// fly to the Beacon — and up to three stars. Nothing can fail the player; stars are optional.
//
//   ★ 1  Reach the Beacon
//   ★ 2  Collect at least SPARK_STAR_RATIO of the sparks along the way
//   ★ 3  Complete the level's bonus challenge

export const SPARK_STAR_RATIO = 0.6;
export const STAR_REWARD = 15; // sparks for each star earned for the first time

const bonuses = {
  thermal: (n) => ({ type: 'thermal', amount: n, label: `Ride golden updrafts for ${n} seconds` }),
  bottle: () => ({ type: 'bottle', amount: 1, label: 'Catch a wind-bottle' }),
  clean: () => ({ type: 'clean', amount: 0, label: 'Finish without touching a storm' }),
  rings: (n) => ({ type: 'rings', amount: n, label: `Fly through ${n} golden rings` }),
  sparks: (pct) => ({ type: 'sparks', amount: pct, label: `Collect ${pct}% of the sparks` }),
};

// Defaults; each level only lists what differs.
const base = { sparksMin: 6, sparksMax: 10, thermalChance: 0.6, stormChance: 0.3, stormScale: 1, bottleChance: 0.05, gust: null };

const level = (world, n, name, extra) => ({ ...base, id: `${world}-${n}`, world, n, name, dim: '2d', ...extra });

// 3D levels fly forward through space: `length` and `speed` are in world units (u, u/s).
const base3d = { orbs: 120, rings: 8, obstacles: 10, gust: null };
const level3 = (world, n, name, extra) => ({ ...base3d, id: `${world}-${n}`, world, n, name, dim: '3d', ...extra });

export const WORLDS = [
  {
    id: 'dawn',
    name: 'Dawn Meadows',
    blurb: 'Warm light and easy winds. A gentle place to learn the sky.',
    theme: { phase: 0.45, aurora: 0, stars: 0.1, cloud: 1, fog: [240, 220, 215] },
    levels: [
      level('dawn', 1, 'First Light', { length: 5000, speed: 90, stormChance: 0.12, weather: { type: 'clear', intensity: 0 }, bonus: bonuses.thermal(6) }),
      level('dawn', 2, 'Morning Breeze', { length: 6000, speed: 95, weather: { type: 'breeze', intensity: 0.4 }, gust: { every: [14, 20], strength: 500 }, bottleChance: 0.5, bonus: bonuses.bottle() }),
      level('dawn', 3, 'Warm Updrafts', { length: 7000, speed: 100, thermalChance: 0.95, weather: { type: 'breeze', intensity: 0.6 }, gust: { every: [12, 18], strength: 600 }, bonus: bonuses.thermal(12) }),
      level('dawn', 4, 'Golden Hour', { length: 8000, speed: 105, stormChance: 0.45, weather: { type: 'breeze', intensity: 0.8 }, gust: { every: [10, 15], strength: 700 }, bonus: bonuses.clean() }),
    ],
  },
  {
    id: 'cloud',
    name: 'Cloud Sea',
    blurb: 'An ocean of mist. Visibility drops — trust the golden trail.',
    theme: { phase: 0.82, aurora: 0, stars: 0, cloud: 1.7, fog: [235, 230, 248] },
    levels: [
      level('cloud', 1, 'Mist Banks', { length: 6000, speed: 100, weather: { type: 'clear', intensity: 0, fog: 0.35 }, bonus: bonuses.thermal(8) }),
      level('cloud', 2, 'Drizzle', { length: 7000, speed: 105, weather: { type: 'rain', intensity: 0.4, fog: 0.3 }, gust: { every: [12, 17], strength: 600 }, bonus: bonuses.bottle(), bottleChance: 0.5 }),
      level('cloud', 3, 'Whiteout', { length: 8000, speed: 105, stormChance: 0.4, weather: { type: 'clear', intensity: 0, fog: 0.7 }, bonus: bonuses.sparks(90) }),
      level('cloud', 4, 'Rainfall Run', { length: 9000, speed: 110, stormChance: 0.45, weather: { type: 'rain', intensity: 0.7, fog: 0.4 }, gust: { every: [9, 14], strength: 750 }, bonus: bonuses.clean() }),
    ],
  },
  {
    id: 'storm',
    name: 'Storm Spires',
    blurb: 'Towering thunderheads and crosswinds. Lightning is loud but harmless.',
    theme: { phase: 0.1, aurora: 0, stars: 0.35, cloud: 0.7, fog: [60, 58, 96], sky: { top: [16, 16, 36], bottom: [78, 68, 108] }, glow: 0.15 },
    levels: [
      level('storm', 1, 'Distant Thunder', { length: 7000, speed: 110, stormChance: 0.4, weather: { type: 'storm', intensity: 0.4 }, gust: { every: [12, 18], strength: 700 }, bonus: bonuses.thermal(10) }),
      level('storm', 2, 'Crosswinds', { length: 8000, speed: 115, stormChance: 0.45, weather: { type: 'rain', intensity: 0.6 }, gust: { every: [8, 12], strength: 900 }, bonus: bonuses.bottle(), bottleChance: 0.5 }),
      level('storm', 3, 'Spire Alley', { length: 9000, speed: 120, stormChance: 0.6, stormScale: 1.15, weather: { type: 'storm', intensity: 0.7 }, gust: { every: [8, 12], strength: 950 }, bonus: bonuses.clean() }),
      level('storm', 4, 'Eye of the Storm', { length: 10000, speed: 125, stormChance: 0.6, stormScale: 1.2, weather: { type: 'storm', intensity: 1 }, gust: { every: [7, 11], strength: 1100 }, bonus: bonuses.sparks(80) }),
    ],
  },
  {
    id: 'frost',
    name: 'Frostlight',
    blurb: 'Snow, aurora and cold, steady winds. Ride the updrafts to stay aloft.',
    theme: { phase: 0.05, aurora: 1, stars: 1, cloud: 0.8, fog: [150, 170, 210], sky: { top: [10, 18, 48], bottom: [92, 128, 178] }, glow: 0 },
    levels: [
      level('frost', 1, 'First Frost', { length: 7000, speed: 110, weather: { type: 'snow', intensity: 0.4 }, bonus: bonuses.thermal(10) }),
      level('frost', 2, 'Snowfall', { length: 8000, speed: 115, weather: { type: 'snow', intensity: 0.6 }, gust: { every: [10, 15], strength: 800 }, bonus: bonuses.bottle(), bottleChance: 0.5 }),
      level('frost', 3, 'Glacier Winds', { length: 9000, speed: 120, stormChance: 0.45, weather: { type: 'snow', intensity: 0.8, fog: 0.25 }, gust: { every: [7, 11], strength: 1000 }, bonus: bonuses.clean() }),
      level('frost', 4, 'Aurora Crown', { length: 10000, speed: 125, thermalChance: 0.95, weather: { type: 'snow', intensity: 1, fog: 0.3 }, gust: { every: [7, 10], strength: 1100 }, bonus: bonuses.thermal(20) }),
    ],
  },
];

WORLDS.push(
  {
    id: 'canyon',
    name: 'Crystal Canyon',
    dim: '3d',
    blurb: 'Fly forward through a glowing canyon. Thread the golden rings.',
    theme: { scene: 'canyon', sky: { top: [34, 22, 66], bottom: [214, 120, 140] }, fog: [96, 62, 120], light: 0xffd2b0, crystals: [0xb78cff, 0x7fd8ff, 0xff9ad0, 0x9dffd0] },
    levels: [
      level3('canyon', 1, 'Amethyst Gate', { length: 2400, speed: 30, orbs: 120, rings: 8, obstacles: 8, weather: { type: 'clear', intensity: 0 }, bonus: bonuses.rings(5) }),
      level3('canyon', 2, 'Glowmoss Bend', { length: 2800, speed: 33, orbs: 140, rings: 9, obstacles: 14, weather: { type: 'breeze', intensity: 0.5 }, gust: { every: [11, 16], strength: 700 }, bonus: bonuses.sparks(80) }),
      level3('canyon', 3, 'Veil of Mist', { length: 3200, speed: 36, orbs: 160, rings: 12, obstacles: 20, weather: { type: 'rain', intensity: 0.45, fog: 0.5 }, gust: { every: [9, 14], strength: 850 }, bonus: bonuses.rings(10) }),
      level3('canyon', 4, 'Thunder Hollow', { length: 3600, speed: 40, orbs: 180, rings: 12, obstacles: 28, weather: { type: 'storm', intensity: 0.85 }, gust: { every: [7, 11], strength: 1000 }, bonus: bonuses.clean() }),
    ],
  },
  {
    id: 'starfall',
    name: 'Starfall Run',
    dim: '3d',
    blurb: 'An open night sky of drifting rock and shooting stars.',
    theme: { scene: 'starfall', sky: { top: [4, 6, 24], bottom: [38, 34, 92] }, fog: [20, 22, 52], light: 0x9fb4ff, crystals: [0x8fa3ff, 0xc3a6ff] },
    levels: [
      level3('starfall', 1, 'Evening Star', { length: 2800, speed: 34, orbs: 140, rings: 10, obstacles: 10, weather: { type: 'clear', intensity: 0 }, bonus: bonuses.rings(8) }),
      level3('starfall', 2, 'Meteor Shower', { length: 3200, speed: 38, orbs: 160, rings: 10, obstacles: 18, weather: { type: 'breeze', intensity: 0.6 }, gust: { every: [10, 14], strength: 850 }, bonus: bonuses.sparks(85) }),
      level3('starfall', 3, 'Frozen Veil', { length: 3600, speed: 42, orbs: 180, rings: 14, obstacles: 22, weather: { type: 'snow', intensity: 0.7, fog: 0.25 }, gust: { every: [8, 12], strength: 950 }, bonus: bonuses.rings(12) }),
      level3('starfall', 4, "Comet's Tail", { length: 4000, speed: 46, orbs: 200, rings: 14, obstacles: 30, weather: { type: 'snow', intensity: 1, fog: 0.3 }, gust: { every: [6, 10], strength: 1100 }, bonus: bonuses.clean() }),
    ],
  },
);

export const ALL_LEVELS = WORLDS.flatMap((w) => w.levels);
export const levelById = Object.fromEntries(ALL_LEVELS.map((l) => [l.id, l]));
export const worldOf = (lvl) => WORLDS.find((w) => w.id === lvl.world);

/** A level is open when it is the very first, or the one before it has at least one star. */
export function isLevelUnlocked(lvl, stars) {
  const i = ALL_LEVELS.indexOf(lvl);
  return i <= 0 || (stars[ALL_LEVELS[i - 1].id] || 0) >= 1;
}

export const nextLevel = (lvl) => ALL_LEVELS[ALL_LEVELS.indexOf(lvl) + 1] || null;

export const sparkTarget = (total) => Math.max(1, Math.ceil(total * SPARK_STAR_RATIO));

/** stats: { sparks, thermal (seconds), bumps, bottles } */
export function bonusProgress(bonus, stats, total) {
  switch (bonus.type) {
    case 'thermal':
      return { value: Math.min(Math.floor(stats.thermal), bonus.amount), target: bonus.amount, done: stats.thermal >= bonus.amount };
    case 'bottle':
      return { value: Math.min(stats.bottles, 1), target: 1, done: stats.bottles >= 1 };
    case 'rings':
      return { value: Math.min(stats.rings || 0, bonus.amount), target: bonus.amount, done: (stats.rings || 0) >= bonus.amount };
    case 'clean':
      return { value: stats.bumps, target: 0, done: stats.bumps === 0 };
    case 'sparks': {
      const need = Math.ceil((total * bonus.amount) / 100);
      return { value: Math.min(stats.sparks, need), target: need, done: stats.sparks >= need };
    }
    default:
      return { value: 0, target: 0, done: false };
  }
}

/** Returns [reachedBeacon, enoughSparks, bonusDone] — the first is always true once finished. */
export function evaluateStars(lvl, stats, total) {
  return [true, stats.sparks >= sparkTarget(total), bonusProgress(lvl.bonus, stats, total).done];
}
