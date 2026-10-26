const KEY = 'kloudrift:v1';

export const defaultProfile = () => ({
  sparks: 0,
  bestAltitude: 0,
  garden: { fern: 0, bloom: 0, tree: 0, lotus: 0, willow: 0, crystal: 0 },
  selectedFlora: 'fern',
  sent: [],
  caught: [],
  muted: false,
  volume: 0.8,
  calm: false, // reduced effects, independent of the OS setting
  tutorialDone: false,
  daily: { date: '', progress: {}, claimed: [] },
  journey: { stars: {} }, // levelId → 0..3
});

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw);
    const base = defaultProfile();
    return { ...base, ...parsed, garden: { ...base.garden, ...(parsed.garden || {}) }, journey: { stars: {}, ...(parsed.journey || {}) } };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* storage unavailable (private mode, quota) — progress just won't persist */
  }
}
