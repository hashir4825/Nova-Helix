import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { combineLatest, switchMap } from 'rxjs';
import { AssessmentApi, CrewApi, MissionApi, TelemetryApi } from '../../core/data/apis';
import { ActionKind, METRICS, MetricKey } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { SessionStore } from '../../core/state/session';
import { formatMetric } from '../../core/util/format';
import { RANGES, RangeKey, allowedRanges, defaultRange, rangeWindow } from '../../core/util/range';
import { TrendChart } from '../../shared/charts/trend-chart';
import { METRIC_HELP } from '../../shared/help';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { HazardTag } from '../../shared/ui/hazard-tag';
import { Icon } from '../../shared/ui/icon';
import { ICON, IconNode } from '../../shared/ui/icons';
import { Sheet } from '../../shared/ui/sheet';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatusBadge } from '../../shared/ui/status-badge';

const ACTION_ICON: Record<ActionKind, IconNode> = {
  acknowledge: ICON.check,
  contact: ICON.phone,
  questionnaire: ICON.clipboard,
  countermeasure: ICON.activity,
  escalate: ICON.send,
};

@Component({
  selector: 'nh-metric-sheet',
  imports: [Sheet, TrendChart, StatusBadge, HazardTag, Icon, Skeleton, TipDirective, RouterLink],
  templateUrl: './metric-sheet.html',
  styleUrl: './metric-sheet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricSheet {
  readonly crewId = input.required<string>();
  readonly metric = input.required<MetricKey>();
  readonly closed = output<void>();

  private readonly telemetry = inject(TelemetryApi);
  private readonly assess = inject(AssessmentApi);
  private readonly mission = inject(MissionApi);
  private readonly crewApi = inject(CrewApi);
  protected readonly clock = inject(MissionClock);
  protected readonly session = inject(SessionStore);
  protected readonly icons = ICON;
  protected readonly actionIcon = ACTION_ICON;

  protected readonly def = computed(() => METRICS[this.metric()]);
  protected readonly help = computed(() => METRIC_HELP[this.metric()] ?? this.def().source);
  protected readonly range = signal<RangeKey>('7d');
  protected readonly ranges = computed(() => {
    const allowed = allowedRanges(this.def().cadence);
    return RANGES.map((r) => ({ ...r, enabled: allowed.includes(r.key) }));
  });

  constructor() {
    // Reset the range to a sensible default whenever the metric changes.
    effect(() => {
      const cadence = this.def().cadence;
      untracked(() => this.range.set(defaultRange(cadence)));
    });
  }

  protected readonly win = computed(() => rangeWindow(this.range(), this.clock.queryHour(), this.def().cadence));

  protected readonly astronaut = toSignal(toObservable(this.crewId).pipe(switchMap((id) => this.crewApi.get(id))));

  private readonly args$ = toObservable(computed(() => ({ crew: this.crewId(), metric: this.metric(), w: this.win() })));

  protected readonly samples = toSignal(this.args$.pipe(switchMap((a) => this.telemetry.series(a.crew, a.metric, a.w.from, a.w.to, a.w.bucket))));
  protected readonly diastolic = toSignal(
    this.args$.pipe(switchMap((a) => this.telemetry.series(a.crew, 'bpDia', a.w.from, a.w.to, a.w.bucket))),
  );
  protected readonly baseline = toSignal(
    toObservable(computed(() => ({ crew: this.crewId(), metric: this.metric() }))).pipe(
      switchMap((a) => this.telemetry.baseline(a.crew, a.metric)),
    ),
  );
  protected readonly events = toSignal(this.args$.pipe(switchMap((a) => this.mission.timeline(a.crew, a.w.from, a.w.to))), {
    initialValue: [],
  });
  protected readonly interp = toSignal(
    combineLatest([toObservable(this.clock.query), toObservable(computed(() => ({ crew: this.crewId(), metric: this.metric() })))]).pipe(
      switchMap(([q, a]) => this.assess.interpretMetric(q, a.crew, a.metric)),
    ),
  );

  protected readonly latest = computed(() => this.samples()?.at(-1) ?? null);
  protected readonly isBp = computed(() => this.metric() === 'bpSys');
  protected readonly isAstronaut = computed(() => this.session.role() === 'astronaut');
  protected readonly name = computed(() => this.astronaut()?.name ?? '');
  protected readonly bandLabel = computed(() => (this.isAstronaut() ? 'Your normal' : `${this.name()}'s normal`));
  protected readonly limit = computed(() => (this.metric() === 'radDose' ? { value: this.clock.config.careerDoseLimitMsv, label: 'Career limit' } : null));

  protected fmt(v: number, unit = true): string {
    return formatMetric(this.metric(), v, unit);
  }

  protected readonly normalText = computed(() => {
    const b = this.baseline();
    if (!b) return null;
    return `${formatMetric(this.metric(), b.low, false)}–${formatMetric(this.metric(), b.high)}`;
  });

  protected readonly legendTips = {
    band: { title: 'Personal normal range', body: 'The shaded band is this astronaut’s own usual range, learned from their data early in the flight. It is not an average of other people.' },
    threshold: { title: 'Thresholds', body: 'Dashed lines mark the levels where Mission Control is warned (Watch) or must act (Alert).' },
    events: { title: 'Mission events', body: 'Shaded columns mark spacewalks (EVA), the solar storm (SPE) and exercise sessions, which explain many spikes.' },
  };

  protected readonly confidenceTip = computed(() => {
    const c = this.interp()?.confidence ?? 0;
    return {
      title: `Confidence ${Math.round(c * 100)}%`,
      body: 'How sure the analysis is, based on how much data there is and how many independent signals agree.',
    };
  });
}
