import { Injectable, Provider, inject } from '@angular/core';
import { BehaviorSubject, Observable, delayWhen, distinctUntilChanged, filter, map, of, timer } from 'rxjs';
import { AnalysisQuery, AssessmentApi, CompanionApi, CrewApi, CrewModeApi, MissionApi, TelemetryApi } from '../data/apis';
import {
  AnswerValue,
  Assignment,
  ChatMessage,
  CheckInDraft,
  Questionnaire,
  QuestionnaireId,
  Astronaut,
  Baseline,
  CheckIn,
  CrewSummary,
  HazardAssessment,
  HazardKey,
  Insight,
  LiveVitals,
  MetricInterpretation,
  MetricKey,
  MissionConfig,
  MissionEvent,
  Sample,
  VITAL_KEYS,
  severityToStatus,
  worstStatus,
} from '../models';
import { EngineContext } from './engine/context';
import { assessHazards, hazardHistory } from './engine/hazards';
import { detectInsights } from './engine/insights';
import { HOUR_MS, MISSION_CONFIG, hourToDay } from './mission-plan';
import { MockDatabase } from './mock-database';
import { downsample, lowerBound, sliceSamples } from './stats';
import { interpretMetric } from './engine/interpret';
import { linkStateAt } from '../util/link';
import { formatDelay } from '../util/format';
import { QUESTIONNAIRES, scoreQuestionnaire } from './questionnaires';
import { NovaContext, NovaState, NovaTurn, novaGreeting, novaRespond } from './nova';

/** Simulated network latency on the first emission only (lets loading states show). */
function latency<T>(ms = 280) {
  return (source: Observable<T>) => source.pipe(delayWhen((_, i) => (i === 0 ? timer(ms + Math.random() * 180) : of(0))));
}


@Injectable({ providedIn: 'root' })
export class MockDb extends MockDatabase {
  readonly changes$ = new BehaviorSubject<number>(0);
  /** Private chat updates (crewId) — deliberately separate from analysis changes. */
  readonly chat$ = new BehaviorSubject<string>('');

  protected override onChange(): void {
    this.changes$?.next(this.version);
  }

  protected override onChatChange(crewId: string): void {
    this.chat$.next(crewId);
  }
}

@Injectable({ providedIn: 'root' })
export class MockMissionApi extends MissionApi {
  private readonly db = inject(MockDb);
  config(): Observable<MissionConfig> {
    return of(MISSION_CONFIG);
  }
  events(): Observable<MissionEvent[]> {
    return this.db.changes$.pipe(map(() => this.db.events()));
  }
  timeline(crewId: string, from: number, to: number): Observable<MissionEvent[]> {
    return this.db.changes$.pipe(
      map(() => {
        const events = this.db
          .events()
          .filter((e) => e.end >= from && e.start <= to && (e.crewIds.length === 0 || e.crewIds.includes(crewId)));
        const exercise: MissionEvent[] = this.db
          .exercise(crewId)
          .filter((s) => s.end >= from && s.start <= to)
          .map((s) => ({
            id: `ex-${crewId}-${s.day}`,
            kind: 'exercise',
            label: s.done ? 'Exercise' : 'Exercise missed',
            missed: !s.done,
            start: s.start,
            end: s.end,
            crewIds: [crewId],
            hazards: ['gravity'],
          }));
        return [...events, ...exercise].sort((a, b) => a.start - b.start);
      }),
    );
  }
}

@Injectable({ providedIn: 'root' })
export class MockCrewApi extends CrewApi {
  private readonly db = inject(MockDb);
  list(): Observable<Astronaut[]> {
    return of(this.db.crew()).pipe(latency(200));
  }
  get(id: string): Observable<Astronaut | undefined> {
    return of(this.db.astronaut(id)).pipe(latency(150));
  }
}

const LIVE_JITTER: Partial<Record<MetricKey, number>> = {
  hr: 1.2, hrv: 2.2, spo2: 0.25, coreTemp: 0.02, bpSys: 1.4, bpDia: 1, resp: 0.4,
};

@Injectable({ providedIn: 'root' })
export class MockTelemetryApi extends TelemetryApi {
  private readonly db = inject(MockDb);

