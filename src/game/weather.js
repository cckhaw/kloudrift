// Weather for Journey levels. Purely atmospheric except wind gusts, which are the one real challenge:
// a gust is announced ~1.4 s ahead, then pushes the ship and loosens steering for a couple of seconds.
// Nothing here can fail the player; lightning is light and sound only.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const WARN_SECONDS = 1.4;
const BLOW_SECONDS = 2.4;

const GUSTS = [
  { dir: [0, -1], label: 'A gust rises from below' },
  { dir: [0, 1], label: 'A gust pushes down' },
  { dir: [-1, 0.15], label: 'A headwind is coming' },
];

export class Weather {
  constructor(engine) {
    this.engine = engine;
    this.type = 'clear';
    this.intensity = 0;
    this.fog = 0;
    this.gustCfg = null;
    this.drops = Array.from({ length: 170 }, () => this.newDrop(true));
    this.streaks = Array.from({ length: 14 }, () => ({ x: Math.random(), y: Math.random(), len: rand(60, 160), speed: rand(500, 800) }));
    this.reset();
  }

  reset() {
    this.gust = { state: 'idle', t: rand(5, 8), dir: GUSTS[0], env: 0 };
    this.flash = 0;
    this.nextLightning = rand(3, 6);
    this.thunderAt = -1;
  }

  /** cfg: { type, intensity, fog? } or null; gust: { every:[a,b], strength } or null */
  set(cfg, gust = null) {
    this.type = cfg?.type ?? 'clear';
    this.intensity = cfg?.intensity ?? 0;
    this.fog = cfg?.fog ?? (this.type === 'fog' ? this.intensity : 0);
    this.gustCfg = gust;
    this.reset();
    this.engine.hooks.audio?.setWeather?.(this.type, this.intensity);
  }

  get precipitating() {
    return ['rain', 'storm', 'snow'].includes(this.type) && this.intensity > 0;
  }

  newDrop(anywhere) {
    return {
      x: Math.random(),
      y: anywhere ? Math.random() : -0.05,
      z: Math.random(), // depth: nearer drops are longer / faster
      p: Math.random() * TAU,
    };
  }

  /** Advances weather; returns the gust acceleration {ax, ay, grip} to apply to the ship. */
  update(dt, active) {
    const e = this.engine;
    const g = this.gust;

    if (this.gustCfg && active) {
      g.t -= dt;
      if (g.state === 'idle' && g.t <= 0) {
        g.state = 'warn';
        g.t = WARN_SECONDS;
        g.dir = GUSTS[Math.floor(Math.random() * GUSTS.length)];
        e.hooks.onToast?.(g.dir.label);
      } else if (g.state === 'warn' && g.t <= 0) {
        g.state = 'blow';
        g.t = BLOW_SECONDS;
      } else if (g.state === 'blow') {
        g.env = Math.sin(clamp(1 - g.t / BLOW_SECONDS, 0, 1) * Math.PI);
        if (g.t <= 0) {
          g.state = 'idle';
          g.env = 0;
          const [a, b] = this.gustCfg.every;
          g.t = rand(a, b);
        }
      }
    }
    if (g.state !== 'blow') g.env = 0;
    e.hooks.audio?.setGust?.(g.env);

    // Lightning: flash now, thunder a beat later. Skipped entirely in calm / reduced-motion mode.
    if (this.type === 'storm' && active) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.nextLightning = rand(5, 10) / Math.max(0.4, this.intensity);
        if (!e.reduceMotion) this.flash = 0.55;
        this.thunderAt = e.time + rand(0.4, 1.3);
      }
    }
    if (this.thunderAt >= 0 && e.time >= this.thunderAt) {
      this.thunderAt = -1;
      e.hooks.audio?.thunder?.();
    }
    this.flash = Math.max(0, this.flash - dt * 1.1);

    // Precipitation
    if (this.precipitating) {
      const snow = this.type === 'snow';
      const count = Math.floor(this.drops.length * clamp(this.intensity, 0.15, 1) * (e.reduceMotion ? 0.4 : 1));
      for (let i = 0; i < count; i++) {
        const d = this.drops[i];
        const fall = snow ? 60 + d.z * 70 : 650 + d.z * 450;
        d.y += (fall / e.h) * dt;
        d.x += ((snow ? Math.sin(e.time + d.p) * 28 : -90 - g.env * 150) / e.w) * dt;
        if (d.y > 1.05 || d.x < -0.1 || d.x > 1.1) Object.assign(d, this.newDrop(false));
      }
    }

    const dirv = g.dir.dir;
    return { ax: dirv[0] * (this.gustCfg?.strength ?? 0) * g.env, ay: dirv[1] * (this.gustCfg?.strength ?? 0) * g.env, grip: g.env };
  }

  // ───────────────────────── drawing ─────────────────────────

  /** Drawn after the world but before the ship, so upcoming hazards disappear into the haze but the ship stays clear. */
  drawFog(ctx, w, h, color) {
    if (this.fog <= 0.01) return;
    const [r, g, b] = color;
    const sx = this.engine.ship.x;
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.16 * this.fog})`;
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(sx + 50, 0, w, 0);
    grad.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},0)`);
    grad.addColorStop(0.55, `rgba(${r | 0},${g | 0},${b | 0},${0.55 * this.fog})`);
    grad.addColorStop(1, `rgba(${r | 0},${g | 0},${b | 0},${0.88 * this.fog})`);
    ctx.fillStyle = grad;
    ctx.fillRect(sx + 50, 0, w - sx - 50, h);
  }

  /** Rain, snow, wind streaks and lightning — drawn over everything. */
  drawOverlay(ctx, w, h, time) {
    const g = this.gust;

    if (this.precipitating) {
      const snow = this.type === 'snow';
      const count = Math.floor(this.drops.length * clamp(this.intensity, 0.15, 1) * (this.engine.reduceMotion ? 0.4 : 1));
      if (snow) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (let i = 0; i < count; i++) {
          const d = this.drops[i];
          ctx.globalAlpha = 0.35 + d.z * 0.55;
          ctx.beginPath();
          ctx.arc(d.x * w, d.y * h, 1 + d.z * 2.2, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(200,220,255,0.55)';
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const d = this.drops[i];
          const len = 8 + d.z * 16;
          const x = d.x * w;
          const y = d.y * h;
          ctx.moveTo(x, y);
          ctx.lineTo(x + len * 0.18, y - len);
        }
        ctx.stroke();
      }
    }

    // Wind streaks announce and show a gust
    const visible = g.state === 'warn' ? 0.35 : g.state === 'blow' ? 0.35 + 0.6 * g.env : 0;
    if (visible > 0 && this.gustCfg) {
      const [dx, dy] = g.dir.dir;
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.6;
      for (const s of this.streaks) {
        const t = (time * s.speed * 0.0016 + s.x * 3) % 1;
        // streaks travel in the direction the wind blows
        const px = dx !== 0 ? (dx > 0 ? t : 1 - t) * (w + 200) - 100 : s.x * w;
        const py = dy !== 0 ? (dy > 0 ? t : 1 - t) * (h + 200) - 100 : s.y * h;
        ctx.strokeStyle = `rgba(255,255,255,${visible * 0.55})`;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - dx * s.len, py - dy * s.len);
        ctx.stroke();
      }
    }

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(215,210,255,${this.flash * 0.5})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
