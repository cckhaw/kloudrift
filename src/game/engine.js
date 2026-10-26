import { FLORA, floraById, gardenList, isUnlocked } from '../lib/flora.js';
import { Weather } from './weather.js';
import { sparkTarget, bonusProgress, evaluateStars, worldOf } from './levels.js';

const SHIP_R = 14;
const TAU = Math.PI * 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

// Deterministic hash → [0,1) so parallax cloud layers are infinite but stable.
function hash(n, seed = 0) {
  const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Sky palette stops: Twilight Indigo → Sunset Amber → Soft Lavender
const SKY = [
  [26, 27, 53],
  [255, 139, 66],
  [226, 217, 243],
];
function skyColor(p) {
  const t = clamp(p, 0, 1) * 2;
  const i = Math.min(1, Math.floor(t));
  const f = t - i;
  const a = SKY[i];
  const b = SKY[i + 1];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const ZONES = [
  [0, 'Low Drift'],
  [300, 'Cloud Sea'],
  [800, 'Stratosphere'],
  [1600, 'Starlit Calm'],
];
const FREE_PARAMS = { sparksMin: 6, sparksMax: 10, thermalChance: 0.6, stormChance: null, stormScale: 1, bottleChance: 0.09 };

export const zoneFor = (alt) => ZONES.reduce((z, [min, name]) => (alt >= min ? name : z), ZONES[0][1]);

export class Engine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} hooks { getProfile, audio, onCollect, onPlant, onBottle, onToast, onHud }
   */
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.systemReduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.reduceMotion = this.systemReduceMotion;
    this.paused = false;
    this.suspended = false; // true while a 3D level owns the screen

    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.time = 0;
    this.cam = 0;
    this.alt = 0;
    this.slow = false; // overlays open → world drifts in slow motion, no interaction
    this.running = false;
    this.hudTimer = 0;
    this.trailTimer = 0;
    this.bumpCooldown = 0;

    this.ship = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
    this.target = { x: 0, y: 0 };
    this.touching = false;
    this.tapStart = null;

    this.sparks = [];
    this.thermals = [];
    this.storms = [];
    this.islands = [];
    this.bottles = [];
    this.outgoing = [];
    this.particles = [];
    this.stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.7, s: rand(0.6, 1.8), p: Math.random() * TAU }));

    this.meteors = [];
    this.thermalSecs = 0;
    this.lastZone = zoneFor(0);
    this.nextHomeAt = 0;
    this.spawnX = 0;
    this.sinceThermal = 0;
    this.sinceStorm = 0;
    this.sinceIsland = 0;
    this.nextId = 1;

    this.mode = 'free'; // 'free' (endless drift) | 'level' (Journey)
    this.level = null;
    this.theme = null;
    this.params = FREE_PARAMS;
    this.stats = { sparks: 0, thermal: 0, bumps: 0, bottles: 0 };
    this.sparksTotal = 0;
    this.finished = false;
    this.weather = new Weather(this);

    this.sprites = this.buildCloudSprites();
    this.bindEvents();
    this.resize();
    this.ship.x = this.w * 0.3;
    this.ship.y = this.h * 0.45;
    this.target.x = this.ship.x;
    this.target.y = this.ship.y;
    this.spawnX = this.w * 0.7;
    this.fillWorld();
  }

  // ───────────────────────── lifecycle ─────────────────────────

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.suspended) {
        this.update(this.paused ? 0 : dt * (this.slow ? 0.35 : 1));
        this.render();
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.unbind?.();
  }

  /** Clears the world and puts the ship back at the start. */
  resetWorld() {
    this.cam = 0;
    this.alt = 0;
    this.time = 0;
    this.sparks = [];
    this.thermals = [];
    this.storms = [];
    this.islands = [];
    this.bottles = [];
    this.outgoing = [];
    this.particles = [];
    this.meteors = [];
    this.thermalSecs = 0;
    this.lastZone = zoneFor(0);
    this.nextHomeAt = 0;
    this.sinceThermal = 0;
    this.sinceStorm = 0;
    this.sinceIsland = 0;
    this.finished = false;
    this.stats = { sparks: 0, thermal: 0, bumps: 0, bottles: 0 };
    this.ship.x = this.w * 0.3;
    this.ship.y = this.h * 0.45;
    this.ship.vx = this.ship.vy = 0;
    this.target.x = this.ship.x;
    this.target.y = this.ship.y;
    this.spawnX = this.w * 0.7;
  }

  startFree() {
    this.mode = 'free';
    this.level = null;
    this.theme = null;
    this.params = FREE_PARAMS;
    this.resetWorld();
    this.weather.set(null);
    this.fillWorld();
  }

  startLevel(level) {
    this.mode = 'level';
    this.level = level;
    this.theme = worldOf(level).theme;
    this.params = level;
    this.resetWorld();
    this.weather.set(level.weather, level.gust);

    // The whole level is laid out up front so the star target is known and always reachable.
    while (this.spawnX < level.length + 200) this.spawnChunk();
    if (level.bonus.type === 'bottle' && !this.bottles.some((b) => b.x < level.length)) {
      this.bottles.push({ x: level.length * 0.5, y: this.h * 0.4, p: 0 });
    }
    const limit = level.length;
    this.sparks = this.sparks.filter((s) => s.x < limit - 80);
    this.thermals = this.thermals.filter((t) => t.x < limit - 150);
    this.storms = this.storms.filter((s) => s.x < limit - 250);
    this.bottles = this.bottles.filter((b) => b.x < limit - 80);
    this.sparksTotal = this.sparks.length;
  }

  setSuspended(v) {
    this.suspended = v;
    if (v) this.touching = false;
    else this.last = performance.now();
  }

  setPaused(v) {
    this.paused = v;
    if (v) this.touching = false;
  }

  setCalm(v) {
    this.reduceMotion = v || this.systemReduceMotion;
  }

  setSlow(v) {
    this.slow = v;
    if (v) this.touching = false;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const pw = this.w || rect.width;
    const ph = this.h || rect.height;
    this.w = rect.width;
    this.h = rect.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (pw && ph) {
      this.ship.x = (this.ship.x / pw) * this.w;
      this.ship.y = (this.ship.y / ph) * this.h;
      this.target.x = this.ship.x;
      this.target.y = this.ship.y;
    }
  }

  bindEvents() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e) => {
      if (this.slow || this.paused || this.suspended) return;
      c.setPointerCapture?.(e.pointerId);
      const p = pos(e);
      this.touching = true;
      this.pointerId = e.pointerId;
      this.setTarget(p);
      this.tapStart = { ...p, t: performance.now() };
    };
    const move = (e) => {
      if (!this.touching || e.pointerId !== this.pointerId) return;
      this.setTarget(pos(e));
    };
    const up = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.touching = false;
      const p = pos(e);
      const s = this.tapStart;
      if (s && performance.now() - s.t < 260 && Math.hypot(p.x - s.x, p.y - s.y) < 12) this.handleTap(p);
      this.tapStart = null;
    };
    const cancel = () => {
      this.touching = false;
      this.tapStart = null;
    };
    const resize = () => this.resize();
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', cancel);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    this.unbind = () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', cancel);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }

  setTarget(p) {
    // Aim a little above the finger so the thumb never hides the ship.
    this.target.x = clamp(p.x, 28, this.w - 28);
    this.target.y = clamp(p.y - 56, 70, this.h - 90);
  }

  // ───────────────────────── world generation ─────────────────────────

  fillWorld() {
    if (this.mode === 'level') return;
    while (this.spawnX < this.cam + this.w + 500) this.spawnChunk();
  }

  spawnChunk() {
    const { w, h } = this;
    const x0 = this.spawnX;
    const width = rand(520, 760);
    this.sinceThermal += width;
    this.sinceStorm += width;
    this.sinceIsland += width;

    // Spark ribbon: a gentle sine arc
    const P = this.params;
    const count = Math.floor(rand(P.sparksMin, P.sparksMax));
    const baseY = rand(h * 0.2, h * 0.62);
    const amp = rand(20, 70);
    const phase = rand(0, TAU);
    for (let i = 0; i < count; i++) {
      this.sparks.push({
        x: x0 + 60 + i * 44,
        y: clamp(baseY + Math.sin(phase + i * 0.7) * amp, 80, h - 130),
        p: Math.random() * TAU,
      });
    }

    if (this.sinceThermal > 1300 && Math.random() < P.thermalChance) {
      this.sinceThermal = 0;
      this.thermals.push({ x: x0 + width * 0.55, w: rand(100, 140), seed: Math.random() * 100 });
      // extra sparks inside the column
      for (let i = 0; i < 5; i++) this.sparks.push({ x: this.thermals.at(-1).x + rand(-30, 30), y: h * 0.75 - i * (h * 0.11), p: Math.random() * TAU });
    }

    const stormChance = P.stormChance ?? clamp(0.55 - this.alt / 4000, 0.15, 0.55);
    if (this.sinceStorm > 1000 && x0 > 700 && Math.random() < stormChance) {
      this.sinceStorm = 0;
      const r = clamp(h * 0.1, 46, 90) * P.stormScale;
      const cx = x0 + width * 0.85;
      const cy = rand(h * 0.25, h * 0.6);
      const blobs = [{ dx: 0, dy: 0, r }];
      for (let i = 0; i < 3; i++) blobs.push({ dx: rand(-r, r) * 1.2, dy: rand(-r, r) * 0.5, r: r * rand(0.6, 0.9) });
      this.storms.push({ x: cx, y: cy, blobs, seed: Math.random() * 100 });
    }

    if (x0 >= this.nextHomeAt) {
      // The home isle carries the player's saved garden and returns every so often.
      this.nextHomeAt = x0 + 5200;
      this.sinceIsland = 0;
      const hw = 340;
      const flora = gardenList(this.hooks.getProfile().garden, Math.floor(hw / 42)).map((type, slot) => ({ slot, type, born: -10 }));
      this.islands.push({
        id: this.nextId++,
        home: true,
        x: x0 + width * 0.3,
        y: h - clamp(h * 0.22, 130, 200),
        w: hw,
        slots: Math.floor(hw / 42),
        flora,
        bob: Math.random() * TAU,
      });
    } else if (this.sinceIsland > 650 && Math.random() < 0.7) {
      this.sinceIsland = 0;
      const iw = rand(150, 220);
      this.islands.push({
        id: this.nextId++,
        x: x0 + width * 0.3,
        y: h - clamp(h * 0.22, 130, 200) + rand(-12, 12),
        w: iw,
        slots: Math.floor(iw / 42),
        flora: [],
        bob: Math.random() * TAU,
      });
    }

    if (Math.random() < P.bottleChance) {
      this.bottles.push({ x: x0 + width * 0.5, y: rand(h * 0.25, h * 0.55), p: Math.random() * TAU });
    }

    this.spawnX += width;
  }

  cull() {
    const edge = this.cam - 400;
    this.meteors = this.meteors.filter((m) => m.life < m.max);
    this.sparks = this.sparks.filter((s) => s.x > edge);
    this.thermals = this.thermals.filter((t) => t.x > edge);
    this.storms = this.storms.filter((s) => s.x > edge - 200);
    this.islands = this.islands.filter((i) => i.x + i.w > edge);
    this.bottles = this.bottles.filter((b) => b.x > edge);
  }

  // ───────────────────────── interaction ─────────────────────────

  handleTap(p) {
    const profile = this.hooks.getProfile();
    for (const isl of this.islands) {
      const sx = isl.x - this.cam;
      if (Math.abs(p.x - sx) < isl.w * 0.6 && p.y > isl.y - 100 && p.y < isl.y + 70) {
        const species = floraById[profile.selectedFlora] || FLORA[0];
        if (!isUnlocked(species, profile.bestAltitude)) {
          this.hooks.onToast(`${species.name} unlocks in the ${species.unlockLabel}`);
        } else if (isl.flora.length >= isl.slots) {
          this.hooks.onToast('This island is in full bloom.');
        } else if (profile.sparks < species.cost) {
          this.hooks.onToast(`${species.name} needs ${species.cost} sparks`);
        } else {
          const used = new Set(isl.flora.map((f) => f.slot));
          let slot = 0;
          while (used.has(slot)) slot++;
          isl.flora.push({ slot, type: species.id, born: this.time });
          this.burst(sx - isl.w / 2 + 24 + slot * 42, isl.y - 8, species.color, 18);
          this.hooks.audio?.plant();
          this.hooks.onPlant(species.id);
        }
        return;
      }
    }
  }

  launchBottle() {
    this.outgoing.push({ x: this.ship.x + this.cam, y: this.ship.y + 10, vx: 60, vy: -50, life: 0 });
  }

  burst(x, y, color, n = 10) {
    const k = this.reduceMotion ? 0.4 : 1;
    for (let i = 0; i < n * k; i++) {
      const a = Math.random() * TAU;
      const s = rand(30, 120);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0, max: rand(0.5, 1.1), size: rand(1.5, 3.2), color });
    }
    if (this.particles.length > 450) this.particles.splice(0, this.particles.length - 450);
  }

  // ───────────────────────── simulation ─────────────────────────

  update(dt) {
    this.time += dt;
    const { ship, target } = this;
    const active = !this.slow;
    const speed = this.level ? this.level.speed : 80 + Math.min(60, this.alt * 0.03);
    this.cam += speed * dt;
    this.fillWorld();
    this.cull();

    // Which thermal (if any) is the ship riding?
    let thermal = null;
    for (const t of this.thermals) {
      if (Math.abs(ship.x + this.cam - t.x) < t.w / 2) {
        thermal = t;
        break;
      }
    }
    const inThermal = !!thermal && active;

    // Weight-based inertia: critically-damped-ish spring toward the finger.
    if (active) {
      const gust = this.weather.update(dt, true);
      const k = (this.touching ? 20 : 2.5) * (1 - 0.5 * gust.grip); // a gust loosens your grip on the steering
      const c = this.touching ? 7.6 : 3.2;
      if (!this.touching) {
        target.x += (ship.x - target.x) * Math.min(1, 1.2 * dt);
        target.y += (ship.y - target.y) * Math.min(1, 0.8 * dt);
      }
      let ax = (target.x - ship.x) * k - ship.vx * c;
      let ay = (target.y - ship.y) * k - ship.vy * c;
      if (!this.touching) ay += 10; // settle very gently
      if (inThermal) ay -= 380;
      ax += gust.ax;
      ay += gust.ay;
      ship.vx += ax * dt;
      ship.vy += ay * dt;
      const sp = Math.hypot(ship.vx, ship.vy);
      if (sp > 520) {
        ship.vx *= 520 / sp;
        ship.vy *= 520 / sp;
      }
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      ship.x = clamp(ship.x, 24, this.w - 24);
      ship.y = clamp(ship.y, 60, this.h - 70);
    }
    else this.weather.update(dt, false);
    ship.angle = lerp(ship.angle, clamp(ship.vy / 420, -0.45, 0.45), Math.min(1, 6 * dt));

    // Altitude
    if (inThermal) this.alt += 45 * dt;
    else this.alt = Math.max(0, this.alt - 3 * dt);
    this.hooks.audio?.setThermal(inThermal);

    if (inThermal) {
      this.stats.thermal += dt;
      this.thermalSecs += dt;
      if (this.thermalSecs >= 1) {
        this.hooks.onProgress?.('thermal', Math.floor(this.thermalSecs));
        this.thermalSecs -= Math.floor(this.thermalSecs);
      }
    }
    const zone = zoneFor(this.alt);
    if (zone !== this.lastZone && this.mode === 'free') {
      if (this.alt > 0 && ZONES.findIndex((z) => z[1] === zone) > ZONES.findIndex((z) => z[1] === this.lastZone)) {
        this.hooks.onToast(`Entering the ${zone}`);
      }
      this.lastZone = zone;
    }

    // Shooting stars once the sky is high and quiet
    if (!this.reduceMotion && this.mode === 'free' && this.alt > 1200 && Math.random() < 0.15 * dt) {
      this.meteors.push({ x: rand(this.w * 0.3, this.w), y: rand(0, this.h * 0.35), vx: -rand(260, 380), vy: rand(90, 160), life: 0, max: 0.9 });
    }
    for (const m of this.meteors) {
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }

    if (active) {
      const mult = inThermal ? 2 : 1;

      // Sparks (thermals gently magnetize them)
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i];
        const sx = s.x - this.cam;
        if (sx < -40 || sx > this.w + 40) continue;
        let dx = ship.x - sx;
        let dy = ship.y - s.y;
        let d = Math.hypot(dx, dy);
        if (inThermal && d < 110 && d > 1) {
          s.x += (dx / d) * 160 * dt;
          s.y += (dy / d) * 160 * dt;
          dx = ship.x - (s.x - this.cam);
          dy = ship.y - s.y;
          d = Math.hypot(dx, dy);
        }
        if (d < SHIP_R + 12) {
          this.sparks.splice(i, 1);
          this.burst(s.x - this.cam, s.y, inThermal ? '#FFD700' : '#FFE9A8', inThermal ? 14 : 8);
          this.hooks.audio?.spark(mult);
          this.stats.sparks++;
          this.hooks.onCollect(mult);
        }
      }

      // Storm fronts — never fatal, always a soft cushion.
      this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
      for (const st of this.storms) {
        for (const b of st.blobs) {
          const bx = st.x + b.dx - this.cam;
          const by = st.y + b.dy + Math.sin(this.time * 0.4 + st.seed) * 6;
          const dx = ship.x - bx;
          const dy = ship.y - by;
          const d = Math.hypot(dx, dy) || 0.001;
          const min = b.r * 0.92 + SHIP_R;
          if (d < min) {
            const nx = dx / d;
            const ny = dy / d;
            ship.x += nx * (min - d) * 0.35;
            ship.y += ny * (min - d) * 0.35;
            const vn = ship.vx * nx + ship.vy * ny;
            if (vn < 0) {
              ship.vx -= 1.55 * vn * nx;
              ship.vy -= 1.55 * vn * ny;
            }
            ship.vx += nx * 120 * dt * 10;
            ship.vy += ny * 120 * dt * 10;
            if (this.bumpCooldown === 0) {
              this.bumpCooldown = 0.8;
              this.stats.bumps++;
              this.hooks.audio?.bump();
              navigator.vibrate?.(12);
              this.burst(ship.x, ship.y, '#B8B2E6', 6);
              this.hooks.onToast('The wind cushions you');
            }
          }
        }
      }

      // Drifting bottles
      for (let i = this.bottles.length - 1; i >= 0; i--) {
        const b = this.bottles[i];
        const bx = b.x - this.cam;
        const by = b.y + Math.sin(this.time * 1.2 + b.p) * 8;
        if (Math.hypot(ship.x - bx, ship.y - by) < SHIP_R + 22) {
          this.bottles.splice(i, 1);
          this.burst(bx, by, '#BFEFFF', 16);
          this.hooks.audio?.bottle();
          this.stats.bottles++;
          this.hooks.onBottle();
        }
      }
    }

    // Outgoing bottles released by the player sail off up-and-away.
    for (const o of this.outgoing) {
      o.life += dt;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.vy -= 8 * dt;
    }
    this.outgoing = this.outgoing.filter((o) => o.life < 6);

    // Trail
    this.trailTimer -= dt;
    if (this.trailTimer <= 0 && !this.reduceMotion) {
      this.trailTimer = inThermal ? 0.025 : 0.05;
      this.particles.push({
        x: ship.x - 24,
        y: ship.y + 2,
        vx: -speed * 0.6 + rand(-8, 8),
        vy: rand(-10, 10),
        life: 0,
        max: rand(0.7, 1.3),
        size: rand(1.5, 2.8),
        color: inThermal ? '#FFD700' : '#4EA8DE',
      });
    }
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.2 * dt;
      p.vy *= 1 - 1.2 * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);

    if (this.level && !this.finished && active && this.cam + ship.x >= this.level.length) this.finishLevel();

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.hooks.onHud(this.hudState(inThermal));
    }
  }

  hudState(inThermal) {
    const hud = { mode: this.mode, altitude: Math.round(this.alt), zone: zoneFor(this.alt), inThermal };
    if (this.level) {
      const b = bonusProgress(this.level.bonus, this.stats, this.sparksTotal);
      Object.assign(hud, {
        levelName: this.level.name,
        progress: Math.round(clamp((this.cam + this.ship.x) / this.level.length, 0, 1) * 100),
        sparks: this.stats.sparks,
        sparkTarget: sparkTarget(this.sparksTotal),
        bonusLabel: this.level.bonus.label,
        bonusValue: b.value,
        bonusTarget: b.target,
        bonusDone: b.done,
        bonusType: this.level.bonus.type,
        weather: this.weather.type,
        fog: this.weather.fog > 0,
      });
    }
    return hud;
  }

  finishLevel() {
    this.finished = true;
    const stars = evaluateStars(this.level, this.stats, this.sparksTotal);
    this.burst(this.ship.x, this.ship.y, '#FFD166', 40);
    this.hooks.audio?.fanfare(stars.filter(Boolean).length);
    this.hooks.onLevelComplete?.({
      level: this.level,
      stars,
      sparks: this.stats.sparks,
      total: this.sparksTotal,
      target: sparkTarget(this.sparksTotal),
      bonus: bonusProgress(this.level.bonus, this.stats, this.sparksTotal),
    });
  }

  // ───────────────────────── rendering ─────────────────────────

  buildCloudSprites() {
    return [0, 1, 2].map((v) => {
      const c = document.createElement('canvas');
      c.width = 360;
      c.height = 150;
      const g = c.getContext('2d');
      const puffs = 7 + v;
      for (let i = 0; i < puffs; i++) {
        const px = 60 + (i / (puffs - 1)) * 240 + (hash(i, v) - 0.5) * 30;
        const r = 32 + hash(i + 9, v) * 30 - Math.abs(i - puffs / 2) * 3;
        const py = 95 - hash(i + 3, v) * 26 - (r - 30) * 0.4;
        const grad = g.createRadialGradient(px, py, 0, px, py, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.55, 'rgba(250,246,255,0.5)');
        grad.addColorStop(1, 'rgba(250,246,255,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(px, py, r, 0, TAU);
        g.fill();
      }
      return c;
    });
  }

  phase() {
    if (this.theme) return clamp(this.theme.phase + Math.sin(this.time * 0.03) * 0.03, 0, 1);
    const base = 0.5 + 0.5 * Math.sin(this.time * 0.02 - 1.9);
    const lifted = clamp(base + Math.min(0.3, this.alt / 2500), 0, 1);
    // Above ~700 m the sky settles into deep twilight, so the upper zones feel starlit.
    return lerp(lifted, 0.05, clamp((this.alt - 700) / 700, 0, 1));
  }

  render() {
    const { ctx, w, h } = this;
    const p = this.phase();
    const top = this.theme?.sky?.top ?? skyColor(p * 0.8);
    const bottom = this.theme?.sky?.bottom ?? skyColor(Math.min(1, p * 0.8 + 0.3));

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgb(top));
    g.addColorStop(1, rgb(bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Stars fade in as the sky goes to twilight or climbs high
    const starA = this.theme ? clamp(this.theme.stars * (1 - p * 0.6), 0, 1) : clamp((1 - p) * 1.1 + Math.min(0.5, this.alt / 3000) - 0.1, 0, 1);
    if (starA > 0.02) {
      for (const s of this.stars) {
        const tw = 0.6 + 0.4 * Math.sin(this.time * 1.5 + s.p);
        ctx.fillStyle = `rgba(255,255,255,${starA * tw * 0.8})`;
        ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
      }
    }

    // Low sun glow
    const glow = ctx.createRadialGradient(w * 0.78, h * 0.72, 0, w * 0.78, h * 0.72, h * 0.6);
    glow.addColorStop(0, `rgba(255,170,100,${0.28 * (this.theme?.glow ?? 1)})`);
    glow.addColorStop(1, 'rgba(255,170,100,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    this.drawAurora();
    this.drawMeteors();

    // Cloud Sea (≈300–800 m) is thick with cloud; higher air thins out.
    const cloudBoost = this.theme ? this.theme.cloud : 1 + 0.7 * clamp(1 - Math.abs(this.alt - 550) / 350, 0, 1) - 0.4 * clamp((this.alt - 1200) / 600, 0, 1);
    this.drawClouds(0.06, 0.22, 1.7, 0.2 * cloudBoost, 0);
    this.drawClouds(0.16, 0.45, 1.2, 0.28 * cloudBoost, 1);
    this.drawClouds(0.32, 0.72, 0.9, 0.3 * cloudBoost, 2);

    if (this.level) this.drawBeacon();
    for (const t of this.thermals) this.drawThermal(t);
    for (const isl of this.islands) this.drawIsland(isl);
    for (const s of this.sparks) this.drawSpark(s);
    for (const b of this.bottles) this.drawBottle(b.x - this.cam, b.y + Math.sin(this.time * 1.2 + b.p) * 8, 1);
    for (const o of this.outgoing) this.drawBottle(o.x - this.cam, o.y, Math.max(0, 1 - o.life / 6));
    for (const st of this.storms) this.drawStorm(st);

    // Weather: heavy skies darken a little, fog swallows what is ahead (never the ship).
    const wx = this.weather;
    if (wx.precipitating && wx.type !== 'snow') {
      ctx.fillStyle = `rgba(12,12,36,${0.2 * wx.intensity})`;
      ctx.fillRect(0, 0, w, h);
    }
    wx.drawFog(ctx, w, h, this.theme?.fog ?? [235, 230, 245]);

    this.drawParticles();
    this.drawShip();

    // Foreground wisps give depth
    this.drawClouds(0.9, 0.95, 0.7, 0.1, 1);
    wx.drawOverlay(ctx, w, h, this.time);
  }

  /** The finish: a tall golden beam with a ring at its heart. Fog never hides it. */
  drawBeacon() {
    const { ctx, w, h } = this;
    const x = this.level.length - this.cam;
    if (x < -120 || x > w + 120) {
      if (x > w + 120) {
        // off-screen to the right: a small edge marker so the goal is always readable
        const pulse = 0.6 + 0.4 * Math.sin(this.time * 3);
        ctx.fillStyle = `rgba(255,209,102,${0.5 * pulse})`;
        ctx.beginPath();
        ctx.moveTo(w - 6, h * 0.45 - 12);
        ctx.lineTo(w - 6, h * 0.45 + 12);
        ctx.lineTo(w - 20, h * 0.45);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }
    const beam = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
    beam.addColorStop(0, 'rgba(255,209,102,0)');
    beam.addColorStop(0.5, 'rgba(255,224,150,0.38)');
    beam.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(x - 40, 0, 80, h);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.4);
    for (let i = 0; i < 3; i++) {
      const r = 34 + i * 20 + pulse * 6;
      ctx.strokeStyle = `rgba(255,224,150,${0.75 - i * 0.2})`;
      ctx.lineWidth = 3 - i * 0.7;
      ctx.beginPath();
      ctx.ellipse(x, h * 0.45, r * 0.55, r, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BEACON', x, h * 0.45 - 84);
  }

  drawAurora() {
    const a = this.theme ? this.theme.aurora : clamp((this.alt - 700) / 500, 0, 1);
    if (a <= 0.01) return;
    const { ctx, w, h } = this;
    const colors = ['78,168,222', '155,123,255', '123,223,242'];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    colors.forEach((c, k) => {
      for (const [lw, la] of [[64, 0.05], [38, 0.07], [16, 0.1]]) {
        ctx.strokeStyle = `rgba(${c},${la * a})`;
        ctx.lineWidth = lw;
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 14) {
          const y = h * (0.16 + 0.08 * k) + Math.sin(x * 0.009 + this.time * 0.22 + k * 2) * 26 + Math.sin(x * 0.021 - this.time * 0.15) * 10;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  drawMeteors() {
    const { ctx } = this;
    for (const m of this.meteors) {
      const a = Math.sin((m.life / m.max) * Math.PI);
      const len = 70;
      const n = Math.hypot(m.vx, m.vy);
      const g = ctx.createLinearGradient(m.x, m.y, m.x - (m.vx / n) * len, m.y - (m.vy / n) * len);
      g.addColorStop(0, `rgba(255,255,255,${a * 0.9})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - (m.vx / n) * len, m.y - (m.vy / n) * len);
      ctx.stroke();
    }
  }

  drawClouds(parallax, yFrac, scale, alpha, seed) {
    const { ctx, w, h } = this;
    const spacing = 340 * scale;
    const off = this.cam * parallax;
    const first = Math.floor(off / spacing) - 1;
    const last = Math.ceil((off + w) / spacing) + 1;
    ctx.globalAlpha = alpha;
    for (let i = first; i <= last; i++) {
      const r = hash(i, seed + 5);
      if (r < 0.25) continue;
      const sprite = this.sprites[Math.floor(hash(i, seed + 11) * 3)];
      const x = i * spacing - off + (hash(i, seed + 2) - 0.5) * 80;
      const y = h * yFrac + (hash(i, seed + 7) - 0.5) * h * 0.22 + Math.sin(this.time * 0.1 + i) * 4;
      ctx.drawImage(sprite, x, y - 75 * scale, 360 * scale, 150 * scale);
    }
    ctx.globalAlpha = 1;
  }

  drawThermal(t) {
    const { ctx, h } = this;
    const x = t.x - this.cam;
    if (x < -t.w || x > this.w + t.w) return;
    const col = ctx.createLinearGradient(x - t.w / 2, 0, x + t.w / 2, 0);
    col.addColorStop(0, 'rgba(255,215,0,0)');
    col.addColorStop(0.5, 'rgba(255,215,0,0.10)');
    col.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = col;
    ctx.fillRect(x - t.w / 2, 0, t.w, h);

    // Rising golden rings
    const rings = 7;
    const gap = h / rings;
    const rise = this.reduceMotion ? 0 : (this.time * 70) % gap;
    for (let i = 0; i < rings + 1; i++) {
      const y = h - i * gap + rise;
      const f = clamp(y / h, 0, 1); // fade toward the top
      ctx.strokeStyle = `rgba(255,215,0,${0.1 + 0.3 * f})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, t.w * 0.42 * (0.85 + 0.15 * f), 9, 0, 0, TAU);
      ctx.stroke();
    }
    // Cyan mist motes
    for (let i = 0; i < 6; i++) {
      const y = h - ((this.time * 55 + i * (h / 6) + t.seed * 20) % h);
      const mx = x + Math.sin(this.time * 0.8 + i * 2 + t.seed) * t.w * 0.3;
      ctx.fillStyle = 'rgba(78,168,222,0.45)';
      ctx.beginPath();
      ctx.arc(mx, y, 2.2, 0, TAU);
      ctx.fill();
    }
  }

  drawSpark(s) {
    const { ctx } = this;
    const x = s.x - this.cam;
    if (x < -30 || x > this.w + 30) return;
    const y = s.y + Math.sin(this.time * 2 + s.p) * 4;
    const pulse = 0.8 + 0.2 * Math.sin(this.time * 3 + s.p);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 16 * pulse);
    g.addColorStop(0, 'rgba(255,240,170,0.95)');
    g.addColorStop(0.35, 'rgba(255,215,0,0.5)');
    g.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 16 * pulse, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FFF6CC';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, TAU);
    ctx.fill();
  }

  drawBottle(x, y, alpha) {
    const { ctx } = this;
    if (x < -40 || x > this.w + 40 || alpha <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.5 + Math.sin(this.time + x * 0.01) * 0.1);
    ctx.globalAlpha = alpha;
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    halo.addColorStop(0, 'rgba(190,239,255,0.45)');
    halo.addColorStop(1, 'rgba(190,239,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(210,245,255,0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-7, -4, 14, 20, 6);
    ctx.roundRect(-3, -14, 6, 12, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFF3C4'; // the little note inside
    ctx.fillRect(-3, 4, 6, 8);
    ctx.restore();
  }

  drawStorm(st) {
    const { ctx } = this;
    const x = st.x - this.cam;
    if (x < -300 || x > this.w + 300) return;
    for (const b of st.blobs) {
      const bx = x + b.dx;
      const by = st.y + b.dy + Math.sin(this.time * 0.4 + st.seed) * 6;
      const g = ctx.createRadialGradient(bx, by, b.r * 0.2, bx, by, b.r * 1.15);
      g.addColorStop(0, 'rgba(18,16,40,0.92)');
      g.addColorStop(0.7, 'rgba(34,30,66,0.7)');
      g.addColorStop(1, 'rgba(60,52,100,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, b.r * 1.15, 0, TAU);
      ctx.fill();
    }
    // faint distant lightning shimmer
    const flicker = Math.max(0, Math.sin(this.time * 0.9 + st.seed * 3)) ** 24;
    if (flicker > 0.05 && !this.reduceMotion) {
      ctx.fillStyle = `rgba(180,170,255,${flicker * 0.18})`;
      ctx.beginPath();
      ctx.arc(x, st.y, st.blobs[0].r * 1.1, 0, TAU);
      ctx.fill();
    }
  }

  drawIsland(isl) {
    const { ctx } = this;
    const x = isl.x - this.cam;
    if (x < -isl.w || x > this.w + isl.w) return;
    const y = isl.y + Math.sin(this.time * 0.6 + isl.bob) * 5;
    const hw = isl.w / 2;

    // underside rock
    const rock = ctx.createLinearGradient(0, y, 0, y + 70);
    rock.addColorStop(0, '#4a4272');
    rock.addColorStop(1, '#241f40');
    ctx.fillStyle = rock;
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.bezierCurveTo(x - hw * 0.8, y + 30, x - hw * 0.3, y + 50, x + hw * 0.05, y + 72);
    ctx.bezierCurveTo(x + hw * 0.35, y + 48, x + hw * 0.85, y + 28, x + hw, y);
    ctx.closePath();
    ctx.fill();
    // grassy top
    const grass = ctx.createLinearGradient(0, y - 12, 0, y + 8);
    grass.addColorStop(0, '#8FBF9F');
    grass.addColorStop(1, '#5C8F7B');
    ctx.fillStyle = grass;
    ctx.beginPath();
    ctx.ellipse(x, y, hw, 12, 0, 0, TAU);
    ctx.fill();

    if (isl.home) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '600 12px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('HOME ISLE', x, y + 30);
    }

    // flora
    for (const f of isl.flora) {
      const sp = floraById[f.type];
      const fx = x - hw + 24 + f.slot * 42;
      const grow = clamp((this.time - f.born) / 1.2, 0, 1);
      this.drawFlora(sp, fx, y - 4, grow, f.slot);
    }

    // Affordance: when the selected seed can be planted here, say so in words.
    const profile = this.hooks.getProfile();
    const sp = floraById[profile.selectedFlora] || FLORA[0];
    if (!this.slow && isl.flora.length < isl.slots && isUnlocked(sp, profile.bestAltitude) && profile.sparks >= sp.cost && x > 60 && x < this.w - 60) {
      const pr = 0.5 + 0.5 * Math.sin(this.time * 3);
      const label = `Tap to plant ${sp.name}`;
      ctx.font = '600 12px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width + 28;
      const lx = clamp(x, tw / 2 + 10, this.w - tw / 2 - 10);
      const ly = y - 84 - pr * 3;
      ctx.fillStyle = 'rgba(30,28,58,0.62)';
      ctx.strokeStyle = `rgba(255,255,255,${0.3 + pr * 0.3})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(lx - tw / 2, ly - 14, tw, 28, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(`+  ${label}`, lx, ly + 4);
    }
  }

  drawFlora(sp, x, y, grow, seed) {
    const { ctx } = this;
    const sway = Math.sin(this.time * 1.1 + seed) * 3 * grow;
    const s = grow;
    const glow = ctx.createRadialGradient(x + sway, y - 22 * s, 0, x + sway, y - 22 * s, 34);
    glow.addColorStop(0, sp.glow + '88');
    glow.addColorStop(1, sp.glow + '00');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x + sway, y - 22 * s, 34, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = sp.color;
    ctx.fillStyle = sp.color;
    ctx.lineCap = 'round';
    if (sp.id === 'fern') {
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + i * 6, y - 14 * s, x + i * 12 + sway, y - 28 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + i * 12 + sway, y - 28 * s, 2.4, 0, TAU);
        ctx.fill();
      }
    } else if (sp.id === 'bloom') {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#8FBF9F';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x, y - 12 * s, x + sway, y - 24 * s);
      ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        ctx.beginPath();
        ctx.arc(x + sway + Math.cos(a) * 6 * s, y - 26 * s + Math.sin(a) * 6 * s, 4.5 * s, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#FFF3C4';
      ctx.beginPath();
      ctx.arc(x + sway, y - 26 * s, 3.5 * s, 0, TAU);
      ctx.fill();
    } else if (sp.id === 'lotus') {
      ctx.fillStyle = '#6FB79A';
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 15 * s, 4 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = sp.color;
      for (let i = -2; i <= 2; i++) {
        ctx.save();
        ctx.translate(x + sway * 0.3, y - 6 * s);
        ctx.rotate(i * 0.4);
        ctx.beginPath();
        ctx.ellipse(0, -9 * s, 4 * s, 10 * s, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#FFF3C4';
      ctx.beginPath();
      ctx.arc(x + sway * 0.3, y - 8 * s, 2.6 * s, 0, TAU);
      ctx.fill();
    } else if (sp.id === 'willow') {
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#5b7a68';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 24 * s);
      ctx.stroke();
      ctx.lineWidth = 1.6;
      for (let i = -2; i <= 2; i++) {
        const ex = x + i * 8 + sway * (0.6 + Math.abs(i) * 0.15);
        ctx.strokeStyle = sp.color;
        ctx.beginPath();
        ctx.moveTo(x, y - 24 * s);
        ctx.quadraticCurveTo(x + i * 10, y - 34 * s, ex, y - 8 * s);
        ctx.stroke();
        ctx.fillStyle = '#FFE9A8';
        ctx.beginPath();
        ctx.arc(ex, y - 8 * s, 2 * s, 0, TAU);
        ctx.fill();
      }
    } else if (sp.id === 'crystal') {
      const pulse = 0.85 + 0.15 * Math.sin(this.time * 2 + seed);
      for (const [dx, h, wd] of [[-8, 20, 5], [0, 32, 6], [8, 16, 4.5]]) {
        ctx.fillStyle = sp.color;
        ctx.globalAlpha = 0.75 * pulse;
        ctx.beginPath();
        ctx.moveTo(x + dx - wd * s, y);
        ctx.lineTo(x + dx, y - h * s);
        ctx.lineTo(x + dx + wd * s, y);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else {
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#6a5a8a';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + sway * 0.4, y - 22 * s);
      ctx.stroke();
      for (const [dx, dy, r] of [[-8, -26, 9], [8, -26, 9], [0, -34, 11]]) {
        ctx.beginPath();
        ctx.arc(x + dx * s + sway, y + dy * s, r * s, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawShip() {
    const { ctx, ship } = this;
    ctx.save();
    ctx.translate(ship.x, ship.y + Math.sin(this.time * 2) * 1.5);
    ctx.rotate(ship.angle);

    // lantern halo
    const lx = 24;
    const ly = 6;
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 4);
    const halo = ctx.createRadialGradient(lx, ly, 0, lx, ly, 46 * pulse);
    halo.addColorStop(0, 'rgba(255,209,102,0.75)');
    halo.addColorStop(0.4, 'rgba(255,209,102,0.25)');
    halo.addColorStop(1, 'rgba(255,209,102,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(lx, ly, 46 * pulse, 0, TAU);
    ctx.fill();

    // tail fin
    ctx.fillStyle = '#d9d2f2';
    ctx.beginPath();
    ctx.moveTo(-20, -2);
    ctx.lineTo(-32, -14);
    ctx.lineTo(-30, 2);
    ctx.lineTo(-32, 12);
    ctx.lineTo(-20, 3);
    ctx.closePath();
    ctx.fill();

    // hull
    const body = ctx.createLinearGradient(0, -12, 0, 12);
    body.addColorStop(0, '#FFFFFF');
    body.addColorStop(1, '#BDB4DD');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, 27, 11, 0, 0, TAU);
    ctx.fill();

    // gondola
    ctx.fillStyle = '#6a5f95';
    ctx.beginPath();
    ctx.roundRect(-8, 8, 16, 7, 3);
    ctx.fill();

    // lantern
    ctx.fillStyle = '#FFD166';
    ctx.beginPath();
    ctx.arc(lx, ly, 3.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