  series(crewId: string, metric: MetricKey, from: number, to: number, bucketHours = 1): Observable<Sample[]> {
    return this.db.changes$.pipe(
      map(() => downsample(sliceSamples(this.db.series(crewId, metric), from, to), bucketHours)),
      latency(),
    );
  }

  baseline(crewId: string, metric: MetricKey): Observable<Baseline | null> {
    return of(this.db.baseline(crewId, metric));
  }

  live(crewId: string): Observable<LiveVitals> {
    return timer(0, 3000).pipe(
      map(() => {
        const t = (Date.now() - MISSION_CONFIG.launchEpochMs) / HOUR_MS;
        const values: Partial<Record<MetricKey, number>> = {};
        for (const k of VITAL_KEYS) {
          const s = this.db.series(crewId, k);
          const i = Math.min(s.length - 2, Math.max(0, lowerBound(s, t) - 1));
          const a = s[i];
          const b = s[i + 1];
          const f = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t || 1)));
          const jitter = (Math.random() - 0.5) * 2 * (LIVE_JITTER[k] ?? 0);
          values[k] = a.v + (b.v - a.v) * f + jitter;
        }
        if (values.spo2 !== undefined) values.spo2 = Math.min(100, values.spo2);
        return { crewId, t, values };
      }),
    );
  }

  checkIns(crewId: string, from: number, to: number): Observable<CheckIn[]> {
    return this.db.changes$.pipe(
      map(() => this.db.checkIns(crewId).filter((c) => c.at >= from && c.at <= to)),
      latency(),
    );
  }
}

interface Analysis {
  hazards: HazardAssessment[];
  insights: Insight[];
}

@Injectable({ providedIn: 'root' })
export class MockAssessmentApi extends AssessmentApi {
  private readonly db = inject(MockDb);
  private readonly cache = new Map<string, Analysis>();

  private ctx(q: AnalysisQuery): EngineContext {
    return {
      db: this.db,
      hour: q.atHour,
      link: linkStateAt(MISSION_CONFIG, q.atHour, q.autonomous),
      careerLimitMsv: MISSION_CONFIG.careerDoseLimitMsv,
    };
  }

  private analyze(q: AnalysisQuery): Analysis {
    const key = `${Math.floor(q.atHour * 4) / 4}:${this.db.version}:${q.autonomous}`;
    let a = this.cache.get(key);
    if (!a) {
      const ctx = this.ctx(q);
      a = { hazards: assessHazards(ctx), insights: detectInsights(ctx) };
      if (this.cache.size > 400) this.cache.clear();
      this.cache.set(key, a);
    }
    return a;
  }

  private stream<T>(q: AnalysisQuery, pick: (a: Analysis) => T): Observable<T> {
    return this.db.changes$.pipe(
      map(() => pick(this.analyze(q))),
      distinctUntilChanged(),
      latency(),
    );
  }

  hazards(q: AnalysisQuery): Observable<HazardAssessment[]> {
    return this.stream(q, (a) => a.hazards);
  }

  insights(q: AnalysisQuery): Observable<Insight[]> {
    return this.stream(q, (a) => a.insights);
  }

  hazardHistory(q: AnalysisQuery, hazard: HazardKey, crewId: string, fromDay: number): Observable<Sample[]> {
    return this.db.changes$.pipe(
      map(() => hazardHistory(this.ctx(q), hazard, crewId, fromDay, hourToDay(q.atHour))),
      latency(),
    );
  }

  crewSummaries(q: AnalysisQuery): Observable<CrewSummary[]> {
    return this.stream(q, (a) => {
      const today = hourToDay(q.atHour);
      return this.db.crew().map((astro) => {
        const hz = a.hazards.filter((h) => h.crewId === astro.id).map((h) => h.status);
        const ins = a.insights.filter((i) => i.crewId === astro.id).map((i) => severityToStatus(i.severity));
        const ci = this.db.checkIns(astro.id).find((c) => c.day === today && c.at <= q.atHour);
        const next = this.db
          .events()
          .filter((e) => e.start > q.atHour && (e.crewIds.length === 0 || e.crewIds.includes(astro.id)))
          .sort((x, y) => x.start - y.start)[0];
        return {
          crewId: astro.id,
          status: worstStatus(...hz, ...ins),
          checkInHour: ci?.at ?? null,
          nextEvent: next ? { label: next.label.split(' ')[0], day: hourToDay(next.start) } : null,
        };
      });
    });
  }

