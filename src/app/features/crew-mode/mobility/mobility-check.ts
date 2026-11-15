import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { MobilityApi } from '../../../core/data/apis';
import { MobilityMeasurement, MobilitySubmission, MobilityTestResult } from '../../../core/models';
import { MissionClock } from '../../../core/state/mission-clock';
import { SessionStore } from '../../../core/state/session';
import { formatDelay } from '../../../core/util/format';
import { HelpHint } from '../../../shared/tooltip/help-hint';
import { TipDirective } from '../../../shared/tooltip/tip.directive';
import { Icon } from '../../../shared/ui/icon';
import { ICON } from '../../../shared/ui/icons';
import { Skeleton } from '../../../shared/ui/skeleton';
import { StatusBadge } from '../../../shared/ui/status-badge';
import { FrameInfo, TESTS, TestKey, TestStep, TestValues, round } from './pose-tests';
import { PoseTracker } from './pose-tracker';

interface Done {
  values: TestValues;
  conf: number;
  summary: string;
}

const COUNTDOWN_S = 3;
/** Below this, tell the astronaut how to fix the view. Matches the API's minimum pose confidence. */
const POOR_TRACKING = 0.6;

const STEP_ICON: Record<TestKey, string> = { balance: '1', sit_to_stand: '2', squat_rom: '3' };

/** Set-up the method's instructions don't already cover. */
const SETUP: Record<TestKey, string> = {
  balance: 'Side-on to the camera.',
  sit_to_stand: 'You need a chair, side-on to the camera. Start seated.',
  squat_rom: '',
};

