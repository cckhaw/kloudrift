# kloudrift

A cozy, one-thumb cloud-flight prototype for mobile browsers. React + Vite, HTML5 Canvas, Tailwind CSS, Web Audio.

```bash
npm install
npm run dev      # then open on your phone via the printed network URL
npm run build
npm test         # API + storage tests (no database needed)
```

## Play
- **Journey:** four worlds of four levels. Every level has one goal: **fly to the glowing Beacon**. Up to three optional stars: reach the Beacon, collect 60% of the sparks, finish the bonus challenge (updraft time, catch a bottle, no storm touches, or a high spark share). Each new star pays 15 sparks. There is no timer and no game over; a level unlocks once the previous one has a star.
- **Weather:** worlds escalate from clear dawn skies to breezes, fog and rain, thunderstorms and snow. Fog hides what is ahead, and **wind gusts** warn you, then push the ship and loosen your steering for a couple of seconds. Lightning is light and sound only (calm mode switches the flashes off).
- **Free Drift:** the original endless, goal-free mode with altitude zones.
- **Touch and drag** anywhere to glide; the airship follows with weight and inertia.
- **Golden updrafts** lift you higher (altitude zones shift the sky) and double spark pickups.
- **Storms** never end the run — they cushion and bounce you back.
- **Sky zones:** Low Drift → Cloud Sea (thick clouds) → Stratosphere (aurora, deep twilight) → Starlit Calm (shooting stars, rare storms).
- **Sanctuary:** pick a seed, then tap a floating island drifting below to plant it (costs sparks). Six species; Moon Lotus, Glow Willow and Star Crystal unlock at 300 / 800 / 1600 m. Your garden is saved and grows on the **Home Isle**, which returns regularly.
- **Today:** three gentle daily goals (sun icon). Each pays 10 sparks automatically; there are no streaks or penalties.
- **Wind-Bottles:** release an anonymous kind note, and catch glass bottles released by other wanderers (or a note from the sky when none are around). Caught bottles can be reported.
- Mute from the top dock; the gear in the bottom dock pauses the world and opens settings (volume, calm mode, replay tutorial, reset). Headphones recommended (binaural drone).
- Installable: add to home screen for a fullscreen, offline-capable PWA (service worker is active in production builds only).

## Layout
- `src/game/engine.js` – physics, procedural world, canvas renderer, level lifecycle
- `src/game/levels.js` – worlds, levels, star and unlock rules (tested)
- `src/game/weather.js` – rain, snow, fog, lightning, wind gusts
- `src/audio/synth.js` – Web Audio wind, binaural drone, chord pad, chimes
- `src/lib/` – storage (localStorage), flora, daily goals, wind-bottle client
- `api/` – wind-bottle serverless function, storage adapter, moderation
- `src/components/` – glassmorphic HUD, start screen, Sanctuary and Bottles sheets

## Wind-bottle backend
`api/bottles.js` is a Vercel serverless function (also served by `vite` / `vite preview` locally).

- **Storage:** with `DATABASE_URL` / `POSTGRES_URL` set (Neon via Vercel Storage, free plan) bottles are stored in Postgres; tables are created automatically on first use. Redis REST credentials (`KV_REST_API_URL` + `KV_REST_API_TOKEN`) also work. With neither, an in-memory store is used: fine locally, but on serverless it is per-instance and resets, so bottles will not reliably reach other players. Check the active backend at `/api/bottles?status=1`.
- **Safety:** text is limited to 140 characters and screened for links, contact details, spam, unkind wording and self-harm language (the last gets a supportive message instead of being shared). Releases are limited to 5/hour per IP, and a bottle is hidden after 2 reports. This is a basic word/pattern filter, not a full moderation service; add one before wide release.
- **Privacy:** the client sends only a random anonymous id (stored on the device) and the text. The server stores a hash of that id and never returns it. IP addresses are only used, hashed, for rate limiting.
- **Offline:** if the API is unreachable, releases stay on the device and catches fall back to built-in notes.