  interpretMetric(q: AnalysisQuery, crewId: string, metric: MetricKey): Observable<MetricInterpretation> {
    return this.db.changes$.pipe(
      map(() => interpretMetric(this.ctx(q), crewId, metric)),
      latency(420),
    );
  }
}

/** Current mission hour, quarter-hour aligned so new data shows up in the current analysis. */
function nowHour(): number {
  const h = (Date.now() - MISSION_CONFIG.launchEpochMs) / HOUR_MS;
  return Math.floor(h * 4) / 4;
}

@Injectable({ providedIn: 'root' })
export class MockCrewModeApi extends CrewModeApi {
  private readonly db = inject(MockDb);

  submitCheckIn(crewId: string, draft: CheckInDraft): Observable<CheckIn> {
    const t = nowHour();
    const day = hourToDay(t);
    const ci: CheckIn = {
      id: `ci-${crewId}-${day}`,
      crewId,
      day,
      at: t,
      mood: draft.mood,
      sleepQuality: draft.sleepQuality,
      energy: draft.energy,
      symptoms: draft.symptoms,
      note: draft.note?.trim() || undefined,
    };
    this.db.addCheckIn(ci);
    return of(ci).pipe(latency(350));
  }

  questionnaires(): Observable<Record<QuestionnaireId, Questionnaire>> {
    return of(QUESTIONNAIRES);
  }

  assignments(crewId: string): Observable<Assignment[]> {
    return this.db.changes$.pipe(map(() => this.db.assignments(crewId)), latency());
  }

  assignment(id: string): Observable<Assignment | undefined> {
    return this.db.changes$.pipe(map(() => this.db.assignments().find((a) => a.id === id)));
  }

  saveProgress(id: string, answers: Record<string, AnswerValue>, currentIndex: number): Observable<Assignment> {
    const a = this.db.assignments().find((x) => x.id === id);
    if (!a) throw new Error('Unknown assignment');
    const next: Assignment = { ...a, answers, currentIndex, status: a.status === 'done' ? 'done' : 'in-progress' };
    this.db.updateAssignment(next);
    return of(next);
  }

  submitQuestionnaire(id: string, answers: Record<string, AnswerValue>): Observable<Assignment> {
    const a = this.db.assignments().find((x) => x.id === id);
    if (!a) throw new Error('Unknown assignment');
    const q = QUESTIONNAIRES[a.questionnaireId];
    const t = nowHour();
    const score = scoreQuestionnaire(q, answers);
    const done: Assignment = { ...a, answers, status: 'done', completedAt: t, score, currentIndex: q.questions.length };
    if (q.feeds) this.db.addSample(a.crewId, q.feeds, { t, v: score });
    this.db.updateAssignment(done);
    return of(done).pipe(latency(400));
  }
}

const IDLE_STATE: NovaState = { pendingSafetyCheck: false, awaitingCheckIn: false };

@Injectable({ providedIn: 'root' })
export class MockCompanionApi extends CompanionApi {
  private readonly db = inject(MockDb);
  private readonly crewMode = inject(CrewModeApi);
  private readonly typingState = new BehaviorSubject<Record<string, boolean>>({});
  private readonly state = new Map<string, NovaState>();
  private seq = 0;

  private ctx(crewId: string, previousText?: string): NovaContext {
    const hour = nowHour();
    return {
      db: this.db,
      crewId,
      hour,
      delaySeconds: linkStateAt(MISSION_CONFIG, hour, false).delaySeconds,
      surgeon: MISSION_CONFIG.team.flightSurgeon,
      state: this.state.get(crewId) ?? IDLE_STATE,
      previousText,
    };
  }

  private push(crewId: string, msgs: Omit<ChatMessage, 'id' | 'at'>[]): void {
    const at = (Date.now() - MISSION_CONFIG.launchEpochMs) / HOUR_MS;
    const added = msgs.map((m) => ({ ...m, id: `m${++this.seq}`, at }));
    this.db.setChat(crewId, [...this.db.chat(crewId), ...added]);
  }

