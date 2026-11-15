import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, inject, viewChild } from '@angular/core';

interface Star {
  x: number;
  y: number;
  r: number;
  /** 0 = far (slow, dim) … 2 = near (faster, brighter). */
  depth: number;
  phase: number;
  speed: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

const FPS = 30;
/** Drift in px per second per depth layer (far → near). */
const DRIFT = [3, 6, 11];

/**
 * Animated deep-space backdrop: parallax starfield with twinkle, slow nebula glows and a rare
 * shooting star. Decorative only (aria-hidden), behind all content, low opacity, ~30 fps,
 * paused when the tab is hidden, static under prefers-reduced-motion.
 */
@Component({
  selector: 'nh-space-backdrop',
  template: `
    <div class="nebula n1"></div>
    <div class="nebula n2"></div>
    <div class="nebula n3"></div>
    <canvas #canvas></canvas>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      overflow: hidden;
    }
    canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .nebula {
      position: absolute;
      border-radius: 50%;
      filter: blur(60px);
      opacity: 0.9;
      will-change: transform;
    }
    .n1 {
      width: 70vmax;
      height: 45vmax;
      right: -18vmax;
      top: -22vmax;
      background: radial-gradient(closest-side, var(--mars-glow), transparent);
      animation: drift-a 48s ease-in-out infinite alternate;
    }
    .n2 {
      width: 60vmax;
      height: 40vmax;
      left: -20vmax;
      bottom: -24vmax;
      background: radial-gradient(closest-side, var(--accent-soft), transparent);
      animation: drift-b 62s ease-in-out infinite alternate;
    }
    .n3 {
      width: 46vmax;
      height: 30vmax;
      left: 30%;
      top: 38%;
      background: radial-gradient(closest-side, var(--crew-soft), transparent);
      opacity: 0.6;
      animation: drift-a 74s ease-in-out infinite alternate-reverse;
    }
    :host-context([data-theme='light']) .nebula {
      opacity: 0.45;
    }
    @keyframes drift-a {
      from {
        transform: translate(0, 0) scale(1) rotate(0deg);
      }
      to {
        transform: translate(-6vmax, 4vmax) scale(1.12) rotate(8deg);
      }
    }
    @keyframes drift-b {
      from {
        transform: translate(0, 0) scale(1);
      }
      to {
        transform: translate(7vmax, -5vmax) scale(1.15);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .nebula {
        animation: none;
      }
    }
  `,
  host: { 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpaceBackdrop implements AfterViewInit {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private stars: Star[] = [];
  private meteors: Meteor[] = [];
  private w = 0;
  private h = 0;
  private raf = 0;
  private last = 0;
  private nextMeteor = 0;
  private colors = { star: 'rgba(220,230,255,0.55)', accent: '#4fd8eb', earth: '#4f8dff', mars: '#e0663f', light: false, at: -1 };

  /**
   * A faint solar system turning in the lower right, seen at an angle: Sun, Mercury to Jupiter.
   * Distances are compressed; periods keep the real order (Earth one turn per ~80 s).
   * Earth and Mars use the mission's illustration colours.
   */
  private drawSolarSystem(ctx: CanvasRenderingContext2D, time: number): void {
    const { star, earth, mars, light } = this.colors;
    // Sun in the right-hand margin; orbits tilted to run up and down along it, so the system
    // stays visible beside the content instead of hiding behind the cards.
    const scale = Math.min(this.h * 0.95, this.w * 0.6);
    const cx = this.w - Math.max(70, this.w * 0.055);
    const cy = this.h * 0.58;
    const tilt = 0.3;
    const rot = -1.2;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const layer = light ? 0.4 : 0.75;

    // Sun glow.
    const sun = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.16);
    sun.addColorStop(0, 'rgba(255, 214, 140, 0.9)');
    sun.addColorStop(0.12, 'rgba(255, 180, 90, 0.55)');
    sun.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.globalAlpha = layer;
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(cx, cy, scale * 0.16, 0, Math.PI * 2);
    ctx.fill();

    const planets = [
      { d: 0.2, period: 19, r: 1.6, color: star },
      { d: 0.32, period: 49, r: 2.4, color: 'rgba(240, 210, 160, 0.9)' },
      { d: 0.46, period: 80, r: 2.8, color: earth },
      { d: 0.62, period: 150, r: 2.3, color: mars },
      { d: 0.95, period: 950, r: 4.6, color: 'rgba(225, 190, 150, 0.9)' },
    ];
    for (const [i, p] of planets.entries()) {
      const rx = p.d * scale;
      const ry = rx * tilt;
      // Orbit ring.
      ctx.globalAlpha = layer * 0.22;
      ctx.strokeStyle = star;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
      ctx.stroke();
      // Planet, with a soft glow; a fixed start angle per planet so they never line up.
      const a = (time / p.period) * Math.PI * 2 + i * 1.7;
      const lx = Math.cos(a) * rx;
      const ly = Math.sin(a) * ry;
      const x = cx + lx * cr - ly * sr;
      const y = cy + lx * sr + ly * cr;
      // Planets behind the sun look slightly smaller and dimmer.
      const near = 0.75 + 0.25 * Math.sin(a);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = layer * 0.25 * near;
      ctx.beginPath();
      ctx.arc(x, y, p.r * 2.6 * near, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = layer * near;
      ctx.beginPath();
      ctx.arc(x, y, p.r * near, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ngAfterViewInit(): void {
    const canvas = this.canvas().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      canvas.width = Math.round(this.w * dpr);
      canvas.height = Math.round(this.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.seed();
      if (reduced) this.draw(ctx, 0, 0);
    };

    // Runs outside Angular: the animation never triggers change detection.
    this.zone.runOutsideAngular(() => {
      resize();
      addEventListener('resize', resize);
      if (!reduced) {
        const loop = (t: number) => {
          this.raf = requestAnimationFrame(loop);
          if (document.hidden || t - this.last < 1000 / FPS) return;
          const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
          this.last = t;
          this.draw(ctx, t / 1000, dt);
        };
        this.raf = requestAnimationFrame(loop);
      }
    });

    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(this.raf);
      removeEventListener('resize', resize);
    });
  }

  /** About one star per 4,500 px², spread over three depths. */
  private seed(): void {
    const n = Math.round((this.w * this.h) / 3000);
    this.stars = Array.from({ length: n }, () => {
      const depth = Math.random() < 0.6 ? 0 : Math.random() < 0.75 ? 1 : 2;
      return {
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        r: depth === 2 ? 1.2 + Math.random() * 0.9 : depth === 1 ? 0.85 + Math.random() * 0.45 : 0.55 + Math.random() * 0.35,
        depth,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.2,
      };
    });
  }

  private draw(ctx: CanvasRenderingContext2D, time: number, dt: number): void {
    // Theme colours, re-read about once a second (theme switches apply without a reload).
    if (time - this.colors.at > 1 || time < this.colors.at) {
      const css = getComputedStyle(document.documentElement);
      const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      this.colors = {
        star: v('--star', this.colors.star),
        accent: v('--accent', this.colors.accent),
        earth: v('--earth', this.colors.earth),
        mars: v('--mars', this.colors.mars),
        light: document.documentElement.getAttribute('data-theme') === 'light',
        at: time,
      };
    }
    const { star, accent } = this.colors;
    ctx.clearRect(0, 0, this.w, this.h);

    // Stars drift slowly left, nearer ones faster (parallax), and twinkle.
    ctx.fillStyle = star;
    for (const s of this.stars) {
      s.x -= DRIFT[s.depth] * dt;
      if (s.x < -2) {
        s.x = this.w + 2;
        s.y = Math.random() * this.h;
      }
      const twinkle = 0.55 + 0.45 * Math.sin(time * s.speed + s.phase);
      const a = Math.min(1, (0.6 + s.depth * 0.35) * twinkle);
      if (s.depth === 2) {
        // Soft halo on the nearest stars.
        ctx.globalAlpha = a * 0.18;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawSolarSystem(ctx, time);

    // Shooting stars: the first about 2 s after load, then every 5–9 s.
    if (dt && !this.nextMeteor) this.nextMeteor = time + 2;
    if (dt && time > this.nextMeteor) {
      {
        const angle = (Math.PI / 180) * (200 + Math.random() * 25);
        const speed = 520 + Math.random() * 260;
        this.meteors.push({ x: this.w * (0.35 + Math.random() * 0.65), y: Math.random() * this.h * 0.4, vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed, life: 0, max: 0.9 + Math.random() * 0.5 });
      }
      this.nextMeteor = time + 5 + Math.random() * 4;
    }
    this.meteors = this.meteors.filter((m) => m.life < m.max);
    for (const m of this.meteors) {
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const fade = Math.sin((m.life / m.max) * Math.PI);
      const tail = 0.12;
      const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * tail, m.y - m.vy * tail);
      g.addColorStop(0, accent);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.55 * fade;
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * tail, m.y - m.vy * tail);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
