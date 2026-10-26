// Gentle daily goals: three small intentions per local day. No streaks, no penalties,
// nothing is lost by skipping a day.

const POOL = [
  { type: 'sparks', targets: [25, 40, 60], label: (n) => `Gather ${n} light sparks` },
  { type: 'altitude', targets: [200, 400, 700], label: (n) => `Drift up to ${n} m` },
  { type: 'thermal', targets: [10, 20, 30], label: (n) => `Ride golden updrafts for ${n} seconds` },
  { type: 'plant', targets: [1, 2, 3], label: (n) => `Plant ${n} seed${n > 1 ? 's' : ''}` },
  { type: 'bottle', targets: [1], label: () => 'Catch or release a wind-bottle' },
];
export const GOAL_REWARD = 10;

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function goalsFor(dateKey) {
  const rand = seeded(`kloudrift:${dateKey}`);
  const pool = [...POOL];
  const goals = [];
  while (goals.length < 3) {
    const [entry] = pool.splice(Math.floor(rand() * pool.length), 1);
    const target = entry.targets[Math.floor(rand() * entry.targets.length)];
    goals.push({ id: entry.type, type: entry.type, target, label: entry.label(target), reward: GOAL_REWARD });
  }
  return goals;
}

export const emptyDaily = (date = '') => ({ date, progress: {}, claimed: [] });

/** Returns today's record, starting a fresh one if the stored record is from another day. */
export function rollDaily(daily, today = todayKey()) {
  return daily && daily.date === today ? daily : emptyDaily(today);
}

export function addProgress(daily, type, amount, today = todayKey()) {
  const d = rollDaily(daily, today);
  const cur = d.progress[type] || 0;
  const next = type === 'altitude' ? Math.max(cur, amount) : cur + amount;
  if (next === cur) return d;
  return { ...d, progress: { ...d.progress, [type]: next } };
}

export function unclaimedDone(daily, today = todayKey()) {
  const d = rollDaily(daily, today);
  return goalsFor(d.date).filter((g) => (d.progress[g.type] || 0) >= g.target && !d.claimed.includes(g.id));
}