/** Mobility & balance check (`/checkin/mobility`): three movement tests measured on the device. */
@Component({
  selector: 'nh-mobility-check',
  imports: [RouterLink, Icon, Skeleton, StatusBadge, TipDirective, HelpHint],
  templateUrl: './mobility-check.html',
  styleUrl: './mobility-check.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobilityCheck {
  private readonly api = inject(MobilityApi);
  protected readonly clock = inject(MissionClock);
  protected readonly session = inject(SessionStore);
  protected readonly icons = ICON;
  protected readonly stepNo = STEP_ICON;
  protected readonly setup = SETUP;
  protected readonly surgeon = this.clock.config.team.flightSurgeon;

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('overlay');

  protected readonly method = toSignal(this.api.method());
  protected readonly history = toSignal(toObservable(this.session.astronautId).pipe(switchMap((id) => this.api.history(id))));

  constructor() {
    this.session.role.set('astronaut');
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  // ── Source & model ──────────────────────────────────────────────
  protected readonly source = signal<'camera' | 'file' | null>(null);
  protected readonly modelState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly sourceError = signal<string | null>(null);
  private tracker: PoseTracker | null = null;
  private stream: MediaStream | null = null;
  private objectUrl: string | null = null;

  protected async useCamera(): Promise<void> {
    this.sourceError.set(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.sourceError.set('The camera needs a secure page (https or localhost). Open Nova Healix over https and try again.');
      return;
    }
    try {
      this.releaseSource();
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      const v = this.video().nativeElement;
      v.srcObject = this.stream;
      v.loop = false;
      this.source.set('camera');
      await v.play();
      await this.ensureModel();
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      this.sourceError.set(
        name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this page in the browser settings, then try again.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No camera was found. Connect a camera, or use a recorded video.'
            : name === 'NotReadableError'
              ? 'The camera is in use by another app. Close it and try again.'
              : `The camera could not start: ${e instanceof Error ? e.message : 'unknown error'}`,
      );
      this.source.set(null);
    }
  }

  protected async useFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.sourceError.set(null);
    this.releaseSource();
    this.objectUrl = URL.createObjectURL(file);
    const v = this.video().nativeElement;
    v.srcObject = null;
    v.src = this.objectUrl;
    v.loop = true;
    v.muted = true;
    this.source.set('file');
    try {
      await v.play();
    } catch {
      // Autoplay can be refused; the first test start plays it.
    }
    await this.ensureModel();
  }

  private async ensureModel(): Promise<void> {
    if (this.tracker) return;
    this.modelState.set('loading');
    const css = getComputedStyle(document.documentElement);
    const tracker = new PoseTracker(this.video().nativeElement, this.canvas().nativeElement, (i) => this.onFrame(i), {
      bone: css.getPropertyValue('--crew').trim() || '#a78bfa',
      joint: css.getPropertyValue('--text-1').trim() || '#ffffff',
    });
    this.tracker = tracker;
    try {
      await tracker.start();
      this.modelState.set('ready');
    } catch (e) {
      console.error(e);
      this.tracker = null;
      this.modelState.set('error');
      this.sourceError.set('The pose model could not load. Reload the page and try again.');
    }
  }

  private releaseSource(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  private teardown(): void {
    this.cancel();
    this.tracker?.stop();
    this.tracker = null;
    this.releaseSource();
  }

  // ── Live tracking ───────────────────────────────────────────────
  /** Rounded readouts, updated a few times a second (not every frame). */
  protected readonly live = signal<{ flex: number | null; conf: number } | null>(null);
  protected readonly tracking = signal<'none' | 'poor' | 'ok'>('none');
  private lastLive = 0;
  private recentConf: number[] = [];

  private onFrame(info: FrameInfo | null): void {
    const now = performance.now();
    if (info) this.recentConf = [...this.recentConf.slice(-14), info.conf];
    if (now - this.lastLive > 200) {
      this.lastLive = now;
      this.live.set(info ? { flex: info.flex === null ? null : Math.round(info.flex), conf: Math.round(info.conf * 100) } : null);
      const c = this.recentConf.reduce((s, x) => s + x, 0) / (this.recentConf.length || 1);
      this.tracking.set(!info ? 'none' : c < POOR_TRACKING ? 'poor' : 'ok');
      if (!info) this.recentConf = [];
    }
    const run = this.run;
    if (!run || now / 1000 < run.startAt) return;
    if (!info) {
      this.banner.set('No person detected: step back so your whole body is in view');
      return;
    }
    const out = run.step(info, now / 1000 - run.startAt);
    this.banner.set(out.banner);
    this.progress.set(out.progress ?? '');
    if (out.done) this.complete(run.key, out.values ?? null, out.conf ?? 0, out.banner);
  }

  // ── Tests ───────────────────────────────────────────────────────
  private run: { key: TestKey; step: TestStep; startAt: number } | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  protected readonly running = signal<TestKey | null>(null);
  protected readonly countdown = signal(0);
  protected readonly banner = signal('');
  protected readonly progress = signal('');
  protected readonly done = signal<Partial<Record<TestKey, Done>>>({});
  protected readonly failed = signal<Partial<Record<TestKey, string>>>({});

  protected readonly steps = computed(() => this.method()?.tests ?? []);
  protected readonly current = computed<TestKey | null>(() => this.steps().find((s) => !this.done()[s.test])?.test ?? null);
  protected readonly allDone = computed(() => this.steps().length > 0 && this.current() === null);
  protected readonly ready = computed(() => this.modelState() === 'ready' && this.source() !== null);

  protected async startTest(key: TestKey): Promise<void> {
    if (!this.ready() || this.running()) return;
    const v = this.video().nativeElement;
    if (v.paused) await v.play().catch(() => undefined);
    this.submission.set(null);
    this.failed.update((f) => ({ ...f, [key]: undefined }));
    const startAt = performance.now() / 1000 + COUNTDOWN_S;
    this.run = { key, step: TESTS[key](), startAt };
    this.running.set(key);
    this.progress.set('');
    this.banner.set('Get ready');
    this.countdown.set(COUNTDOWN_S);
    this.countdownTimer = setInterval(() => {
      const left = Math.ceil(startAt - performance.now() / 1000);
      this.countdown.set(Math.max(0, left));
      if (left <= 0 && this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    }, 100);
  }

  protected cancel(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
    this.run = null;
    this.running.set(null);
    this.countdown.set(0);
    this.progress.set('');
    this.banner.set('');
  }

  private complete(key: TestKey, values: TestValues | null, conf: number, summary: string): void {
    this.cancel();
    if (!values) {
      this.failed.update((f) => ({ ...f, [key]: summary }));
      return;
    }
    this.done.update((d) => ({ ...d, [key]: { values, conf, summary } }));
  }

  protected redo(key: TestKey): void {
    this.done.update((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    void this.startTest(key);
  }

  protected restart(): void {
    this.cancel();
    this.done.set({});
    this.failed.set({});
    this.submission.set(null);
    this.submitError.set(null);
  }

  /** The only data that leaves the device. */
  protected readonly measurement = computed<MobilityMeasurement | null>(() => {
    const d = this.done();
    const b = d.balance;
    const s = d.sit_to_stand;
    const q = d.squat_rom;
    if (!b || !s || !q) return null;
    return {
      balanceHoldS: b.values.balance_hold_s ?? 0,
      swayPctHeight: b.values.sway_pct_height ?? 0,
      sitToStand5xS: s.values.sit_to_stand_5x_s ?? 0,
      kneeFlexionDeg: q.values.knee_flexion_deg ?? 0,
      poseConfidence: round((b.conf + s.conf + q.conf) / 3, 3),
    };
  });

  // ── Submit ──────────────────────────────────────────────────────
  protected readonly submitting = signal(false);
  protected readonly submission = signal<MobilitySubmission | null>(null);
  protected readonly submitError = signal<string | null>(null);
  protected readonly delay = computed(() => formatDelay(this.clock.link().delaySeconds));

  protected send(): void {
    const m = this.measurement();
    if (!m || this.submitting()) return;
    this.submitting.set(true);
    this.submitError.set(null);
    this.api.submit(this.session.astronautId(), m).subscribe({
      next: (s) => {
        this.submitting.set(false);
        this.submission.set(s);
        if (!s.counted) this.done.set({});
      },
      error: (e: unknown) => {
        this.submitting.set(false);
        this.submitError.set(e instanceof Error ? e.message : 'The check could not be sent. Try again.');
      },
    });
  }

  // ── Formatting ──────────────────────────────────────────────────
  protected doneValue(key: TestKey): string {
    const v = this.done()[key]?.values;
    if (!v) return '';
    if (key === 'balance') return `${v.balance_hold_s?.toFixed(1)} s · sway ${v.sway_pct_height?.toFixed(1)}%`;
    if (key === 'sit_to_stand') return `${v.sit_to_stand_5x_s?.toFixed(1)} s`;
    return `${v.knee_flexion_deg?.toFixed(0)}°`;
  }

  protected doneConf(key: TestKey): number {
    return Math.round((this.done()[key]?.conf ?? 0) * 100);
  }

  /** Main number of a scored test, with the first-check reference and change. */
  protected resultLine(t: MobilityTestResult): { value: string; ref: string | null; change: string | null } {
    const [k, v] = Object.entries(t.values)[0] ?? ['', 0];
    const deg = k.endsWith('_deg');
    const f = (x: number) => (deg ? `${x.toFixed(0)}°` : `${x.toFixed(1)} s`);
    const base = t.baseline?.[k];
    const ch = t.changePct[k];
    return {
      value: f(v),
      ref: base !== undefined ? f(base) : null,
      change: ch !== undefined && Math.abs(ch) >= 1 ? (ch > 0 ? `${ch.toFixed(0)}% worse` : `${Math.abs(ch).toFixed(0)}% better`) : null,
    };
  }

  protected readonly helpTip = {
    title: 'Mobility & balance check',
    body: 'Three short movement tests, about 2 minutes. The camera tracks your body on this device to measure balance, leg strength (sit-to-stand time) and knee bend. Weightlessness weakens leg muscles and balance, so a regular check catches a decline early.',
    hint: 'Only the five measured numbers are sent. No video leaves this device.',
  };

  protected readonly sharedTip = {
    title: 'Shared with Mission Control',
    body: 'The five numbers shown before sending go to your flight surgeon and update your Gravity hazard. The video itself never leaves this device.',
  };
}
