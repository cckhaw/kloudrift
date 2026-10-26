import { FLORA, floraById } from '../lib/flora.js';

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

    this.spawnX = 0;
    this.sinceThermal = 0;
    this.sinceStorm = 0;
    this.sinceIsland = 0;
    this.nextId = 1;

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
      this.update(this.paused ? 0 : dt * (this.slow ? 0.35 : 1));
      this.render();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.unbind?.();
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
      if (this.slow || this.paused) return;
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
    const count = Math.floor(rand(6, 10));
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

    if (this.sinceThermal > 1300 && Math.random() < 0.6) {
      this.sinceThermal = 0;
      this.thermals.push({ x: x0 + width * 0.55, w: rand(100, 140), seed: Math.random() * 100 });
      // extra sparks inside the column
      for (let i = 0; i < 5; i++) this.sparks.push({ x: this.thermals.at(-1).x + rand(-30, 30), y: h * 0.75 - i * (h * 0.11), p: Math.random() * TAU });
    }

    if (this.sinceStorm > 1000 && Math.random() < 0.55) {
      this.sinceStorm = 0;
      const r = clamp(h * 0.1, 46, 90);
      const cx = x0 + width * 0.85;
      const cy = rand(h * 0.25, h * 0.6);
      const blobs = [{ dx: 0, dy: 0, r }];
      for (let i = 0; i < 3; i++) blobs.push({ dx: rand(-r, r) * 1.2, dy: rand(-r, r) * 0.5, r: r * rand(0.6, 0.9) });
      this.storms.push({ x: cx, y: cy, blobs, seed: Math.random() * 100 });
    }

    if (this.sinceIsland > 650 && Math.random() < 0.7) {
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

    if (Math.random() < 0.09) {
      this.bottles.push({ x: x0 + width * 0.5, y: rand(h * 0.25, h * 0.55), p: Math.random() * TAU });
    }

    this.spawnX += width;
  }

  cull() {
    const edge = this.cam - 400;
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
        if (isl.flora.length >= isl.slots) {
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
    const speed = 80 + Math.min(60, this.alt * 0.03);
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
      const k = this.touching ? 20 : 2.5;
      const c = this.touching ? 7.6 : 3.2;
      if (!this.touching) {
        target.x += (ship.x - target.x) * Math.min(1, 1.2 * dt);
        target.y += (ship.y - target.y) * Math.min(1, 0.8 * dt);
      }
      let ax = (target.x - ship.x) * k - ship.vx * c;
      let ay = (target.y - ship.y) * k - ship.vy * c;
      if (!this.touching) ay += 10; // settle very gently
      if (inThermal) ay -= 380;
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
    ship.angle = lerp(ship.angle, clamp(ship.vy / 420, -0.45, 0.45), Math.min(1, 6 * dt));

    // Altitude
    if (inThermal) this.alt += 45 * dt;
    else this.alt = Math.max(0, this.alt - 3 * dt);
    this.hooks.audio?.setWind(inThermal ? 1 : 0);

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

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.hooks.onHud({ altitude: Math.round(this.alt), zone: zoneFor(this.alt), inThermal });
    }
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
    const base = 0.5 + 0.5 * Math.sin(this.time * 0.02 - 1.9);
    return clamp(base + Math.min(0.3, this.alt / 4000), 0, 1);
  }

  render() {
    const { ctx, w, h } = this;
    const p = this.phase();
    const top = skyColor(p * 0.8);
    const bottom = skyColor(Math.min(1, p * 0.8 + 0.3));

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgb(top));
    g.addColorStop(1, rgb(bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Stars fade in as the sky goes to twilight or climbs high
    const starA = clamp((1 - p) * 1.1 + Math.min(0.5, this.alt / 3000) - 0.1, 0, 1);
    if (starA > 0.02) {
      for (const s of this.stars) {
        const tw = 0.6 + 0.4 * Math.sin(this.time * 1.5 + s.p);
        ctx.fillStyle = `rgba(255,255,255,${starA * tw * 0.8})`;
        ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
      }
    }

    // Low sun glow
    const glow = ctx.createRadialGradient(w * 0.78, h * 0.72, 0, w * 0.78, h * 0.72, h * 0.6);
    glow.addColorStop(0, 'rgba(255,170,100,0.28)');
    glow.addColorStop(1, 'rgba(255,170,100,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    this.drawClouds(0.06, 0.22, 1.7, 0.2, 0);
    this.drawClouds(0.16, 0.45, 1.2, 0.28, 1);
    this.drawClouds(0.32, 0.72, 0.9, 0.3, 2);

    for (const t of this.thermals) this.drawThermal(t);
    for (const isl of this.islands) this.drawIsland(isl);
    for (const s of this.sparks) this.drawSpark(s);
    for (const b of this.bottles) this.drawBottle(b.x - this.cam, b.y + Math.sin(this.time * 1.2 + b.p) * 8, 1);
    for (const o of this.outgoing) this.drawBottle(o.x - this.cam, o.y, Math.max(0, 1 - o.life / 6));
    for (const st of this.storms) this.drawStorm(st);
    this.drawParticles();
    this.drawShip();

    // Foreground wisps give depth
    this.drawClouds(0.9, 0.95, 0.7, 0.1, 1);
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

    // flora
    for (const f of isl.flora) {
      const sp = floraById[f.type];
      const fx = x - hw + 24 + f.slot * 42;
      const grow = clamp((this.time - f.born) / 1.2, 0, 1);
      this.drawFlora(sp, fx, y - 4, grow, f.slot);
    }

    // gentle affordance: a pulsing ring when tap-to-plant is possible
    const profile = this.hooks.getProfile();
    const sp = floraById[profile.selectedFlora] || FLORA[0];
    if (!this.slow && isl.flora.length < isl.slots && profile.sparks >= sp.cost && x > 20 && x < this.w - 20) {
      const pr = 0.5 + 0.5 * Math.sin(this.time * 3);
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + pr * 0.35})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y - 40, 14 + pr * 3, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 40);
      ctx.lineTo(x + 5, y - 40);
      ctx.moveTo(x, y - 45);
      ctx.lineTo(x, y - 35);
      ctx.stroke();
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
