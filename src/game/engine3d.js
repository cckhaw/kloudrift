// 3D Journey levels (Three.js). Loaded on demand, so the 2D game never pays for it.
// Same contract as the 2D Engine: one-thumb drag steering with weighty inertia, golden sparks,
// soft-bounce obstacles (never fatal), the shared Weather system for gusts/lightning, and the same
// hooks (onCollect, onToast, onHud, onLevelComplete) so the HUD and menus work unchanged.

import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, FogExp2, AmbientLight, DirectionalLight, PointLight, Group, Mesh,
  SphereGeometry, ConeGeometry, TorusGeometry, CylinderGeometry, IcosahedronGeometry, PlaneGeometry, MeshBasicMaterial, MeshLambertMaterial,
  InstancedMesh, Object3D, BufferGeometry, BufferAttribute, Float32BufferAttribute, DynamicDrawUsage, Points, PointsMaterial, LineSegments, LineBasicMaterial,
  CanvasTexture, AdditiveBlending, DoubleSide, Vector3, SRGBColorSpace,
} from 'three';
import { Weather } from './weather.js';
import { sparkTarget, bonusProgress, evaluateStars, worldOf } from './levels.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

const SHIP_R = 0.9;
const BOUND_X = 13;
const BOUND_Y = 6.5;
const RING_R = 4.2;
const ORB_R = 1.7;
const RAIN_N = 500;
const SNOW_N = 420;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

function bandTexture(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.3, top);
  grad.addColorStop(0.65, bottom);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  return new CanvasTexture(c);
}

// Palette values are sRGB; without the colour space they render far too bright.
/** Wraps (does not copy) an array that is rewritten every frame. */
const dynamic = (arr) => new BufferAttribute(arr, 3).setUsage(DynamicDrawUsage);

const STORM = new Color().setRGB(0.07, 0.07, 0.14, SRGBColorSpace);
const toColor = ([r, g, b]) => new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

export class Engine3D {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.systemReduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.reduceMotion = this.systemReduceMotion;
    this.slow = false;
    this.paused = false;
    this.running = false;

    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(62, 1, 0.1, 700);
    this.glow = glowTexture();

    this.ambient = new AmbientLight(0xffffff, 0.9);
    this.sun = new DirectionalLight(0xffffff, 1.1);
    this.sun.position.set(-8, 14, 6);
    this.scene.add(this.ambient, this.sun);

    this.ship = { x: 0, y: 0, z: 0, vx: 0, vy: 0 };
    this.target = { x: 0, y: 0 };
    this.touching = false;
    this.stats = { sparks: 0, rings: 0, bumps: 0, thermal: 0, bottles: 0 };
    this.level = null;
    this.finished = false;
    this.time = 0;
    this.hudTimer = 0;
    this.bumpCooldown = 0;
    this.trailTimer = 0;
    this.sparksTotal = 0;
    this.world = null;
    this.w = 1;
    this.h = 1;

