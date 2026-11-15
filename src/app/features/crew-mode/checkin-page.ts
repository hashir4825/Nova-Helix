import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { combineLatest, switchMap } from 'rxjs';
import { CrewModeApi, TelemetryApi } from '../../core/data/apis';
import { CheckIn, QuestionOption, SYMPTOM_LABEL, Symptom } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { SessionStore } from '../../core/state/session';
import { formatClock, formatDelay } from '../../core/util/format';
import { HelpHint } from '../../shared/tooltip/help-hint';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { Icon } from '../../shared/ui/icon';
import { ICON } from '../../shared/ui/icons';
import { Skeleton } from '../../shared/ui/skeleton';
import { ScalePicker } from './scale-picker';

const MOOD: QuestionOption[] = [
  { value: 1, label: 'Very low' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Very good' },
];
const SLEEP: QuestionOption[] = [
  { value: 1, label: 'Very poor' },
  { value: 2, label: 'Poor' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Very good' },
];
const ENERGY: QuestionOption[] = [
  { value: 1, label: 'Very low' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'High' },
  { value: 5, label: 'Very high' },
];
const SYMPTOMS: Symptom[] = ['headache', 'nausea', 'vision', 'back-pain', 'congestion', 'other'];

@Component({
  selector: 'nh-checkin-page',
  imports: [RouterLink, ScalePicker, Icon, Skeleton, TipDirective, HelpHint],
  templateUrl: './checkin-page.html',
  styleUrl: './checkin-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckinPage {
  private readonly api = inject(CrewModeApi);
  private readonly telemetry = inject(TelemetryApi);
  protected readonly clock = inject(MissionClock);
  protected readonly session = inject(SessionStore);
  protected readonly icons = ICON;
  protected readonly moodOpts = MOOD;
  protected readonly sleepOpts = SLEEP;
  protected readonly energyOpts = ENERGY;
  protected readonly symptomList = SYMPTOMS;
  protected readonly symptomLabel = SYMPTOM_LABEL;
  protected readonly symptomLabelOf = (s: Symptom): string => SYMPTOM_LABEL[s];
  protected readonly surgeon = this.clock.config.team.flightSurgeon;

  constructor() {
    this.session.role.set('astronaut');
  }

  private readonly crew$ = toObservable(this.session.astronautId);

  // Form state
  protected readonly mood = signal<number | null>(null);
  protected readonly sleep = signal<number | null>(null);
  protected readonly energy = signal<number | null>(null);
  protected readonly symptoms = signal<Symptom[]>([]);
  protected readonly note = signal('');
  protected readonly editing = signal(false);
  protected readonly sending = signal(false);
  protected readonly justSent = signal<CheckIn | null>(null);

  protected readonly complete = computed(() => this.mood() !== null && this.sleep() !== null && this.energy() !== null);

  /** Today's check-in, if any. */
  private readonly recent = toSignal(
    combineLatest([this.crew$, toObservable(this.clock.queryHour)]).pipe(
      switchMap(([id, h]) => this.telemetry.checkIns(id, h - 24, h + 1)),
    ),
  );
  protected readonly today = computed(() => this.recent()?.find((c) => c.day === this.clock.day()) ?? null);
  protected readonly showForm = computed(() => this.editing() || (this.recent() !== undefined && !this.today()));

  protected readonly assignments = toSignal(this.crew$.pipe(switchMap((id) => this.api.assignments(id))));
  protected readonly questionnaires = toSignal(this.api.questionnaires());
  protected readonly items = computed(() => {
    const list = this.assignments();
    const qs = this.questionnaires();
    if (!list || !qs) return null;
    return list
      .map((a) => {
        const q = qs[a.questionnaireId];
        const answered = Object.keys(a.answers).length;
        return { a, q, answered, total: q.questions.length };
      })
      .sort((x, y) => Number(x.a.status === 'done') - Number(y.a.status === 'done') || x.a.dueDay - y.a.dueDay);
  });
  protected readonly openCount = computed(() => this.items()?.filter((i) => i.a.status !== 'done').length ?? 0);

  protected readonly delay = computed(() => formatDelay(this.clock.link().delaySeconds));

  protected toggleSymptom(s: Symptom): void {
    this.symptoms.update((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));
  }

  protected edit(): void {
    const t = this.today();
    if (t) {
      this.mood.set(t.mood);
      this.sleep.set(t.sleepQuality);
      this.energy.set(t.energy);
      this.symptoms.set([...t.symptoms]);
      this.note.set(t.note ?? '');
    }
    this.justSent.set(null);
    this.editing.set(true);
  }

  protected submit(): void {
    if (!this.complete() || this.sending()) return;
    this.sending.set(true);
    this.api
      .submitCheckIn(this.session.astronautId(), {
        mood: this.mood()!,
        sleepQuality: this.sleep()!,
        energy: this.energy()!,
        symptoms: this.symptoms(),
        note: this.note(),
      })
      .subscribe((ci) => {
        this.sending.set(false);
        this.editing.set(false);
        this.justSent.set(ci);
      });
  }

  protected time(h: number): string {
    return formatClock(h);
  }

  protected readonly sharedTip = {
    title: 'Shared with Mission Control',
    body: `Check-ins and questionnaires go to ${this.clock.config.team.flightSurgeon}, your flight surgeon, to keep an eye on your health. Your conversations with Nova are different: they stay private.`,
  };
}
