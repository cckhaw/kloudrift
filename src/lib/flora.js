// Seedable flora for the floating islands. Costs are in Light Sparks.
// `unlock` is the best altitude (m) the player must have reached once.
export const FLORA = [
  { id: 'fern', name: 'Lumen Fern', cost: 5, unlock: 0, color: '#7BDFF2', glow: '#4EA8DE', blurb: 'Soft cyan fronds that hum quietly.' },
  { id: 'bloom', name: 'Ember Bloom', cost: 12, unlock: 0, color: '#FFB86B', glow: '#FF8B42', blurb: 'A warm blossom that never fades.' },
  { id: 'tree', name: 'Aurora Tree', cost: 30, unlock: 0, color: '#C3A6FF', glow: '#9B7BFF', blurb: 'Slow, shimmering lavender canopy.' },
  { id: 'lotus', name: 'Moon Lotus', cost: 18, unlock: 300, unlockLabel: 'Cloud Sea', color: '#E8F7FF', glow: '#8FD3FF', blurb: 'Floats on mist and opens at dusk.' },
  { id: 'willow', name: 'Glow Willow', cost: 40, unlock: 800, unlockLabel: 'Stratosphere', color: '#9FE3B5', glow: '#4FD18B', blurb: 'Drooping boughs strung with lanterns.' },
  { id: 'crystal', name: 'Star Crystal', cost: 60, unlock: 1600, unlockLabel: 'Starlit Calm', color: '#FFD6F5', glow: '#FF8FE3', blurb: 'A shard of night sky that sings softly.' },
];

export const floraById = Object.fromEntries(FLORA.map((f) => [f.id, f]));
export const isUnlocked = (f, bestAltitude) => bestAltitude >= f.unlock;

/** Garden counts → a deterministic round-robin list so a small island shows a mix of species. */
export function gardenList(garden, limit) {
  const left = FLORA.map((f) => ({ id: f.id, n: garden[f.id] || 0 }));
  const out = [];
  while (out.length < limit && left.some((l) => l.n > 0)) {
    for (const l of left) {
      if (l.n > 0 && out.length < limit) {
        out.push(l.id);
        l.n--;
      }
    }
  }
  return out;
}
