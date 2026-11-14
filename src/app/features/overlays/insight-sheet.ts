import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { ActionsApi, AssessmentApi, CrewApi } from '../../core/data/apis';
import { ActionKind, ActionLogEntry, LogKind, ROLE_LABEL, RecommendedAction } from '../../core/models';
import { MissionClock } from '../../core/state/mission-clock';
import { formatClock, formatDelay, formatMissionTime } from '../../core/util/format';
import { STATUS_HELP } from '../../shared/help';
import { TipDirective } from '../../shared/tooltip/tip.directive';
import { HazardTag } from '../../shared/ui/hazard-tag';
import { Icon } from '../../shared/ui/icon';
import { ICON, IconNode } from '../../shared/ui/icons';
import { Sheet } from '../../shared/ui/sheet';
import { Skeleton } from '../../shared/ui/skeleton';
import { StatusBadge } from '../../shared/ui/status-badge';

const KIND_ICON: Record<ActionKind, IconNode> = {
  acknowledge: ICON.check,
  message: ICON.message,
  questionnaire: ICON.clipboard,
  countermeasure: ICON.activity,
  escalate: ICON.send,
};

const LOG_KIND: Record<ActionKind, LogKind> = {
  acknowledge: 'acknowledge',
  message: 'message',
  questionnaire: 'questionnaire',
  countermeasure: 'countermeasure',
  escalate: 'escalate',
};

/** Detail + response for one finding (`?insight=<id>`). */
@Component({
  selector: 'nh-insight-sheet',
  imports: [Sheet, StatusBadge, HazardTag, Icon, Skeleton, TipDirective, RouterLink],
  templateUrl: './insight-sheet.html',
  styleUrl: './insight-sheet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InsightSheet {
  readonly insightId = input.required<string>();
  readonly closed = output<void>();

  private readonly assess = inject(AssessmentApi);
  private readonly actions = inject(ActionsApi);
  protected readonly clock = inject(MissionClock);
  protected readonly icons = ICON;
  protected readonly kindIcon = KIND_ICON;
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly surgeon = this.clock.config.team.flightSurgeon;

  private readonly all = toSignal(toObservable(this.clock.query).pipe(switchMap((q) => this.assess.insights(q))));
  protected readonly crew = toSignal(inject(CrewApi).list(), { initialValue: [] });
  private readonly logAll = toSignal(this.actions.log(), { initialValue: [] });

  protected readonly insight = computed(() => this.all()?.find((i) => i.id === this.insightId()));
  protected readonly loading = computed(() => this.all() === undefined);
  protected readonly who = computed(() => {
    const id = this.insight()?.crewId;
    return id ? this.crew().find((a) => a.id === id) : undefined;
  });
  protected readonly urgent = computed(() => this.insightId().startsWith('safety:'));
  protected readonly statusTip = computed(() => {
    const i = this.insight();
    return i ? STATUS_HELP[i.severity] : null;
  });

  /** Log entries for this finding, newest first, plus the detection itself. */
  protected readonly timeline = computed(() => {
    const i = this.insight();
    if (!i) return [];
    const mine = this.logAll().filter((e) => e.insightId === i.id);
    const system: ActionLogEntry[] = [
      {
        id: 'detected',
        insightId: i.id,
        crewId: i.crewId,
        at: i.detectedAt,
        by: this.urgent() ? 'Nova safety check' : 'Analysis engine',
        kind: 'acknowledge',
        label: this.urgent() ? 'Alert raised on board' : 'Finding detected',
      },
    ];
    return [...mine, ...system].sort((a, b) => b.at - a.at);
  });

  protected readonly acknowledged = computed(() => this.logAll().find((e) => e.insightId === this.insightId() && e.kind === 'acknowledge'));

  protected doneFor(a: RecommendedAction): ActionLogEntry | undefined {
    if (a.kind === 'message') return this.logAll().find((e) => e.insightId === this.insightId() && e.kind === 'message');
    return this.logAll().find((e) => e.insightId === this.insightId() && e.label === a.label);
  }

  // ── Message composer ───────────────────────────────────────────
  protected readonly composing = signal(false);
  protected readonly draft = signal('');

  protected startMessage(): void {
    const name = this.who()?.name ?? 'crew';
    this.draft.set(
      this.urgent()
        ? `${name}, it’s ${this.surgeon}. I got Nova’s alert and I’m here for you. Please stay with a crewmate and call me at the next comms window. You are not alone in this.`
        : `Hi ${name}, it’s ${this.surgeon}. I saw “${this.insight()?.title}”. Can we talk at the next comms window?`,
    );
    this.composing.set(true);
  }

  protected sendMessage(): void {
    const i = this.insight();
    const text = this.draft().trim();
    if (!i?.crewId || !text) return;
    this.actions.sendMessage(i.crewId, text, i.id).subscribe(() => this.composing.set(false));
  }

  protected act(a: RecommendedAction): void {
    if (a.kind === 'message') {
      this.startMessage();
      return;
    }
    const i = this.insight();
    if (!i) return;
    this.actions.record({ insightId: i.id, crewId: i.crewId, kind: a.log ?? LOG_KIND[a.kind], label: a.label, detail: a.detail }).subscribe();
  }

  protected acknowledge(): void {
    const i = this.insight();
    if (!i) return;
    this.actions.record({ insightId: i.id, crewId: i.crewId, kind: 'acknowledge', label: 'Acknowledged' }).subscribe();
  }

  // ── Resolve ──────────────────────────────────────────────────────
  protected readonly resolving = signal(false);
  protected readonly note = signal('');
  protected readonly quickNotes = computed(() => {
    const name = this.who()?.name ?? 'the crew';
    return this.urgent()
      ? [
          `Spoke with ${name}; safe and supported, crewmate with them`,
          `Psychologist conference held; follow-up plan agreed`,
          `Medical assessment done on board; stable`,
        ]
      : [`Discussed with ${name}; plan in place`, 'Countermeasure scheduled', 'Reviewed; no further action needed'];
  });

  protected startResolve(): void {
    this.note.set('');
    this.resolving.set(true);
  }

  protected resolve(): void {
    const i = this.insight();
    const note = this.note().trim();
    if (!i || !note) return;
    this.actions.resolve(i.id, i.crewId, note, i.severity).subscribe(() => this.resolving.set(false));
  }

  protected reopen(): void {
    const i = this.insight();
    if (i) this.actions.reopen(i.id, i.crewId).subscribe();
  }

  protected readonly delay = computed(() => formatDelay(this.clock.link().delaySeconds));

  protected when(h: number): string {
    return formatMissionTime(h);
  }

  protected clockOf(h: number): string {
    return formatClock(h);
  }
}

