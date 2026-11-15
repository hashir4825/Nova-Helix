import { EnvironmentProviders, Injectable, Provider, inject } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { BehaviorSubject, Observable, distinctUntilChanged, map, of, shareReplay, timer, switchMap, catchError, EMPTY, finalize } from 'rxjs';
import { ActionsApi, AnalysisQuery, AssessmentApi, CompanionApi, CrewApi, CrewModeApi, MissionApi, TelemetryApi } from '../data/apis';
import {
  ActionLogEntry,
  AnswerValue,
  Assignment,
  Astronaut,
  Baseline,
  ChatMessage,
  CheckIn,
  CheckInDraft,
  CompanionRequest,
  CompanionState,
  CompanionTurn,
  CrewMessage,
  CrewSummary,
  HazardAssessment,
  HazardKey,
  Insight,
  LiveVitals,
  MetricInterpretation,
  MetricKey,
  MissionConfig,
  MissionEvent,
  Questionnaire,
  QuestionnaireId,
  Resolution,
  Sample,
  Severity,
  SharedNote,
} from '../models';
import { MissionClock } from '../state/mission-clock';
import { formatDelay } from '../util/format';
import { API_BASE, ApiClient } from './api-client';

/*
 * HTTP implementation of the data contracts in core/data/apis.ts.
 * Wire format = the TypeScript models (camelCase JSON, times in mission hours).
 * Endpoint reference: docs/BACKEND_API_GUIDE.md.
 */

const id = encodeURIComponent;
const q = (x: AnalysisQuery) => ({ at: x.atHour, autonomous: x.autonomous });

@Injectable({ providedIn: 'root' })
export class HttpMissionApi extends MissionApi {
  private readonly api = inject(ApiClient);
  private readonly cfg$ = this.api.get<MissionConfig>('/api/mission').pipe(shareReplay(1));

  config(): Observable<MissionConfig> {
    return this.cfg$;
  }
  events(): Observable<MissionEvent[]> {
    return this.api.watch<MissionEvent[]>('/api/mission/events');
  }
  timeline(crewId: string, from: number, to: number): Observable<MissionEvent[]> {
    return this.api.watch<MissionEvent[]>(`/api/crew/${id(crewId)}/timeline`, { from, to });
  }
}

@Injectable({ providedIn: 'root' })
export class HttpCrewApi extends CrewApi {
  private readonly api = inject(ApiClient);
  private readonly list$ = this.api.get<Astronaut[]>('/api/crew').pipe(shareReplay(1));

  list(): Observable<Astronaut[]> {
    return this.list$;
  }
  get(crewId: string): Observable<Astronaut | undefined> {
    return this.list$.pipe(map((l) => l.find((a) => a.id === crewId)));
  }
}

@Injectable({ providedIn: 'root' })
export class HttpTelemetryApi extends TelemetryApi {
  private readonly api = inject(ApiClient);

  series(crewId: string, metric: MetricKey, from: number, to: number, bucketHours = 1): Observable<Sample[]> {
    return this.api.watch<Sample[]>(`/api/crew/${id(crewId)}/metrics/${metric}`, { from, to, bucket: bucketHours });
  }
  baseline(crewId: string, metric: MetricKey): Observable<Baseline | null> {
    return this.api.get<Baseline | null>(`/api/crew/${id(crewId)}/metrics/${metric}/baseline`);
  }
  live(crewId: string): Observable<LiveVitals> {
    return timer(0, 3000).pipe(
      switchMap(() => this.api.get<LiveVitals>(`/api/crew/${id(crewId)}/vitals/live`).pipe(catchError(() => EMPTY))),
    );
  }
  checkIns(crewId: string, from: number, to: number): Observable<CheckIn[]> {
    return this.api.watch<CheckIn[]>(`/api/crew/${id(crewId)}/checkins`, { from, to });
  }
}

@Injectable({ providedIn: 'root' })
export class HttpAssessmentApi extends AssessmentApi {
  private readonly api = inject(ApiClient);

  hazards(x: AnalysisQuery): Observable<HazardAssessment[]> {
    return this.api.watch<HazardAssessment[]>('/api/assessment/hazards', q(x));
  }
  hazardHistory(x: AnalysisQuery, hazard: HazardKey, crewId: string, fromDay: number): Observable<Sample[]> {
    return this.api.watch<Sample[]>(`/api/assessment/hazards/${hazard}/history`, { ...q(x), crew: crewId, fromDay });
  }
  insights(x: AnalysisQuery): Observable<Insight[]> {
    return this.api.watch<Insight[]>('/api/insights', q(x));
  }
  crewSummaries(x: AnalysisQuery): Observable<CrewSummary[]> {
    return this.api.watch<CrewSummary[]>('/api/assessment/crew-summaries', q(x));
  }
  interpretMetric(x: AnalysisQuery, crewId: string, metric: MetricKey): Observable<MetricInterpretation> {
    return this.api.watch<MetricInterpretation>(`/api/crew/${id(crewId)}/metrics/${metric}/interpretation`, q(x));
  }
}

