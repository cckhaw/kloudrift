# kloudrift

A cozy, one-thumb cloud-flight prototype for mobile browsers. React + Vite, HTML5 Canvas, Tailwind CSS, Web Audio.

```bash
npm install
npm run dev      # then open on your phone via the printed network URL
npm run build
```

## Play
- **Touch and drag** anywhere to glide; the airship follows with weight and inertia.
- **Golden updrafts** lift you higher (altitude zones shift the sky) and double spark pickups.
- **Storms** never end the run — they cushion and bounce you back.
- **Sanctuary:** pick a seed, then tap a floating island drifting below to plant it (costs sparks).
- **Wind-Bottles:** release an anonymous kind note, and catch glass bottles drifting by.
- Mute from the top dock; the gear in the bottom dock pauses the world and opens settings (volume, calm mode, replay tutorial, reset). Headphones recommended (binaural drone).
- Installable: add to home screen for a fullscreen, offline-capable PWA (service worker is active in production builds only).

## Layout
- `src/game/engine.js` – physics, procedural world, canvas renderer
- `src/audio/synth.js` – Web Audio wind, binaural drone, chord pad, chimes
- `src/lib/` – storage (localStorage), flora, wind-bottle service
- `src/components/` – glassmorphic HUD, start screen, Sanctuary and Bottles sheets

## Prototype notes
Wind-bottles are served from an on-device pool of kind notes; `src/lib/bottles.js` is async so a real backend can replace it. Any backend showing strangers' text needs server-side moderation and rate limiting.