  private setTyping(crewId: string, v: boolean): void {
    this.typingState.next({ ...this.typingState.value, [crewId]: v });
  }

  /** Nova replies after a short, human-feeling pause. */
  private reply(crewId: string, turn: NovaTurn): void {
    this.state.set(crewId, turn.state);
    this.setTyping(crewId, true);
    const pause = 700 + Math.min(1600, turn.replies.reduce((s, r) => s + r.text.length, 0) * 6);
    setTimeout(() => {
      this.setTyping(crewId, false);
      this.push(
        crewId,
        turn.replies.map((r) => ({ role: 'nova' as const, text: r.text, card: r.card })),
      );
      if (turn.safety) {
        // Safety exception: an alert with NO transcript.
        this.db.addSafetyFlag({ id: `sf-${crewId}-${++this.seq}`, crewId, at: nowHour(), category: turn.safety });
      }
    }, pause);
  }

  history(crewId: string): Observable<ChatMessage[]> {
    return this.db.chat$.pipe(
      filter((id) => id === '' || id === crewId),
      map(() => this.db.chat(crewId)),
    );
  }

  typing(crewId: string): Observable<boolean> {
    return this.typingState.pipe(map((t) => !!t[crewId]), distinctUntilChanged());
  }

  start(crewId: string): Observable<void> {
    if (!this.db.chat(crewId).length) this.reply(crewId, novaGreeting(this.ctx(crewId)));
    return of(undefined);
  }

  send(crewId: string, text: string): Observable<void> {
    const previous = [...this.db.chat(crewId)].reverse().find((m) => m.role === 'astronaut')?.text;
    this.push(crewId, [{ role: 'astronaut', text }]);
    this.reply(crewId, novaRespond(this.ctx(crewId, previous), text));
    return of(undefined);
  }

  resolveCard(crewId: string, messageId: string, action: 'confirm' | 'dismiss', edited?: string): Observable<void> {
    const msgs = this.db.chat(crewId);
    const msg = msgs.find((m) => m.id === messageId);
    const card = msg?.card;
    if (!msg || !card || (card.kind !== 'checkin' && card.kind !== 'share') || card.status !== 'proposed') return of(undefined);
    const status = action === 'confirm' ? 'sent' : 'dismissed';
    const updated: ChatMessage =
      card.kind === 'share'
        ? { ...msg, card: { ...card, status, text: edited ?? card.text } }
        : { ...msg, card: { ...card, status } };
    this.db.setChat(crewId, msgs.map((m) => (m.id === messageId ? updated : m)));

    const surgeon = MISSION_CONFIG.team.flightSurgeon;
    const delay = formatDelay(linkStateAt(MISSION_CONFIG, nowHour(), false).delaySeconds);
    if (action === 'confirm' && card.kind === 'checkin') {
      this.crewMode.submitCheckIn(crewId, card.draft).subscribe();
      this.push(crewId, [{ role: 'nova', text: `Done. Your check-in is on its way to Mission Control (about ${delay} to Earth). Thanks for keeping it up.` }]);
    } else if (action === 'confirm' && card.kind === 'share') {
      this.db.addSharedNote({ id: `note-${crewId}-${++this.seq}`, crewId, at: nowHour(), text: edited ?? card.text });
      this.push(crewId, [{ role: 'nova', text: `Sent to ${surgeon}. Only that note was shared, nothing else from our conversation.` }]);
    } else {
      this.push(crewId, [{ role: 'nova', text: 'No problem, nothing was sent.' }]);
    }
    return of(undefined);
  }

  clear(crewId: string): Observable<void> {
    this.state.delete(crewId);
    this.db.setChat(crewId, []);
    return of(undefined);
  }
}

/** Swap this for provideHttpData() when the real backend exists. */
export function provideMockData(): Provider[] {
  return [
    { provide: MissionApi, useExisting: MockMissionApi },
    { provide: CrewApi, useExisting: MockCrewApi },
    { provide: TelemetryApi, useExisting: MockTelemetryApi },
    { provide: AssessmentApi, useExisting: MockAssessmentApi },
    { provide: CrewModeApi, useExisting: MockCrewModeApi },
    { provide: CompanionApi, useExisting: MockCompanionApi },
  ];
}
