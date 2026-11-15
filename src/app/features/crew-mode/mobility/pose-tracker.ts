import type { DrawingUtils, PoseLandmarker } from '@mediapipe/tasks-vision';
import { FrameInfo, frameInfo } from './pose-tests';

/*
 * Runs MediaPipe PoseLandmarker (lite model, VIDEO mode) on a <video> and draws the
 * skeleton on a <canvas> overlay. Everything stays on the device: frames are never
 * stored or sent. WASM and model are served from our own assets so it works offline.
 */

const WASM_PATH = 'mediapipe/wasm';
const MODEL_PATH = 'mediapipe/pose_landmarker_lite.task';

export type FrameCallback = (info: FrameInfo | null) => void;

export class PoseTracker {
  private landmarker: PoseLandmarker | null = null;
  private drawing: DrawingUtils | null = null;
  private connections: { start: number; end: number }[] = [];
  private stopped = false;
  private lastTs = -1;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly onFrame: FrameCallback,
    private readonly colors: { bone: string; joint: string },
  ) {}

  /** Loads the model (GPU first, CPU fallback) and starts the frame loop. */
  async start(): Promise<void> {
    const vision = await import('@mediapipe/tasks-vision');
    const base = (p: string) => new URL(p, document.baseURI).href;
    const fileset = await vision.FilesetResolver.forVisionTasks(base(WASM_PATH));
    const make = (delegate: 'GPU' | 'CPU') =>
      vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: base(MODEL_PATH), delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    try {
      this.landmarker = await make('GPU');
    } catch {
      this.landmarker = await make('CPU');
    }
    if (this.stopped) {
      this.landmarker.close();
      return;
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    this.drawing = new vision.DrawingUtils(ctx);
    this.connections = vision.PoseLandmarker.POSE_CONNECTIONS;
    this.loop();
  }

  private readonly loop = (): void => {
    if (this.stopped) return;
    const v = this.video;
    const lm = this.landmarker;
    if (lm && !v.paused && !v.ended && v.readyState >= 2 && v.videoWidth) {
      if (this.canvas.width !== v.videoWidth) this.canvas.width = v.videoWidth;
      if (this.canvas.height !== v.videoHeight) this.canvas.height = v.videoHeight;
      const ts = Math.max(performance.now(), this.lastTs + 1);
      this.lastTs = ts;
      const res = lm.detectForVideo(v, ts);
      const ctx = this.canvas.getContext('2d');
      ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const lms = res.landmarks?.[0];
      if (lms && this.drawing) {
        this.drawing.drawConnectors(lms, this.connections, { color: this.colors.bone, lineWidth: 4 });
        this.drawing.drawLandmarks(lms, { color: this.colors.joint, fillColor: this.colors.joint, radius: 3 });
        this.onFrame(frameInfo(lms, v.videoWidth, v.videoHeight));
      } else {
        this.onFrame(null);
      }
    }
    if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(() => this.loop());
    else requestAnimationFrame(this.loop);
  };

  stop(): void {
    this.stopped = true;
    this.landmarker?.close();
    this.landmarker = null;
  }
}