@Injectable({ providedIn: 'root' })
export class HttpCrewModeApi extends CrewModeApi {
  private readonly api = inject(ApiClient);
  private readonly qs$ = this.api.get<Record<QuestionnaireId, Questionnaire>>('/api/questionnaires').pipe(shareReplay(1));

  submitCheckIn(crewId: string, draft: CheckInDraft): Observable<CheckIn> {
    return this.api.post<CheckIn>(`/api/crew/${id(crewId)}/checkins`, draft);
  }
  questionnaires(): Observable<Record<QuestionnaireId, Questionnaire>> {
    return this.qs$;
  }
  assignments(crewId: string): Observable<Assignment[]> {
    return this.api.watch<Assignment[]>(`/api/crew/${id(crewId)}/assignments`);
  }
  assignment(assignmentId: string): Observable<Assignment | undefined> {
    return this.api.watch<Assignment>(`/api/assignments/${id(assignmentId)}`);
  }
  saveProgress(assignmentId: string, answers: Record<string, AnswerValue>, currentIndex: number): Observable<Assignment> {
    return this.api.put<Assignment>(`/api/assignments/${id(assignmentId)}/progress`, { answers, currentIndex });
  }
  submitQuestionnaire(assignmentId: string, answers: Record<string, AnswerValue>): Observable<Assignment> {
    return this.api.post<Assignment>(`/api/assignments/${id(assignmentId)}/submit`, { answers });
  }
}

/** How much recent conversation goes with each request (context for the model; never stored). */
const HISTORY_TURNS = 16;
const IDLE: CompanionState = { pendingSafetyCheck: false, awaitingCheckIn: false };

/**
 * Nova over HTTP. The conversation lives only in this browser tab: the backend reply
 * endpoint is stateless and must not store or log the text. Only confirmed cards
 * (check-in, shared note) are written to Mission Control data, through their own endpoints.
 */
@Injectable({ providedIn: 'root' })
export class HttpCompanionApi extends CompanionApi {
  private readonly api = inject(ApiClient);
  private readonly crewMode = inject(CrewModeApi);
  private readonly clock = inject(MissionClock);
  private readonly chats = new BehaviorSubject<Record<string, ChatMessage[]>>({});
  private readonly typingState = new BehaviorSubject<Record<string, boolean>>({});
  private readonly state = new Map<string, CompanionState>();
  private seq = 0;

  private chat(crewId: string): ChatMessage[] {
    return this.chats.value[crewId] ?? [];
  }

  private setChat(crewId: string, msgs: ChatMessage[]): void {
    this.chats.next({ ...this.chats.value, [crewId]: msgs });
  }

  private push(crewId: string, msgs: Omit<ChatMessage, 'id' | 'at'>[]): void {
    const at = this.clock.liveHour();
    this.setChat(crewId, [...this.chat(crewId), ...msgs.map((m) => ({ ...m, id: `m${++this.seq}`, at }))]);
  }

  private setTyping(crewId: string, v: boolean): void {
    this.typingState.next({ ...this.typingState.value, [crewId]: v });
  }

