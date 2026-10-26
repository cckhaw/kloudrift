// Seedable flora for the floating islands. Costs are in Light Sparks.
export const FLORA = [
  { id: 'fern', name: 'Lumen Fern', cost: 5, color: '#7BDFF2', glow: '#4EA8DE', blurb: 'Soft cyan fronds that hum quietly.' },
  { id: 'bloom', name: 'Ember Bloom', cost: 12, color: '#FFB86B', glow: '#FF8B42', blurb: 'A warm blossom that never fades.' },
  { id: 'tree', name: 'Aurora Tree', cost: 30, color: '#C3A6FF', glow: '#9B7BFF', blurb: 'Slow, shimmering lavender canopy.' },
];

export const floraById = Object.fromEntries(FLORA.map((f) => [f.id, f]));