    this.weather = new Weather(this); // gust / lightning state machine only; drawing is done here
    this.buildShip();
    this.buildParticles();
    this.buildWeatherFx();
    this.bindEvents();
    this.resize();
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
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.touching = false;
  }

  destroy() {
    this.stop();
    this.unbind?.();
    this.disposeWorld();
    this.renderer.dispose();
  }

  setSlow(v) {
    this.slow = v;
    if (v) this.touching = false;
  }

  setPaused(v) {
    this.paused = v;
    if (v) this.touching = false;
  }

  setCalm(v) {
    this.reduceMotion = v || this.systemReduceMotion;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    // keep the full lane in view on tall phones and wide screens alike
    this.camera.fov = this.camera.aspect < 0.7 ? 72 : 62;
    this.camera.updateProjectionMatrix();
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
      this.touching = true;
      this.pointerId = e.pointerId;
      this.setTarget(pos(e));
    };
    const move = (e) => {
      if (this.touching && e.pointerId === this.pointerId) this.setTarget(pos(e));
    };
    const up = (e) => {
      if (e.pointerId === this.pointerId) this.touching = false;
    };
    const resize = () => this.resize();
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    this.unbind = () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }

  /** Screen position → target in the flight lane. The aim sits a little above the finger. */
  setTarget(p) {
    const nx = clamp(p.x / this.w, 0, 1) * 2 - 1;
    const ny = clamp((p.y - 56) / this.h, 0, 1) * 2 - 1;
    this.target.x = nx * BOUND_X;
    this.target.y = -ny * BOUND_Y;
  }

  // ───────────────────────── building blocks ─────────────────────────

  buildShip() {
    const g = new Group();
    const hull = new Mesh(new SphereGeometry(1, 20, 14), new MeshLambertMaterial({ color: 0xdcd6f2 }));
    hull.scale.set(0.8, 0.65, 1.9);
    const fin = new Mesh(new ConeGeometry(0.55, 1.4, 4), new MeshLambertMaterial({ color: 0xcfc6ee }));
    fin.rotation.x = Math.PI / 2;
    fin.position.set(0, 0.25, 1.9);
    const fin2 = fin.clone();
    fin2.rotation.z = Math.PI / 2;
    fin2.position.set(0, 0, 1.9);
    const gondola = new Mesh(new SphereGeometry(0.4, 10, 8), new MeshLambertMaterial({ color: 0x6a5f95 }));
    gondola.position.set(0, -0.62, 0.1);
    gondola.scale.set(1, 0.6, 1.5);
    const lantern = new Mesh(new SphereGeometry(0.22, 12, 10), new MeshBasicMaterial({ color: 0xffd166 }));
    lantern.position.set(0, -0.2, -1.95);
    const halo = new Points(
      new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, -0.2, -1.95], 3)),
      new PointsMaterial({ size: 2.2, map: this.glow, color: 0xffd166, transparent: true, depthWrite: false, blending: AdditiveBlending }),
    );
    this.lanternLight = new PointLight(0xffd166, 2.2, 22);
    this.lanternLight.position.set(0, -0.2, -2.4);
    g.add(hull, fin, fin2, gondola, lantern, halo, this.lanternLight);
    g.scale.setScalar(0.55);
    this.shipMesh = g;
    this.scene.add(g);
  }

  buildParticles() {
    this.pMax = 260;
    this.pData = Array.from({ length: this.pMax }, () => ({ life: 1, max: 1, vx: 0, vy: 0, vz: 0 }));
    const geo = new BufferGeometry();
    this.pPos = new Float32Array(this.pMax * 3).fill(9999);
    this.pCol = new Float32Array(this.pMax * 3);
    geo.setAttribute('position', dynamic(this.pPos));
    geo.setAttribute('color', dynamic(this.pCol));
    this.particles = new Points(
      geo,
      new PointsMaterial({ size: 0.6, map: this.glow, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending }),
    );
    this.particles.frustumCulled = false;
    this.pNext = 0;
    this.scene.add(this.particles);
  }

  burst(x, y, z, hex, n = 12, speed = 4) {
    const col = new Color(hex);
    const count = this.reduceMotion ? Math.ceil(n * 0.4) : n;
    for (let i = 0; i < count; i++) {
      const k = this.pNext++ % this.pMax;
      const a = Math.random() * TAU;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const s = rand(0.4, 1) * speed;
      Object.assign(this.pData[k], { life: 0, max: rand(0.5, 1), vx: Math.cos(a) * Math.cos(b) * s, vy: Math.sin(b) * s, vz: Math.sin(a) * Math.cos(b) * s });
      this.pPos[k * 3] = x;
      this.pPos[k * 3 + 1] = y;
      this.pPos[k * 3 + 2] = z;
      this.pCol.set([col.r, col.g, col.b], k * 3);
    }
  }

  updateParticles(dt) {
    for (let k = 0; k < this.pMax; k++) {
      const d = this.pData[k];
      if (d.life >= d.max) {
        this.pPos[k * 3 + 1] = 9999;
        continue;
      }
      d.life += dt;
      this.pPos[k * 3] += d.vx * dt;
      this.pPos[k * 3 + 1] += d.vy * dt;
      this.pPos[k * 3 + 2] += d.vz * dt;
      d.vx *= 1 - 1.5 * dt;
      d.vy *= 1 - 1.5 * dt;
      d.vz *= 1 - 1.5 * dt;
      const f = 1 - d.life / d.max;
      this.pCol[k * 3] *= 1 - 0.8 * dt * (1 - f);
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;
  }

  buildWeatherFx() {
    // Rain streaks and snow flakes live in a box that follows the camera.
    const rainGeo = new BufferGeometry();
    this.rainPos = new Float32Array(RAIN_N * 6);
    rainGeo.setAttribute('position', dynamic(this.rainPos));
    this.rain = new LineSegments(rainGeo, new LineBasicMaterial({ color: 0xd6e4ff, transparent: true, opacity: 0.8, fog: false }));
    this.rain.frustumCulled = false;
    this.rainSeed = Array.from({ length: RAIN_N }, () => ({ x: rand(-22, 22), y: rand(-14, 14), z: rand(-40, 6) }));

    const snowGeo = new BufferGeometry();
    this.snowPos = new Float32Array(SNOW_N * 3);
    snowGeo.setAttribute('position', dynamic(this.snowPos));
    this.snow = new Points(snowGeo, new PointsMaterial({ size: 0.5, map: this.glow, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    this.snow.frustumCulled = false;
    this.snowSeed = Array.from({ length: SNOW_N }, () => ({ x: rand(-22, 22), y: rand(-12, 14), z: rand(-40, 6), p: Math.random() * TAU }));

    // Wind streaks that announce and show a gust
    const gustGeo = new BufferGeometry();
    this.gustPos = new Float32Array(26 * 6);
    gustGeo.setAttribute('position', dynamic(this.gustPos));
    this.gustLines = new LineSegments(gustGeo, new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    this.gustLines.frustumCulled = false;
    this.gustSeed = Array.from({ length: 26 }, () => ({ a: rand(-1, 1), b: rand(-1, 1), z: rand(-36, 4), len: rand(3, 8) }));

    this.rain.visible = this.snow.visible = this.gustLines.visible = false;
    this.scene.add(this.rain, this.snow, this.gustLines);
  }

  disposeWorld() {
    if (!this.world) return;
    this.world.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
    });
    this.scene.remove(this.world);
    this.world = null;
  }

  // ───────────────────────── level setup ─────────────────────────

  startLevel(level) {
    const theme = worldOf(level).theme;
    this.level = level;
    this.theme = theme;
    this.finished = false;
    this.disposeWorld();
    this.world = new Group();
    this.scene.add(this.world);

    this.time = 0;
    this.stats = { sparks: 0, rings: 0, bumps: 0, thermal: 0, bottles: 0 };
    Object.assign(this.ship, { x: 0, y: 0, z: 0, vx: 0, vy: 0 });
    this.target.x = this.target.y = 0;
    this.camera.position.set(0, 3.2, 9);

    this.bgBase = toColor(theme.sky.bottom).lerp(toColor(theme.sky.top), 0.4);
    this.fogBase = toColor(theme.fog);
    this.scene.background = this.bgBase.clone();
    this.fogColor = this.fogBase.clone();
    this.scene.fog = new FogExp2(this.fogColor, 0.012);
    this.ambient.color.setHex(0xffffff);
    this.ambient.intensity = theme.scene === 'starfall' ? 0.75 : 0.55;
    this.sun.color.setHex(theme.light);
    this.sun.intensity = theme.scene === 'starfall' ? 0.9 : 0.9;

    this.buildSky(theme);
    this.buildScenery(theme, level);
    this.buildOrbs(level);
    this.buildRings(level);
    this.buildObstacles(level);
    this.buildBeacon(level);

    this.weather.set(level.weather, level.gust);
    this.rain.visible = this.weather.precipitating && this.weather.type !== 'snow';
    this.snow.visible = this.weather.precipitating && this.weather.type === 'snow';
    this.gustLines.visible = Boolean(level.gust);
    this.sparksTotal = this.orbs.alive.length;
    this.updateFog();
    this.hooks.onHud(this.hudState()); // switch the HUD to this level immediately
  }

  buildSky(theme) {
    const stars = new BufferGeometry();
    const pts = [];
    for (let i = 0; i < (theme.scene === 'starfall' ? 700 : 260); i++) {
      const v = new Vector3(rand(-1, 1), rand(-0.1, 1), rand(-1, 1)).normalize().multiplyScalar(420);
      pts.push(v.x, v.y, v.z);
    }
    stars.setAttribute('position', new Float32BufferAttribute(pts, 3));
    this.stars = new Points(stars, new PointsMaterial({ size: 2.2, color: 0xffffff, transparent: true, opacity: theme.scene === 'starfall' ? 0.95 : 0.55, sizeAttenuation: false, fog: false }));
    this.stars.frustumCulled = false;
    this.world.add(this.stars);

    this.meteors = [];
    if (theme.scene === 'starfall') {
      // aurora curtains
      this.aurora = [];
      [['rgba(80,200,255,0.32)', 'rgba(120,90,255,0.14)', 36], ['rgba(150,110,255,0.3)', 'rgba(60,220,200,0.12)', 52]].forEach(([a, b, y], i) => {
        const m = new Mesh(
          new PlaneGeometry(420, 46),
          new MeshBasicMaterial({ map: bandTexture(a, b), transparent: true, side: DoubleSide, depthWrite: false, blending: AdditiveBlending, fog: false }),
        );
        m.position.set(0, y, -120 - i * 40);
        m.rotation.x = -0.15;
        this.world.add(m);
        this.aurora.push(m);
      });
      const lines = new BufferGeometry();
      this.meteorPos = new Float32Array(6 * 6);
      lines.setAttribute('position', dynamic(this.meteorPos));
      this.meteorLines = new LineSegments(lines, new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false }));
      this.meteorLines.frustumCulled = false;
      this.world.add(this.meteorLines);
      this.meteors = Array.from({ length: 6 }, () => ({ life: 1, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }));
    }
  }

  buildScenery(theme, level) {
    const span = level.length + 260;
    const dummy = new Object3D();
    if (theme.scene === 'canyon') {
      const n = 520;
      const crystals = new InstancedMesh(new ConeGeometry(1, 1, 5), new MeshLambertMaterial({ flatShading: true }), n);
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const h = rand(10, 30);
        dummy.position.set(side * rand(19, 38), -12 + h / 2 - rand(0, 4), -rand(-30, span));
        dummy.rotation.set(rand(-0.15, 0.15), rand(0, TAU), rand(-0.15, 0.15) + side * 0.12);
        dummy.scale.set(rand(2.5, 6), h, rand(2.5, 6));
        dummy.updateMatrix();
        crystals.setMatrixAt(i, dummy.matrix);
        crystals.setColorAt(i, new Color(theme.crystals[i % theme.crystals.length]).multiplyScalar(rand(0.55, 1)));
      }
      this.world.add(crystals);
      // a few pale spires overhead frame the canyon
      const roof = new InstancedMesh(new ConeGeometry(1, 1, 5), new MeshLambertMaterial({ flatShading: true, color: 0x4a3a78 }), 120);
      for (let i = 0; i < 120; i++) {
        const h = rand(8, 22);
        dummy.position.set(rand(-34, 34), 16 + h / 2, -rand(-30, span));
        dummy.rotation.set(Math.PI, rand(0, TAU), 0);
        dummy.scale.set(rand(2, 5), h, rand(2, 5));
        dummy.updateMatrix();
        roof.setMatrixAt(i, dummy.matrix);
      }
      this.world.add(roof);
      this.floor = new Mesh(new PlaneGeometry(600, span + 400), new MeshLambertMaterial({ color: 0x2a1f4a }));
      this.floor.rotation.x = -Math.PI / 2;
      this.floor.position.set(0, -13, -span / 2);
      this.world.add(this.floor);
    } else {
      const n = 260;
      const rocks = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshLambertMaterial({ flatShading: true }), n);
      for (let i = 0; i < n; i++) {
        dummy.position.set(rand(-60, 60), rand(-30, 30), -rand(-30, span));
        if (Math.abs(dummy.position.x) < 20 && Math.abs(dummy.position.y) < 11) dummy.position.x += dummy.position.x < 0 ? -28 : 28; // keep the lane clear
        dummy.rotation.set(rand(0, TAU), rand(0, TAU), 0);
        dummy.scale.setScalar(rand(1.2, 7));
        dummy.updateMatrix();
        rocks.setMatrixAt(i, dummy.matrix);
        rocks.setColorAt(i, new Color(theme.crystals[i % theme.crystals.length]).multiplyScalar(rand(0.25, 0.6)));
      }
      this.world.add(rocks);
    }
  }

  /** Sparks: ribbons that weave through the lane, drawn as one additive point cloud. */
  buildOrbs(level) {
    const pos = [];
    const per = 8;
    const ribbons = Math.ceil(level.orbs / per);
    const gap = (level.length - 120) / ribbons;
    for (let r = 0; r < ribbons; r++) {
      const z0 = -(60 + r * gap + rand(0, gap * 0.3));
      const cx = rand(-8, 8);
      const cy = rand(-3.5, 3.5);
      const phase = rand(0, TAU);
      const amp = rand(2.5, 5);
      for (let i = 0; i < per; i++) {
        pos.push(
          clamp(cx + Math.sin(phase + i * 0.7) * amp, -BOUND_X + 1.5, BOUND_X - 1.5),
          clamp(cy + Math.cos(phase + i * 0.7) * amp * 0.5, -BOUND_Y + 1, BOUND_Y - 1),
          z0 - i * 4.2,
        );
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    const pts = new Points(geo, new PointsMaterial({ size: 2.6, map: this.glow, color: 0xffd966, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    pts.frustumCulled = false;
    this.world.add(pts);
    this.orbs = { points: pts, alive: Array.from({ length: pos.length / 3 }, (_, i) => i) };
    this.orbArr = geo.attributes.position.array;
  }

  buildRings(level) {
    this.rings = [];
    const gap = (level.length - 200) / level.rings;
    for (let i = 0; i < level.rings; i++) {
      const z = -(120 + i * gap + rand(-gap * 0.15, gap * 0.15));
      const x = rand(-7, 7);
      const y = rand(-3, 3);
      const mesh = new Mesh(new TorusGeometry(RING_R, 0.22, 10, 36), new MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, blending: AdditiveBlending, fog: false }));
      mesh.position.set(x, y, z);
      this.world.add(mesh);
      this.rings.push({ x, y, z, mesh, passed: false });
    }
  }

  buildObstacles(level) {
    // Storm-cloud clusters: always leave a clear lane of at least ~16 units.
    this.blobs = [];
    const gap = (level.length - 260) / level.obstacles;
    for (let i = 0; i < level.obstacles; i++) {
      const z = -(150 + i * gap + rand(0, gap * 0.4));
      const cx = rand(-9, 9);
      const cy = rand(-4, 4);
      const r = rand(3, 4.6);
      this.blobs.push({ x: cx, y: cy, z, r });
      for (let k = 0; k < 3; k++) this.blobs.push({ x: cx + rand(-r, r) * 1.1, y: cy + rand(-r, r) * 0.6, z: z + rand(-r, r), r: r * rand(0.55, 0.85) });
    }
    const inst = new InstancedMesh(new SphereGeometry(1, 14, 10), new MeshLambertMaterial({ color: 0x2a2548, transparent: true, opacity: 0.88 }), this.blobs.length);
    const d = new Object3D();
    this.blobs.forEach((b, i) => {
      d.position.set(b.x, b.y, b.z);
      d.scale.setScalar(b.r);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    this.world.add(inst);
  }

  /** The finish: a tall golden beam inside concentric rings. Fog never hides it. */
  buildBeacon(level) {
    const g = new Group();
    g.position.set(0, 0, -level.length);
    const mat = (o) => new MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: o, blending: AdditiveBlending, depthWrite: false, fog: false });
    const beam = new Mesh(new CylinderGeometry(2.2, 2.2, 160, 20, 1, true), mat(0.35));
    g.add(beam);
    this.beaconRings = [6, 10, 14].map((r, i) => {
      const t = new Mesh(new TorusGeometry(r, 0.35, 10, 48), mat(0.8 - i * 0.2));
      g.add(t);
      return t;
    });
    this.world.add(g);
  }

  // ───────────────────────── simulation ─────────────────────────

  updateFog() {
    const w = this.weather;
    const base = this.theme.scene === 'starfall' ? 0.006 : 0.012;
    this.scene.fog.density = base + w.fog * 0.014 + (w.precipitating ? w.intensity * 0.003 : 0);
    // heavy weather pulls the whole sky toward a dark slate
    const dark = w.precipitating && w.type !== 'snow' ? 0.55 * w.intensity : w.type === 'snow' ? 0.15 * w.intensity : 0;
    this.scene.background.copy(this.bgBase).lerp(STORM, dark);
    this.fogColor.copy(this.fogBase).lerp(STORM, dark);
    this.scene.fog.color.copy(this.fogColor);
  }

  update(dt) {
    if (!this.level) return;
    this.time += dt;
    const { ship, target } = this;
    const active = !this.slow;
    const level = this.level;
    const w = this.weather;

    const gust = w.update(dt, active);
    const headwind = gust.ax < 0 ? gust.grip : 0;
    const speed = level.speed * (1 - 0.45 * headwind) * (this.finished ? 0.5 : 1);

    if (active && !this.finished) {
      const k = (this.touching ? 18 : 2.5) * (1 - 0.5 * gust.grip);
      const c = this.touching ? 7 : 3;
      if (!this.touching) {
        target.x += (ship.x - target.x) * Math.min(1, 1.2 * dt);
        target.y += (ship.y - target.y) * Math.min(1, 1.2 * dt);
      }
      const GUST = 0.04; // 2D pixel strength → world units
      let ax = (target.x - ship.x) * k - ship.vx * c;
      let ay = (target.y - ship.y) * k - ship.vy * c - gust.ay * GUST; // weather uses screen-down as +y
      // soft walls: a cushion of air, not a collision
      if (Math.abs(ship.x) > BOUND_X) ax -= (ship.x - Math.sign(ship.x) * BOUND_X) * 40;
      if (Math.abs(ship.y) > BOUND_Y) ay -= (ship.y - Math.sign(ship.y) * BOUND_Y) * 40;
      ship.vx += ax * dt;
      ship.vy += ay * dt;
      const sp = Math.hypot(ship.vx, ship.vy);
      if (sp > 30) {
        ship.vx *= 30 / sp;
        ship.vy *= 30 / sp;
      }
      const prevZ = ship.z;
      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      ship.z -= speed * dt;
      this.collide(dt, prevZ);
    } else {
      ship.z -= speed * dt;
    }

    // ship pose and camera
    const m = this.shipMesh;
    m.position.set(ship.x, ship.y + Math.sin(this.time * 2) * 0.05, ship.z);
    m.rotation.z = lerp(m.rotation.z, -clamp(ship.vx * 0.06, -0.5, 0.5), Math.min(1, 6 * dt));
    m.rotation.x = lerp(m.rotation.x, clamp(ship.vy * 0.04, -0.35, 0.35), Math.min(1, 6 * dt));
    m.rotation.y = lerp(m.rotation.y, -clamp(ship.vx * 0.025, -0.25, 0.25), Math.min(1, 6 * dt));
    this.lanternLight.intensity = 2 + Math.sin(this.time * 4) * 0.25;

    const cam = this.camera;
    cam.position.x = lerp(cam.position.x, ship.x * 0.6, Math.min(1, 4 * dt));
    cam.position.y = lerp(cam.position.y, ship.y * 0.6 + 3.2, Math.min(1, 4 * dt));
    cam.position.z = ship.z + 9;
    cam.lookAt(ship.x * 0.4, ship.y * 0.4, ship.z - 14);

    // sky follows the camera so it never runs out
    if (this.stars) this.stars.position.copy(cam.position);
    this.aurora?.forEach((a, i) => {
      a.position.z = cam.position.z - 120 - i * 40;
      a.position.x = cam.position.x + Math.sin(this.time * 0.1 + i) * 20;
    });
    if (this.floor) this.floor.position.z = ship.z - 100;

    this.beaconRings?.forEach((r, i) => r.scale.setScalar(1 + 0.06 * Math.sin(this.time * 2.4 + i)));
    this.updateWeatherFx(dt, gust);
    this.updateMeteors(dt);
    this.trail(dt);
    this.updateParticles(dt);

    // trail uses world coordinates; lightning brightens the whole scene for an instant
    this.ambient.intensity = (this.theme.scene === 'starfall' ? 0.75 : 0.55) + w.flash * 1.6;

    if (!this.finished && active && -ship.z >= level.length) this.finishLevel();

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.hooks.onHud(this.hudState());
    }
  }

  collide(dt, prevZ) {
    const { ship, level } = this;

    // Sparks
    const arr = this.orbArr;
    let changed = false;
    for (let n = this.orbs.alive.length - 1; n >= 0; n--) {
      const i = this.orbs.alive[n];
      const dz = arr[i * 3 + 2] - ship.z;
      if (dz > ORB_R || dz < -ORB_R) continue;
      const dx = arr[i * 3] - ship.x;
      const dy = arr[i * 3 + 1] - ship.y;
      if (dx * dx + dy * dy + dz * dz < ORB_R * ORB_R) {
        this.burst(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2], 0xffe08a, 10, 3);
        arr[i * 3 + 1] = 9999;
        this.orbs.alive.splice(n, 1);
        this.stats.sparks++;
        this.hooks.audio?.spark(1);
        this.hooks.onCollect(1);
        changed = true;
      }
    }
    if (changed) this.orbs.points.geometry.attributes.position.needsUpdate = true;

    // Rings: a clean pass through the centre; missing one costs nothing
    for (const r of this.rings) {
      if (r.passed) continue;
      if (prevZ > r.z && ship.z <= r.z) {
        r.passed = true; // a ring is only ever judged once
        if (Math.hypot(ship.x - r.x, ship.y - r.y) < RING_R * 0.95) {
          this.stats.rings++;
          r.mesh.material.color.setHex(0xffffff);
          this.burst(r.x, r.y, r.z, 0xffd166, 28, 6);
          this.hooks.audio?.ring();
          this.hooks.onCollect(2);
          this.hooks.onToast(`Ring ${this.stats.rings}`);
        } else {
          r.mesh.material.opacity = 0.25;
        }
      }
    }

    // Storm clouds: a soft cushion, never fatal
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    for (const b of this.blobs) {
      const dz = ship.z - b.z;
      if (dz > b.r + 2 || dz < -(b.r + 2)) continue;
      const dx = ship.x - b.x;
      const dy = ship.y - b.y;
      const d = Math.hypot(dx, dy, dz) || 0.001;
      const min = b.r * 0.9 + SHIP_R;
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
        ship.vx += nx * 40 * dt;
        ship.vy += ny * 40 * dt;
        if (this.bumpCooldown === 0) {
          this.bumpCooldown = 0.8;
          this.stats.bumps++;
          this.hooks.audio?.bump();
          navigator.vibrate?.(12);
          this.burst(ship.x, ship.y, ship.z - 1, 0xb8b2e6, 10, 3);
          this.hooks.onToast('The wind cushions you');
        }
      }
    }
  }

  trail(dt) {
    this.trailTimer -= dt;
    if (this.trailTimer > 0 || this.reduceMotion) return;
    this.trailTimer = 0.05;
    const k = this.pNext++ % this.pMax;
    Object.assign(this.pData[k], { life: 0, max: rand(0.25, 0.45), vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3), vz: 2 });
    this.pPos[k * 3] = this.ship.x;
    this.pPos[k * 3 + 1] = this.ship.y;
    this.pPos[k * 3 + 2] = this.ship.z + 1.3;
    this.pCol.set([0.2, 0.42, 0.56], k * 3);
  }

  updateMeteors(dt) {
    if (!this.meteorLines) return;
    const cam = this.camera.position;
    if (!this.reduceMotion && Math.random() < 0.7 * dt * (this.level.weather.type === 'breeze' ? 3 : 1)) {
      const m = this.meteors.find((q) => q.life >= q.max);
      if (m) Object.assign(m, { life: 0, max: rand(0.6, 1.1), x: cam.x + rand(-60, 60), y: cam.y + rand(25, 50), z: cam.z - rand(80, 160), vx: rand(-40, -80), vy: -rand(30, 60), vz: rand(10, 30) });
    }
    this.meteors.forEach((m, i) => {
      if (m.life < m.max) {
        m.life += dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.z += m.vz * dt;
        this.meteorPos.set([m.x, m.y, m.z, m.x - m.vx * 0.09, m.y - m.vy * 0.09, m.z - m.vz * 0.09], i * 6);
      } else {
        this.meteorPos.fill(0, i * 6, i * 6 + 6);
      }
    });
    this.meteorLines.geometry.attributes.position.needsUpdate = true;
  }

  updateWeatherFx(dt, gust) {
    const w = this.weather;
    const cam = this.camera.position;
    this.updateFog();

    if (this.rain.visible) {
      const count = Math.floor(RAIN_N * clamp(w.intensity, 0.15, 1) * (this.reduceMotion ? 0.4 : 1));
      for (let i = 0; i < RAIN_N; i++) {
        const s = this.rainSeed[i];
        s.y -= 38 * dt;
        s.x -= (2 + gust.grip * 6) * dt;
        if (s.y < -14) { s.y = 14; s.x = rand(-22, 22); }
        const vis = i < count;
        const x = cam.x + s.x;
        const y = cam.y + s.y;
        const z = cam.z + s.z;
        this.rainPos.set(vis ? [x, y, z, x + 0.25, y + 2.2, z] : [0, 9999, 0, 0, 9999, 0], i * 6);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    if (this.snow.visible) {
      const count = Math.floor(SNOW_N * clamp(w.intensity, 0.15, 1) * (this.reduceMotion ? 0.4 : 1));
      for (let i = 0; i < SNOW_N; i++) {
        const s = this.snowSeed[i];
        s.y -= 3.2 * dt;
        s.x += Math.sin(this.time + s.p) * 0.8 * dt - gust.grip * 4 * dt;
        if (s.y < -12) { s.y = 14; s.x = rand(-22, 22); }
        this.snowPos.set(i < count ? [cam.x + s.x, cam.y + s.y, cam.z + s.z] : [0, 9999, 0], i * 3);
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }

    // Gust streaks: visible during the warning and the blow, travelling the way the wind goes
    const g = w.gust;
    const vis = g.state === 'warn' ? 0.3 : g.state === 'blow' ? 0.3 + 0.6 * g.env : 0;
    this.gustLines.material.opacity = vis * 0.7;
    if (vis > 0) {
      const [dx, dy] = g.dir.dir;
      for (let i = 0; i < this.gustSeed.length; i++) {
        const s = this.gustSeed[i];
        s.z += 70 * dt;
        if (s.z > 6) s.z = -36;
        // streaks drift sideways/vertically with the wind (screen +y is down)
        const x = cam.x + s.a * 12 + dx * (s.z + 20) * 0.3;
        const y = cam.y + s.b * 7 - dy * (s.z + 20) * 0.3;
        const z = cam.z + s.z;
        this.gustPos.set([x, y, z, x - dx * s.len * 0.4, y + dy * s.len * 0.4, z - s.len], i * 6);
      }
      this.gustLines.geometry.attributes.position.needsUpdate = true;
    }
  }

  // ───────────────────────── level state ─────────────────────────

  hudState() {
    const level = this.level;
    const b = bonusProgress(level.bonus, this.stats, this.sparksTotal);
    return {
      mode: 'level',
      altitude: 0,
      zone: '',
      inThermal: false,
      levelName: level.name,
      progress: Math.round(clamp(-this.ship.z / level.length, 0, 1) * 100),
      sparks: this.stats.sparks,
      sparkTarget: sparkTarget(this.sparksTotal),
      bonusLabel: level.bonus.label,
      bonusValue: b.value,
      bonusTarget: b.target,
      bonusDone: b.done,
      bonusType: level.bonus.type,
      weather: this.weather.type,
      fog: this.weather.fog > 0,
    };
  }

  finishLevel() {
    this.finished = true;
    const stars = evaluateStars(this.level, this.stats, this.sparksTotal);
    this.burst(this.ship.x, this.ship.y, this.ship.z - 2, 0xffd166, 60, 8);
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
}