  private ask(crewId: string, text?: string): void {
    const body: CompanionRequest = {
      text,
      history: this.chat(crewId)
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, text: m.text })),
      state: this.state.get(crewId) ?? IDLE,
    };
    this.setTyping(crewId, true);
    this.api
      .call<CompanionTurn>(`/api/crew/${id(crewId)}/companion/reply`, body)
      .pipe(finalize(() => this.setTyping(crewId, false)))
      .subscribe({
        next: (turn) => {
          this.state.set(crewId, turn.state);
          this.push(crewId, turn.replies.map((r) => ({ role: 'nova' as const, text: r.text, card: r.card })));
        },
        error: () =>
          this.push(crewId, [
            { role: 'nova', text: 'I can’t reach the ship’s companion service right now. Please try again in a minute. If you feel unwell, talk to your CMO or a crewmate now.' },
          ]),
      });
  }

  history(crewId: string): Observable<ChatMessage[]> {
    return this.chats.pipe(
      map((c) => c[crewId] ?? []),
      distinctUntilChanged(),
    );
  }

  typing(crewId: string): Observable<boolean> {
    return this.typingState.pipe(
      map((t) => !!t[crewId]),
      distinctUntilChanged(),
    );
  }

  start(crewId: string): Observable<void> {
    if (!this.chat(crewId).length) this.ask(crewId);
    return of(undefined);
  }

  send(crewId: string, text: string): Observable<void> {
    this.ask(crewId, text);
    // The astronaut's message shows immediately; the request already captured the history before it.
    this.push(crewId, [{ role: 'astronaut', text }]);
    return of(undefined);
  }

  resolveCard(crewId: string, messageId: string, action: 'confirm' | 'dismiss', edited?: string): Observable<void> {
    const msgs = this.chat(crewId);
    const msg = msgs.find((m) => m.id === messageId);
    const card = msg?.card;
    if (!msg || !card || (card.kind !== 'checkin' && card.kind !== 'share') || card.status !== 'proposed') return of(undefined);
    const status = action === 'confirm' ? 'sent' : 'dismissed';
    const updated: ChatMessage =
      card.kind === 'share' ? { ...msg, card: { ...card, status, text: edited ?? card.text } } : { ...msg, card: { ...card, status } };
    this.setChat(crewId, msgs.map((m) => (m.id === messageId ? updated : m)));

    const surgeon = this.clock.config.team.flightSurgeon;
    const delay = formatDelay(this.clock.link().delaySeconds);
    if (action === 'confirm' && card.kind === 'checkin') {
      this.crewMode.submitCheckIn(crewId, card.draft).subscribe();
      this.push(crewId, [{ role: 'nova', text: `Done. Your check-in is on its way to Mission Control (about ${delay} to Earth). Thanks for keeping it up.` }]);
    } else if (action === 'confirm' && card.kind === 'share') {
      this.api.post<SharedNote>(`/api/crew/${id(crewId)}/shared-notes`, { text: edited ?? card.text }).subscribe();
      this.push(crewId, [{ role: 'nova', text: `Sent to ${surgeon}. Only that note was shared, nothing else from our conversation.` }]);
    } else {
      this.push(crewId, [{ role: 'nova', text: 'No problem, nothing was sent.' }]);
    }
    return of(undefined);
  }

  clear(crewId: string): Observable<void> {
    this.state.delete(crewId);
    this.setChat(crewId, []);
    return of(undefined);
  }
}

@Injectable({ providedIn: 'root' })
export class HttpActionsApi extends ActionsApi {
  private readonly api = inject(ApiClient);

  log(): Observable<ActionLogEntry[]> {
    return this.api.watch<ActionLogEntry[]>('/api/actions');
  }
  record(entry: Omit<ActionLogEntry, 'id' | 'at' | 'by'>): Observable<ActionLogEntry> {
    return this.api.post<ActionLogEntry>('/api/actions', entry);
  }
  sendMessage(crewId: string, text: string, insightId?: string): Observable<CrewMessage> {
    return this.api.post<CrewMessage>(`/api/crew/${id(crewId)}/messages`, { text, insightId });
  }
  messages(crewId: string): Observable<CrewMessage[]> {
    return this.api.watch<CrewMessage[]>(`/api/crew/${id(crewId)}/messages`);
  }
  resolve(insightId: string, crewId: string | null, note: string, severity: Severity): Observable<void> {
    return this.api.post<Resolution>(`/api/insights/${id(insightId)}/resolve`, { crewId, note, severity }).pipe(map(() => undefined));
  }
  reopen(insightId: string, crewId: string | null): Observable<void> {
    return this.api.post<unknown>(`/api/insights/${id(insightId)}/reopen`, { crewId }).pipe(map(() => undefined));
  }
}

/** Binds every data contract to the Nova Healix backend. */
export function provideHttpData(baseUrl: string): (Provider | EnvironmentProviders)[] {
  return [
    provideHttpClient(withFetch()),
    { provide: API_BASE, useValue: baseUrl },
    { provide: MissionApi, useExisting: HttpMissionApi },
    { provide: CrewApi, useExisting: HttpCrewApi },
    { provide: TelemetryApi, useExisting: HttpTelemetryApi },
    { provide: AssessmentApi, useExisting: HttpAssessmentApi },
    { provide: CrewModeApi, useExisting: HttpCrewModeApi },
    { provide: CompanionApi, useExisting: HttpCompanionApi },
    { provide: ActionsApi, useExisting: HttpActionsApi },
  ];
}
