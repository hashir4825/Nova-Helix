import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { CrewModeApi } from '../../core/data/apis';
import { AnswerValue } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { SessionStore } from '../../core/state/session';
import { formatDelay, formatMissionTime } from '../../core/util/format';
import { Icon } from '../../shared/ui/icon';
import { ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';
import { ScalePicker } from './scale-picker';

/** One question at a time, saved as you go, resumable. */
@Component({
  selector: 'nh-questionnaire-runner',
  imports: [RouterLink, ScalePicker, Icon, Skeleton],
  templateUrl: './questionnaire-runner.html',
  styleUrl: './questionnaire-runner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class QuestionnaireRunner {
  /** Route param. */
  readonly id = input.required<string>();

  private readonly api = inject(CrewModeApi);
  private readonly router = inject(Router);
  private readonly clock = inject(MissionClock);
  protected readonly icons = ICON;
  protected readonly surgeon = this.clock.config.team.flightSurgeon;
  private readonly heading = viewChild<ElementRef<HTMLElement>>('qHeading');

  constructor() {
    inject(SessionStore).role.set('astronaut');
    // Initialise local state once from the saved assignment (resume where left off).
    effect(() => {
      const a = this.assignment();
      if (!a || this.loaded()) return;
      untracked(() => {
        this.answers.set({ ...a.answers });
        const q = this.qs()?.[a.questionnaireId];
        this.index.set(Math.min(a.currentIndex, (q?.questions.length ?? 1) - 1));
        this.finished.set(a.status === 'done');
        this.resumed.set(a.status === 'in-progress' && a.currentIndex > 0);
        this.loaded.set(true);
      });
    });
    // Move focus to each new question for screen-reader and keyboard users.
    effect(() => {
      this.index();
      const h = this.heading();
      if (h && this.loaded()) queueMicrotask(() => h.nativeElement.focus());
    });
  }

  protected readonly assignment = toSignal(toObservable(this.id).pipe(switchMap((id) => this.api.assignment(id))));
  protected readonly qs = toSignal(this.api.questionnaires());
  protected readonly q = computed(() => {
    const a = this.assignment();
    const qs = this.qs();
    return a && qs ? qs[a.questionnaireId] : null;
  });

  private readonly loaded = signal(false);
  protected readonly answers = signal<Record<string, AnswerValue>>({});
  protected readonly index = signal(0);
  protected readonly finished = signal(false);
  protected readonly resumed = signal(false);
  protected readonly submitting = signal(false);

  protected readonly question = computed(() => this.q()?.questions[this.index()] ?? null);
  protected readonly total = computed(() => this.q()?.questions.length ?? 0);
  protected readonly isLast = computed(() => this.index() === this.total() - 1);
  protected readonly current = computed(() => {
    const q = this.question();
    return q ? this.answers()[q.id] : undefined;
  });
  protected readonly canNext = computed(() => {
    const q = this.question();
    if (!q) return false;
    if (q.optional) return true;
    const v = this.current();
    return q.kind === 'scale' ? typeof v === 'number' : typeof v === 'string' && v.trim().length > 0;
  });
  protected readonly progress = computed(() => (this.total() ? ((this.index() + (this.canNext() ? 1 : 0)) / this.total()) * 100 : 0));
  protected readonly delay = computed(() => formatDelay(this.clock.link().delaySeconds));
  protected readonly completedAt = computed(() => {
    const a = this.assignment();
    return a?.completedAt !== undefined ? formatMissionTime(a.completedAt) : '';
  });

  protected scaleValue(): number | null {
    const v = this.current();
    return typeof v === 'number' ? v : null;
  }

  protected setAnswer(v: AnswerValue | null): void {
    const q = this.question();
    if (!q || v === null) return;
    this.answers.update((a) => ({ ...a, [q.id]: v }));
    this.save();
  }

  private save(): void {
    this.api.saveProgress(this.id(), this.answers(), this.index()).subscribe();
  }

  protected next(): void {
    if (!this.canNext()) return;
    if (this.isLast()) {
      this.submit();
      return;
    }
    this.index.update((i) => i + 1);
    this.save();
  }

  protected back(): void {
    if (this.index() > 0) {
      this.index.update((i) => i - 1);
      this.save();
    }
  }

  private submit(): void {
    this.submitting.set(true);
    this.api.submitQuestionnaire(this.id(), this.answers()).subscribe(() => {
      this.submitting.set(false);
      this.finished.set(true);
    });
  }

  protected labelFor(qid: string): string {
    const q = this.q()?.questions.find((x) => x.id === qid);
    const v = this.answers()[qid];
    if (!q || v === undefined || v === '') return 'Skipped';
    if (typeof v === 'string') return `“${v}”`;
    return q.options?.find((o) => o.value === v)?.label ?? String(v);
  }

  protected onKey(e: KeyboardEvent): void {
    if (this.finished() || e.target instanceof HTMLTextAreaElement) return;
    const q = this.question();
    if (q?.kind === 'scale' && /^[1-5]$/.test(e.key)) {
      this.setAnswer(Number(e.key));
    } else if (e.key === 'Enter' && this.canNext() && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      this.next();
    }
  }

  protected exit(): void {
    this.router.navigate(['/checkin']);
  }
}
