# Nova Healix API: backend guide (v2)

This guide describes the API the Nova Healix frontend calls. It replaces the RIDGE Monitor API
(`FRONTEND_API_GUIDE.md`). It lists every endpoint with request and response examples and the exact JSON
types. It also covers the analysis rules, the privacy rules for the Nova companion, where the real NASA
data fits, and how to check a server against the frontend.

> **Decision support prototype, not a medical device.** Crew data is simulated. Space weather (NASA DONKI)
> and distance (NASA JPL Horizons) can be real NASA data (see [section 8](#8-real-nasa-data)).

**Frontend code:** [github.com/hashir4825/Nova-Helix](https://github.com/hashir4825/Nova-Helix). File paths in this guide
are relative to that repo. The frontend's in-browser mock (`src/app/core/mock/`) produces exactly the JSON
described here, so it is the reference for every rule and response. [Section 10](#10-running-and-checking)
shows how to run the frontend against your server and what to check.


## Contents

1. [What changed from RIDGE and why](#1-what-changed-from-ridge-and-why)
2. [Basics](#2-basics)
3. [Endpoint summary](#3-endpoint-summary)
4. [Types](#4-types)
5. [Endpoints](#5-endpoints)
6. [Nova companion: privacy contract](#6-nova-companion-privacy-contract)
7. [Analysis engine](#7-analysis-engine)
8. [Real NASA data](#8-real-nasa-data)
9. [Suggested Supabase schema](#9-suggested-supabase-schema)
10. [Running and checking](#10-running-and-checking)
11. [Errors](#11-errors)

---
## 1. What changed from RIDGE and why

The frontend is already built around typed data contracts (`src/app/core/data/apis.ts`).
**Each API method in that file now maps to exactly one endpoint**, and the JSON is the frontend's own
model types. This leaves the frontend unchanged, and it means the backend does the analysis (the "AI").

### Concept mapping

| RIDGE | Nova Healix v2 | Why |
|---|---|---|
| Astronaut ids `A`, `B`, `C` (3 crew) | Slug ids `hashir`, `ahmad`, `hannan`, `sabaina` (4 crew) | Ids appear in URLs and links (`/crew/ahmad`). The crew is 4: CDR, FE, MS, CMO. |
| Mission days 1–30, `?day=N`, default day 5 | **Mission hours** since launch (float), live clock; `?at=<hour>` to evaluate the past | Charts show 24 h / 7 d / 30 d / whole mission, and hourly vitals. Day = `floor(hour / 24) + 1`. |
| Levels `green` / `amber` / `red` | Status `nominal` / `watch` / `alert`; finding severity `info` / `watch` / `alert` | Same three levels, renamed. `info` is for positive or low-priority findings. |
| 6 cards: R, I, D, G, E, **MIRROR** | NASA's **5 hazards**: `radiation`, `isolation`, `distance`, `gravity`, `environment` | The product is organised around NASA's 5 hazards. The Mirror Gap is not a hazard; its data (reaction-time test, self-rating) becomes the `reactionTime` metric, which feeds the radiation and isolation scores. |
| Card `level` + `headline` + rule results | `HazardAssessment`: `score` 0–100, `status`, `headline`, `explanation`, weighted `drivers` | The UI shows a score ring, the drivers ("what feeds this") and a plain-language explanation for the astronaut. |
| `Alert` {what, why, action, source} | `Insight` {title, summary, whyItMatters, evidence[], recommended[], confidence, resolution?} | Findings open a sheet with evidence links, action buttons, an action log and resolve / reopen. |
| ECHO chat, stored in Supabase, scored for loneliness | **Nova**: stateless reply endpoint; **nothing stored, nothing scored** | Privacy rule (see [section 6](#6-nova-companion-privacy-contract)). Isolation is measured from what the astronaut explicitly shares: daily check-in and questionnaires. |
| Mission settings only in Supabase | `GET /api/mission` returns the full mission config | The frontend needs launch time, duration, trajectory and team names before its first render. |

### Endpoint mapping

| RIDGE endpoint | v2 | Notes |
|---|---|---|
| `GET /api/crew?day=` | **Changed**: `GET /api/crew` + `GET /api/assessment/crew-summaries` | Identity and status are separate (identity is cached once). |
| `GET /api/crew/{id}?day=` | **Split** | `GET /api/crew/{id}`, `.../metrics/{metric}`, `.../checkins`, `GET /api/assessment/hazards`. |
| `GET /api/alerts?day=` | **Replaced** by `GET /api/insights` | Richer type; includes resolved findings with their resolution. |
| `GET /api/dashboard?day=` | **Removed** | The frontend loads screen parts in parallel and refreshes each on its own. |
| `GET /api/distance` | **Folded** into `GET /api/mission` (`trajectoryAu`) | The frontend computes signal delay from it. |
| `GET /api/isolation/method` | **Removed** | Not used. |
| `POST /api/isolation/{id}/sessions` | **Replaced** by `POST /api/crew/{id}/companion/reply` | Called without `text` to get Nova's greeting. |
| `POST .../sessions/{sid}/messages` | **Replaced** by `POST /api/crew/{id}/companion/reply` | Stateless: the client sends recent history and conversation state each time. |
| `POST .../sessions/{sid}/complete` | **Removed** | Nova conversations are not scored. |
| `GET .../sessions/{sid}`, `GET /api/isolation/{id}` | **Removed** | No transcripts are stored, so there is nothing to fetch. |
| `GET /api/mobility/method`, `POST/GET /api/mobility/{id}` | **Removed** | Not used by the frontend. If the browser mobility check returns later, its results should be written as `legStrength` / gravity samples. |
| `GET /health` | **Kept** | Response fields changed (see [section 5.1](#51-ops)). |
| None | **Added** | Mission events and timeline, metric series and baseline, live vitals, metric interpretation, hazard history, check-ins, questionnaires and assignments, shared notes, the action log, crew messages, resolve and reopen. |

---

## 2. Basics

| | |
|---|---|
| Local base URL | `http://127.0.0.1:8000` (frontend default, set in `src/environments/environment.ts` in the frontend repo) |
| Format | JSON in and out, **camelCase** field names (FastAPI: pydantic `alias_generator=to_camel`, `populate_by_name=True`, return with `by_alias=True`). |
| Auth | None (prototype). The acting flight surgeon is the mission's `team.flightSurgeon`; the server fills `by` in every log entry. |
| Methods | `GET`, `POST`, `PUT`, plus CORS preflight `OPTIONS`. Requests send `Content-Type: application/json`. |
| CORS | Allow the frontend origins (`http://localhost:4200` and the deployed Vercel URL), methods `GET, POST, PUT, OPTIONS` and header `Content-Type`. |
| Optional fields | Leave them out, or send `null` only where the type says `| null`. |

### Time model (important)

- **Every time is a mission hour**: a float number of hours since launch (Day 1 00:00 UTC).
  `missionHour = (unixMs − launchEpochMs) / 3_600_000`. The day is `floor(missionHour / 24) + 1`.
- `GET /api/mission` returns `launchEpochMs`; the frontend runs its own clock from it.
- Analysis endpoints take `at` (mission hour) and `autonomous` (`true` while the Earth link is lost in the
  simulation). If `at` is missing, use "now". **Never evaluate past "now"**: clamp `at` to now.
- Analysis results may be cached per quarter-hour (`floor(at × 4) / 4`) plus a data version that changes on every write.

### Refresh behaviour (load to expect)

The frontend re-fetches each `GET` it is showing every **15 s** while the tab is visible, and immediately
after any write it makes. Live vitals are polled every **3 s** per astronaut on screen (4 on Mission
Control). Opening a profile triggers about 30–40 small GETs. Cache analysis results; don't recompute
them on every request.

### Ids

| Thing | Id format | Rule |
|---|---|---|
| Astronaut | slug: `hashir` | Stable. |
| Insight | `<rule>:<crewId>` (e.g. `sleep-debt:ahmad`, `co2:crew`), `checkin:<crewId>:<day>`, `safety:<flagId>`, `note:<noteId>`, `q:<assignmentId>` | **Must be stable across evaluations.** Resolutions and the action log are keyed by insight id. The frontend treats ids starting with `safety:` as urgent. |
| Everything else | any unique string | Server-generated. |

---

## 3. Endpoint summary

| Area | Method | Path | Returns | Frontend method |
|---|---|---|---|---|
| Ops | GET | `/health` | status | (ops only) |
| Mission | GET | `/api/mission` | `MissionConfig` | `MissionApi.config` |
| Mission | GET | `/api/mission/events` | `MissionEvent[]` | `MissionApi.events` |
| Mission | GET | `/api/crew/{id}/timeline?from&to` | `MissionEvent[]` | `MissionApi.timeline` |
| Crew | GET | `/api/crew` | `Astronaut[]` | `CrewApi.list` / `get` |
| Crew | GET | `/api/crew/{id}` | `Astronaut` | (convenience) |
| Telemetry | GET | `/api/crew/{id}/metrics/{metric}?from&to&bucket` | `Sample[]` | `TelemetryApi.series` |
| Telemetry | GET | `/api/crew/{id}/metrics/{metric}/baseline` | `Baseline \| null` | `TelemetryApi.baseline` |
| Telemetry | GET | `/api/crew/{id}/vitals/live` | `LiveVitals` | `TelemetryApi.live` |
| Telemetry | GET | `/api/crew/{id}/checkins?from&to` | `CheckIn[]` | `TelemetryApi.checkIns` |
| Assessment | GET | `/api/assessment/hazards?at&autonomous` | `HazardAssessment[]` | `AssessmentApi.hazards` |
| Assessment | GET | `/api/assessment/hazards/{hazard}/history?crew&fromDay&at&autonomous` | `Sample[]` | `AssessmentApi.hazardHistory` |
| Assessment | GET | `/api/assessment/crew-summaries?at&autonomous` | `CrewSummary[]` | `AssessmentApi.crewSummaries` |
| Assessment | GET | `/api/insights?at&autonomous` | `Insight[]` | `AssessmentApi.insights` |
| Assessment | GET | `/api/crew/{id}/metrics/{metric}/interpretation?at&autonomous` | `MetricInterpretation` | `AssessmentApi.interpretMetric` |
| Crew Mode | POST | `/api/crew/{id}/checkins` | `CheckIn` (201) | `CrewModeApi.submitCheckIn` |
| Crew Mode | GET | `/api/questionnaires` | `Record<QuestionnaireId, Questionnaire>` | `CrewModeApi.questionnaires` |
| Crew Mode | GET | `/api/crew/{id}/assignments` | `Assignment[]` | `CrewModeApi.assignments` |
| Crew Mode | GET | `/api/assignments/{assignmentId}` | `Assignment` | `CrewModeApi.assignment` |
| Crew Mode | PUT | `/api/assignments/{assignmentId}/progress` | `Assignment` | `CrewModeApi.saveProgress` |
| Crew Mode | POST | `/api/assignments/{assignmentId}/submit` | `Assignment` | `CrewModeApi.submitQuestionnaire` |
| Nova | POST | `/api/crew/{id}/companion/reply` | `CompanionTurn` | `CompanionApi.start` / `send` |
| Nova | POST | `/api/crew/{id}/shared-notes` | `SharedNote` (201) | `CompanionApi.resolveCard` (share) |
| Actions | GET | `/api/actions` | `ActionLogEntry[]` | `ActionsApi.log` |
| Actions | POST | `/api/actions` | `ActionLogEntry` (201) | `ActionsApi.record` |
| Actions | GET | `/api/crew/{id}/messages` | `CrewMessage[]` | `ActionsApi.messages` |
| Actions | POST | `/api/crew/{id}/messages` | `CrewMessage` (201) | `ActionsApi.sendMessage` |
| Actions | POST | `/api/insights/{insightId}/resolve` | `Resolution` | `ActionsApi.resolve` |
| Actions | POST | `/api/insights/{insightId}/reopen` | `{ "ok": true }` | `ActionsApi.reopen` |

URL-encode path segments: insight ids contain `:` (`safety%3Asf-ahmad-2`).

---

## 4. Types

These are the frontend's own types (`src/app/core/models/`), and they are the source of truth.
For pydantic, mirror them field for field.

```ts
// ── Enums ──────────────────────────────────────────────────────────
type HazardKey = 'radiation' | 'isolation' | 'distance' | 'gravity' | 'environment'; // canonical order
type Status = 'nominal' | 'watch' | 'alert';
type Severity = 'alert' | 'watch' | 'info';
type CrewRole = 'CDR' | 'FE' | 'MS' | 'CMO';
type MetricKey =
  | 'hr' | 'hrv' | 'spo2' | 'coreTemp' | 'bpSys' | 'bpDia' | 'resp'          // vitals, hourly
  | 'sleepDuration' | 'sleepEfficiency'                                       // daily
  | 'radDose' | 'doseRate'                                                    // daily cumulative mSv / hourly µSv/h
  | 'boneDensity' | 'muscleMass' | 'legStrength'                              // weekly / per exercise session
  | 'mood' | 'energy' | 'sleepQuality'                                        // from daily check-ins (1–5)
  | 'stress' | 'workload'                                                     // from questionnaires (0–100)
  | 'reactionTime' | 'visionAcuity'                                           // weekly tests
  | 'wbc' | 'lymphocytes' | 'boneMarker'                                      // monthly labs
  | 'co2' | 'cabinNoise' | 'cabinTemp' | 'cabinHumidity'                      // environment
  | 'medKit';                                                                 // ship-wide, weekly
// Units, cadence, thresholds and display ranges per metric: src/app/core/models/metric.ts (METRICS).

// ── Mission ────────────────────────────────────────────────────────
interface MissionConfig {
  code: string;                 // "NHX-1"
  name: string;                 // "Mars Transit"
  vehicle: string;              // "DSV Meridian"
  durationDays: number;         // 260
  launchEpochMs: number;        // Unix ms of mission hour 0 (Day 1 00:00 UTC)
  careerDoseLimitMsv: number;   // 600
  currentDay: number;           // the live day
  trajectoryAu: number[];       // Earth–ship distance per day, index 0 = Day 1; length ≥ durationDays + 1
  team: { flightSurgeon: string; flightDirector: string };   // "Haleem", "Hamza"
}

type MissionEventKind = 'eva' | 'spe' | 'exercise' | 'sleep-shift' | 'burn' | 'medical' | 'anomaly';
interface MissionEvent {
  id: string;
  kind: MissionEventKind;
  label: string;                // "EVA-3 high-gain antenna gimbal" (first word is used as a short label)
  start: number;                // mission hour
  end: number;                  // mission hour
  crewIds: string[];            // [] = whole crew
  hazards: HazardKey[];
  planned?: boolean;            // scheduled in the future
  missed?: boolean;             // exercise session that was not done
}

// ── Crew ───────────────────────────────────────────────────────────
interface Astronaut {
  id: string;                   // "ahmad"
  name: string;                 // single name: "Ahmad"
  role: CrewRole;
  callsign: string;
  age: number;
  agency: string;
  sleepStartHour: number;       // ship time (UTC hour of day)
  exerciseHour: number;
  persona: string;              // short description for the profile header
}

interface CrewSummary {
  crewId: string;
  status: Status;               // worst of hazard statuses and active (unresolved) insight severities
  checkInHour: number | null;   // mission hour of today's check-in, null if not done yet
  nextEvent: { label: string; day: number } | null;
}

// ── Telemetry ──────────────────────────────────────────────────────
interface Sample { t: number; v: number }          // t = mission hour

/** Personal baseline from the astronaut's OWN data (never a population average). */
interface Baseline {
  mean: number;
  low: number;                  // normal range low edge
  high: number;                 // normal range high edge
  source: string;               // "In-flight D8–D40, resting"
}

interface LiveVitals {
  crewId: string;
  t: number;                                       // fractional mission hour of the reading
  values: Partial<Record<MetricKey, number>>;      // hr, hrv, spo2, coreTemp, bpSys, bpDia, resp
}

type Symptom = 'headache' | 'nausea' | 'vision' | 'back-pain' | 'congestion' | 'other';
interface CheckIn {
  id: string;
  crewId: string;
  day: number;
  at: number;                   // mission hour submitted
  mood: number;                 // 1–5
  sleepQuality: number;         // 1–5
  energy: number;               // 1–5
  symptoms: Symptom[];
  note?: string;
}
interface CheckInDraft { mood: number; sleepQuality: number; energy: number; symptoms: Symptom[]; note?: string }

// ── Assessment ─────────────────────────────────────────────────────
interface HazardDriver {
  label: string;                // "Mood, 7-day mean"
  metric?: MetricKey;           // makes the driver clickable (opens that metric)
  value: string;                // formatted: "3.6/5"
  contribution: number;         // 0–100
  concern?: string;             // plain-language phrase: "mood has been lower than usual"
}

interface HazardAssessment {
  crewId: string;
  hazard: HazardKey;
  score: number;                // 0–100 integer
  status: Status;               // from score: ≥70 alert, ≥40 watch, else nominal
  drivers: HazardDriver[];      // sorted by contribution, highest first
  headline: string;             // key figure: "319 mSv · 53% of career limit"
  explanation: string;          // plain language, no scores, no pronouns (shown to the astronaut)
}

interface Evidence {
  label: string;
  value: string;                // formatted current value
  reference?: string;           // formatted personal baseline / reference
  metric?: MetricKey;
  crewId?: string;
  direction?: 'up' | 'down' | 'flat';
}

type ActionKind = 'acknowledge' | 'message' | 'questionnaire' | 'countermeasure' | 'escalate';
type LogKind = 'acknowledge' | 'message' | 'in-person' | 'psych' | 'medical' | 'escalate'
             | 'countermeasure' | 'questionnaire' | 'resolve' | 'reopen';
interface RecommendedAction {
  kind: ActionKind;
  label: string;                // button text: "Adjust sleep shift"
  detail: string;
  countermeasure?: 'exercise' | 'sleep-shift' | 'rest' | 'storm-shelter';
  questionnaireId?: string;
  log?: LogKind;                // log kind when it differs from `kind` (e.g. 'in-person', 'psych')
}

interface Resolution {
  at: number;                   // mission hour
  by: string;                   // flight surgeon name
  note: string;
  severity: Severity;           // severity when resolved
}

interface Insight {
  id: string;                   // stable, see "Ids"
  crewId: string | null;        // null = whole crew
  severity: Severity;
  hazards: HazardKey[];
  title: string;
  summary: string;
  whyItMatters: string;
  detectedAt: number;           // mission hour
  primaryMetric?: MetricKey;
  evidence: Evidence[];
  confidence: number;           // 0–1
  recommended: RecommendedAction[];
  resolution?: Resolution;      // present = resolved (leaves all active views)
  reopened?: boolean;           // was resolved, now MORE severe, active again
}

interface MetricInterpretation {
  crewId: string;
  metric: MetricKey;
  summary: string;              // what changed
  whyItMatters: string;
  contributing: Evidence[];     // signals moving together with this one
  confidence: number;           // 0–1
  recommended: RecommendedAction[];
  trend: 'up' | 'down' | 'flat';
  status: Status;
}

// ── Crew Mode ──────────────────────────────────────────────────────
type QuestionnaireId = 'wellbeing' | 'sleep' | 'workload' | 'team';
interface Question {
  id: string;
  text: string;
  kind: 'scale' | 'text';
  options?: { value: number; label: string }[];   // scale 1..5
  reverse?: boolean;            // higher answer = better (inverted when scoring)
  optional?: boolean;
}
interface Questionnaire {
  id: QuestionnaireId;
  title: string;
  purpose: string;
  minutes: number;
  hazards: HazardKey[];
  feeds?: MetricKey;            // the score is written to this metric (stress / workload)
  scoreMeaning: string;         // "more stress"
  questions: Question[];
}
type AnswerValue = number | string;
interface Assignment {
  id: string;
  crewId: string;
  questionnaireId: QuestionnaireId;
  assignedBy: string;
  note?: string;
  assignedAt: number;           // mission hour
  dueDay: number;
  status: 'assigned' | 'in-progress' | 'done';
  answers: Record<string, AnswerValue>;
  currentIndex: number;         // resume position
  completedAt?: number;
  score?: number;               // 0–100, higher = more strain
}

// ── Nova (wire format only; nothing is stored) ─────────────────────
type SafetyCategory = 'self-harm' | 'medical';
type SafetySignal =
  | 'wish-to-die' | 'suicidal-thoughts' | 'self-harm-intent' | 'confirmed-when-asked'
  | 'chest-pain' | 'breathing' | 'stroke-signs' | 'unconscious' | 'vision-loss' | 'severe-headache' | 'seizure';
type ChatCard =
  | { kind: 'checkin'; draft: CheckInDraft; status: 'proposed' | 'sent' | 'dismissed' }
  | { kind: 'share'; text: string; status: 'proposed' | 'sent' | 'dismissed' }
  | { kind: 'safety'; category: SafetyCategory }
  | { kind: 'breathing' };
interface CompanionState { pendingSafetyCheck: boolean; awaitingCheckIn: boolean }
interface CompanionRequest {
  text?: string;                                           // omitted = start (greeting)
  history: { role: 'astronaut' | 'nova'; text: string }[]; // recent turns, oldest first (≤ 16)
  state: CompanionState;
}
interface CompanionTurn {
  replies: { text: string; card?: ChatCard }[];
  state: CompanionState;
  safety?: { category: SafetyCategory; signal: SafetySignal };
}
interface SharedNote { id: string; crewId: string; at: number; text: string }

// ── Mission Control actions ────────────────────────────────────────
interface ActionLogEntry {
  id: string;
  insightId: string;
  crewId: string | null;
  at: number;                   // mission hour (exact, not rounded)
  by: string;                   // server fills: flight surgeon name
  kind: LogKind;
  label: string;
  detail?: string;
}
interface CrewMessage {
  id: string;
  crewId: string;
  from: string;                 // flight surgeon name
  text: string;
  sentAt: number;               // mission hour
  deliverAt: number;            // sentAt + one-way signal delay (hours)
  insightId?: string;
}
```

---

## 5. Endpoints

### 5.1 Ops

#### GET `/health`

```json
{ "status": "ok", "companion": "gemini", "missionHour": 3393.90 }
```

`companion` is `"gemini"`, `"rules"` (deterministic fallback) or `"off"`. Ops only: the frontend does not call it.

### 5.2 Mission

#### GET `/api/mission` → `MissionConfig`

Called once before the first render. If it fails, the frontend shows "cannot reach its server".

```json
{
  "code": "NHX-1", "name": "Mars Transit", "vehicle": "DSV Meridian",
  "durationDays": 260, "launchEpochMs": 1782518400000, "careerDoseLimitMsv": 600, "currentDay": 142,
  "team": { "flightSurgeon": "Haleem", "flightDirector": "Hamza" },
  "trajectoryAu": [0.00505, 0.00659, "… one value per day, 261 values …"]
}
```

`trajectoryAu[d]` is the Earth–ship distance at the start of Day d+1. The frontend computes the one-way
delay as `AU × 499.005 s` (interpolated by hour). Fill it from JPL Horizons ([section 8](#8-real-nasa-data)).

#### GET `/api/mission/events` → `MissionEvent[]`

All mission events, past and planned (EVAs, solar particle events, burns, sleep shifts, anomalies).
Exercise sessions are **not** included here (see timeline).

```json
[
  { "id": "spe-97", "kind": "spe", "label": "Solar particle event, storm shelter", "start": 2307, "end": 2339, "crewIds": [], "hazards": ["radiation", "isolation"] },
  { "id": "eva-3", "kind": "eva", "label": "EVA-3 high-gain antenna gimbal", "start": 3464, "end": 3471, "crewIds": ["ahmad", "hannan"], "hazards": ["radiation", "environment"], "planned": true }
]
```

#### GET `/api/crew/{id}/timeline?from=&to=` → `MissionEvent[]`

Events overlapping `[from, to]` (mission hours) that affect this astronaut (their own plus whole-crew events),
**plus their exercise sessions** (`kind: "exercise"`, `missed: true` when skipped, label `"Exercise"` or
`"Exercise missed"`), sorted by `start`. Used for chart annotations.

### 5.3 Crew

#### GET `/api/crew` → `Astronaut[]`

```json
[
  { "id": "hashir", "name": "Hashir", "role": "CDR", "callsign": "KESTREL", "age": 44, "agency": "NHX",
    "sleepStartHour": 22, "exerciseHour": 6, "persona": "Third long-duration flight. Former test pilot. …" }
]
```

Order = display order. Cached by the frontend for the session.

#### GET `/api/crew/{id}` → `Astronaut` (404 if unknown)

### 5.4 Telemetry

#### GET `/api/crew/{id}/metrics/{metric}?from=&to=&bucket=` → `Sample[]`

Samples with `from ≤ t ≤ to`, oldest first; `to` is clamped to now. `bucket` (hours, default 1): when
greater than 1, return the **mean per bucket** (`t` = the bucket's last sample time). The frontend asks for
`bucket=1` for 24 h and 7 d, `6` for 30 d, and `24` for the whole mission. Return whatever exists for
the cadence: weekly metrics just return fewer points.

```json
[ { "t": 3380, "v": 72.8 }, { "t": 3381, "v": 60.3 }, { "t": 3382, "v": 59.2 } ]
```

`mood`, `energy` and `sleepQuality` are the check-in values as series (`t` = check-in time). `stress` and
`workload` include questionnaire results (see submit).

#### GET `/api/crew/{id}/metrics/{metric}/baseline` → `Baseline | null`

The astronaut's personal normal range from **their own** reference window: in-flight Day 8–40, using
**resting hours only** for vitals (exclude exercise and EVA hours); preflight values for bone and lean mass.
`null` when there is no baseline (e.g. cumulative dose). Charts draw this band.

```json
{ "mean": 63.33, "low": 51.34, "high": 71.9, "source": "In-flight D8–D40, resting" }
```

The reference uses the mean with a 5th–95th percentile band and a minimum half-width per metric
(`MIN_HALF_BAND` in `core/mock/mock-database.ts`).

#### GET `/api/crew/{id}/vitals/live` → `LiveVitals`

The current reading of the 7 vitals. Polled every 3 s. Values can be the newest raw reading.

```json
{ "crewId": "ahmad", "t": 3393.9014, "values": { "hr": 71.9, "hrv": 41.3, "spo2": 98.9, "coreTemp": 36.78, "bpSys": 125.6, "bpDia": 82.5, "resp": 14.6 } }
```

#### GET `/api/crew/{id}/checkins?from=&to=` → `CheckIn[]`

Check-ins with `from ≤ at ≤ to`, oldest first.

### 5.5 Assessment (the "AI")

All five take `at` (mission hour, optional, default now, clamped to now) and `autonomous`
(`true`/`false`, default `false`).

#### GET `/api/assessment/hazards` → `HazardAssessment[]`

**5 rows per astronaut** (one per hazard, canonical order), for the whole crew.

```json
{
  "crewId": "sabaina", "hazard": "radiation", "score": 45, "status": "watch",
  "drivers": [
    { "label": "Excess vs crew median", "value": "+43 mSv", "contribution": 61, "metric": "radDose", "concern": "dose is higher than the rest of the crew" },
    { "label": "Cumulative dose vs career limit", "value": "319 mSv · 53%", "contribution": 33, "metric": "radDose", "concern": "total dose is building toward the career limit" },
    { "label": "Dose rate, last 3 h", "value": "78 µSv/h", "contribution": 0, "metric": "doseRate", "concern": "radiation levels are elevated right now" }
  ],
  "headline": "319 mSv · 53% of career limit",
  "explanation": "Dose is higher than the rest of the crew. Keep storm-shelter procedures fresh and limit time in lightly shielded modules."
}
```

#### GET `/api/assessment/hazards/{hazard}/history?crew=&fromDay=` → `Sample[]`

That hazard's score for one astronaut, evaluated once per day from `fromDay` to the day of `at`
(`t` = evaluation hour, `v` = score 0–100). Used for the trend sparkline on each hazard tile.

#### GET `/api/assessment/crew-summaries` → `CrewSummary[]`

```json
[
  { "crewId": "hashir", "status": "nominal", "checkInHour": 3389.63, "nextEvent": null },
  { "crewId": "ahmad", "status": "watch", "checkInHour": 3387.88, "nextEvent": { "label": "EVA-3", "day": 145 } }
]
```

`status` = worst of the astronaut's 5 hazard statuses and their **unresolved** insight severities
(`info` counts as nominal). `nextEvent.label` = first word of the next event's label.

#### GET `/api/insights` → `Insight[]`

Every finding for the whole crew, **including resolved ones** (with `resolution`). The frontend filters
active and resolved findings itself. Sort: safety first, then by severity, then newest.

```json
{
  "id": "sleep-debt:ahmad", "crewId": "ahmad", "severity": "watch", "hazards": ["isolation", "environment"],
  "title": "Sleep debt building ahead of EVA-3",
  "summary": "Ahmad has averaged 5.4 h of sleep over the last 5 nights, 1.5 h below personal baseline. …",
  "whyItMatters": "Accumulated sleep loss degrades reaction time, procedural memory and error detection. …",
  "detectedAt": 3386.61, "primaryMetric": "sleepDuration", "confidence": 0.88,
  "evidence": [
    { "label": "Sleep, 5-night mean", "value": "5.4 h", "reference": "6.9 h", "metric": "sleepDuration", "crewId": "ahmad", "direction": "down" },
    { "label": "Next EVA", "value": "EVA-3 in 3 d" }
  ],
  "recommended": [
    { "kind": "countermeasure", "countermeasure": "sleep-shift", "label": "Adjust sleep shift", "detail": "Return sleep start to baseline for 2 nights; resume shift D144." },
    { "kind": "questionnaire", "questionnaireId": "sleep", "label": "Assign sleep questionnaire", "detail": "Short sleep-quality questionnaire to confirm the cause." },
    { "kind": "escalate", "label": "Escalate EVA go/no-go input", "detail": "Flag to Earth flight surgeon for EVA readiness review." }
  ]
}
```

**Resolution rule:** if a resolution exists for the id and the current severity is **not higher** than
`resolution.severity`, include `resolution`. If the current severity **is higher**, omit `resolution` and
set `reopened: true` (the finding is active again). Insights from shared Crew Mode data and from safety flags
are described in [section 7.3](#73-insights).

#### GET `/api/crew/{id}/metrics/{metric}/interpretation` → `MetricInterpretation`

Plain-language reading of one metric for one astronaut (shown in the metric sheet with a confidence value).

```json
{
  "crewId": "ahmad", "metric": "sleepDuration",
  "summary": "Over the last 7 days sleep duration averaged 5.5 h, −21% versus Ahmad's normal (6.9 h), below the usual range. The trend is falling.",
  "whyItMatters": "Accumulated sleep loss degrades reaction time, procedural memory and error detection. …",
  "contributing": [ { "label": "Sleep efficiency, 5 nights", "value": "79%", "reference": "88%", "metric": "sleepEfficiency", "crewId": "ahmad", "direction": "down" } ],
  "confidence": 0.88, "recommended": [ "… RecommendedAction …" ], "trend": "down", "status": "watch"
}
```

### 5.6 Crew Mode (shared with Mission Control)

#### POST `/api/crew/{id}/checkins` → 201 `CheckIn`

Body `CheckInDraft`: `{ "mood": 3, "sleepQuality": 2, "energy": 3, "symptoms": ["headache"], "note": "optional" }`.
`mood`, `sleepQuality` and `energy` are integers 1–5 (otherwise 422). The server stamps `at` = now and
`day`. **One check-in per astronaut per day**: a second one on the same day replaces the first.
`id` = `ci-<crewId>-<day>`.

#### GET `/api/questionnaires` → `Record<QuestionnaireId, Questionnaire>`

The four questionnaires. Copy them verbatim from `src/app/core/mock/questionnaires.ts`
(`QUESTIONNAIRES`). The questions are our own; don't swap in published clinical instruments.

#### GET `/api/crew/{id}/assignments` → `Assignment[]`

Questionnaires assigned to this astronaut (all statuses).

#### GET `/api/assignments/{assignmentId}` → `Assignment` (404 if unknown)

#### PUT `/api/assignments/{assignmentId}/progress` → `Assignment`

Body `{ "answers": { "q1": 3 }, "currentIndex": 1 }`. Saves the answers so the questionnaire can be resumed;
status becomes `in-progress` (unless already `done`).

#### POST `/api/assignments/{assignmentId}/submit` → `Assignment`

Body `{ "answers": { … } }`. Scores the questionnaire 0–100 with `scoreQuestionnaire` (same file):
`round((mean − 1) / 4 × 100)` over the 1–5 scale answers, with `reverse` items counted as `6 − answer` and text answers ignored. Sets `status: "done"`,
`score`, `completedAt` and `currentIndex = questions.length`. **If the questionnaire `feeds` a metric
(`stress` or `workload`), also append a sample `{ t: now, v: score }` to that metric.** This is how
Mission Control sees the result. Returns 409 if already submitted.

### 5.7 Nova (private): see [section 6](#6-nova-companion-privacy-contract) first

#### POST `/api/crew/{id}/companion/reply` → `CompanionTurn`

Start (greeting): `{ "history": [], "state": { "pendingSafetyCheck": false, "awaitingCheckIn": false } }`

Turn:

```json
{
  "text": "can you do my check-in? slept badly, feeling low, bit of a headache",
  "history": [
    { "role": "nova", "text": "Hi Hannan. How are you doing today?" },
    { "role": "astronaut", "text": "I miss my family a lot" },
    { "role": "nova", "text": "That makes sense, …" }
  ],
  "state": { "pendingSafetyCheck": false, "awaitingCheckIn": false }
}
```

Response:

```json
{
  "replies": [
    { "text": "Here is your check-in from what you told me. Check-ins are shared with Mission Control, so review it before sending.",
      "card": { "kind": "checkin", "status": "proposed",
                "draft": { "mood": 2, "sleepQuality": 2, "energy": 3, "symptoms": ["headache"] } } }
  ],
  "state": { "pendingSafetyCheck": false, "awaitingCheckIn": false }
}
```

Safety turn (the server has **already** recorded the flag; see below):

```json
{
  "replies": [ { "text": "Thank you for telling me. You don't have to carry this alone. I have let Haleem, your flight surgeon, know …",
                 "card": { "kind": "safety", "category": "self-harm" } } ],
  "state": { "pendingSafetyCheck": false, "awaitingCheckIn": false },
  "safety": { "category": "self-harm", "signal": "wish-to-die" }
}
```

Cards the server may propose:

| Card | When | What the frontend does on confirm |
|---|---|---|
| `checkin` | The astronaut asks Nova to do their check-in. `draft` is extracted from what they said; **no `note`** (chat text never becomes a note). | `POST /api/crew/{id}/checkins` with the draft |
| `share` | The astronaut asks to tell Haleem something. `text` = only the part they asked to share; editable before sending. | `POST /api/crew/{id}/shared-notes` |
| `safety` | Safety exception fired (always together with `safety`) | Shows the safety card (nothing to confirm) |
| `breathing` | Panic / anxiety | Shows a breathing exercise |

`text` is at most 2000 characters (422 otherwise). If the model call fails, return 503. The frontend then shows
an "I can't reach the companion service" reply that also tells the astronaut to talk to the CMO or a crewmate if unwell.

#### POST `/api/crew/{id}/shared-notes` → 201 `SharedNote`

Body `{ "text": "Please tell Haleem I would like a private call this week" }` (1–2000 chars).
Creates the `note:<id>` insight for Mission Control. Only called after the astronaut confirms a share card.

### 5.8 Mission Control actions

#### GET `/api/actions` → `ActionLogEntry[]`

Every logged action, oldest first.

#### POST `/api/actions` → 201 `ActionLogEntry`

Body: `{ "insightId": "sleep-debt:ahmad", "crewId": "ahmad", "kind": "in-person", "label": "In-person check by the CMO", "detail": "optional" }`.
`kind` is any `LogKind` except `resolve` and `reopen` (those have their own endpoints). The server adds `id`,
`at` (now, exact) and `by` (the flight surgeon).

#### GET `/api/crew/{id}/messages` → `CrewMessage[]`

All messages to this astronaut, including ones still in transit (`deliverAt` in the future). The
astronaut's view shows "on its way" until `deliverAt`.

#### POST `/api/crew/{id}/messages` → 201 `CrewMessage`

Body `{ "text": "Ahmad, it's Haleem. …", "insightId": "safety:sf-ahmad-2" }` (`insightId` optional).
`sentAt` = now, `deliverAt` = now + one-way delay in hours (from `trajectoryAu`).
If `insightId` is given, **also append** an action log entry:
`{ kind: "message", label: "Messaged Ahmad", detail: "“<text>” · arrives 5m 32s later" }`.

#### POST `/api/insights/{insightId}/resolve` → `Resolution`

Body `{ "crewId": "ahmad", "note": "Spoke with Ahmad; safe and supported, crewmate with them", "severity": "alert" }`.
`note` is required (1–1000 chars). Saves the resolution (`at` = now, `by` = flight surgeon) and appends a
`{ kind: "resolve", label: "Resolved", detail: note }` log entry. Resolving an id again overwrites the
resolution.

```json
{ "at": 3393.92, "by": "Haleem", "note": "Spoke with Ahmad; safe and supported, crewmate with them", "severity": "alert" }
```

#### POST `/api/insights/{insightId}/reopen` → `{ "ok": true }`

Body `{ "crewId": "ahmad" }`. Deletes the resolution and appends a `{ kind: "reopen", label: "Reopened" }` log entry.

---

## 6. Nova companion: privacy contract

Nova is the astronaut's **private** companion. These rules are product requirements, not suggestions.

1. **No storage.** The reply endpoint is stateless. Do not write the message text, the history or the
   reply to the database, to logs, to analytics or to error trackers (also strip request bodies from
   access logs and exception reports for this route). The conversation lives only in the astronaut's browser tab.
2. **No analysis.** Conversation content never reaches the analysis engine or Mission Control. No mood
   score, no loneliness score, no usage metrics. **This is why the RIDGE loneliness scoring was removed.**
3. **Only explicit shares leave the chat**, through their own endpoints after the astronaut confirms a card:
   a check-in (exact fields shown, no chat text attached) or a shared note (editable text).
4. **Safety exception.** If the astronaut's message shows explicit self-harm intent or an acute medical red
   flag, the server:
   - replies with a **pre-written** message (not model-generated) and a `safety` card;
   - records a `SafetyFlag` `{ id, crewId, at: exact now, category, signal }`, which **contains no text**;
   - returns `safety` in the response.

   The flag becomes the `safety:<flagId>` Alert insight for the flight surgeon only (see 7.3).
   **Ambiguous hopelessness** ("what's the point") does not alert: Nova asks directly whether the astronaut has thoughts of
   harming themself and sets `state.pendingSafetyCheck = true`. A "yes" on the next turn raises
   `signal: "confirmed-when-asked"`. The astronaut is told about this exception before first use
   (frontend consent screen) and every time it happens (the safety card).
5. Medical red flags point the astronaut to the CMO, or to the commander if the CMO is the one who is unwell.
   Nova is supportive and never diagnoses.

### Implementing with Gemini

Reuse the ECHO Gemini client, but change the flow:

```
request ─▶ 1. deterministic safety check on `text` (regexes below; run BEFORE any model call)
             ├─ self-harm / medical match ─▶ pre-written reply + safety card + record SafetyFlag ─▶ return
             ├─ state.pendingSafetyCheck and the answer is yes ─▶ same as above, signal "confirmed-when-asked"
             └─ hopelessness match ─▶ pre-written direct question, state.pendingSafetyCheck = true ─▶ return
           2. intent rules: check-in request / share request / breathing ─▶ build the card (fields from the
              text; share text = the words after "tell Haleem …"), short model or template reply
           3. otherwise ─▶ Gemini reply with the system prompt + `history` + `text`
              (supportive, short, no diagnosis, never claims to have told anyone)
           4. optionally run Gemini's safety classifier on `text` as a second net; a positive result is handled as in 1
```

- The reference behaviour (all patterns, replies, card extraction and the safety question) is in
  `src/app/core/mock/nova.ts`. `npx tsx scripts/nova-check.ts` prints a scripted conversation.
- The Gemini key stays on the server (`GEMINI_API_KEY`). The frontend never calls Gemini.
- Map Gemini errors and quota limits to 503. The frontend tells the astronaut to retry and never retries in a loop.
- `history` is at most the last 16 turns. Treat it as untrusted input.

---

## 7. Analysis engine

The frontend's mock engine is the reference implementation. Port it, or call your own models, as long as
the output types match. Files (all in `src/app/core/mock/`):

| File | What it does |
|---|---|
| `engine/context.ts` | Shared helpers: recent means (resting hours only for vitals), baseline z-scores, `combine` |
| `engine/hazards.ts` | 0–100 hazard scores with drivers, headline and explanation; daily hazard history |
| `engine/insights.ts` | Insight rules, Crew Mode insights (safety, notes, questionnaires), sorting |
| `engine/interpret.ts` | `MetricInterpretation` for any metric |
| `mock-database.ts` | Baselines (`baseline()`), check-in series, data store |
| `generator.ts`, `personas.ts`, `mission-plan.ts` | Seeded simulated crew data and the planted storylines |

`npx tsx scripts/calibrate.ts 14` prints every score and insight at Day 142, 14:00. Use it to compare your port.

### 7.1 Hazard scores

- Each hazard has drivers with a contribution 0–100 and a weight. Score =
  `round(clamp(0.4 × max(contribution) + 0.6 × weighted mean, 0, 100))` (`combine`).
- Status: score ≥ 70 → `alert`, ≥ 40 → `watch`, else `nominal`.
- A driver measured against the baseline uses z = distance from the personal mean ÷ half the baseline band width,
  in the concerning direction; contribution = `clamp(z × 45, 0, 100)` (band edge ≈ 45).
- Drivers per hazard (weights in brackets):

| Hazard | Drivers |
|---|---|
| radiation | cumulative dose vs career limit (.55), excess vs crew median (.25), dose rate last 3 h (.12), lymphocytes latest lab |
| isolation | mood 7-d (.22), stress latest (.22), HRV 7-d resting (.16), sleep efficiency 7 nights (.14), reaction time (.11), missed check-ins 7 d (.15) |
| distance | workload (.32), stress under autonomy (.16), signal delay / link state, symptoms needing Earth consult (.15), medical supply readiness (.15) |
| gravity | bone density change (.24), lean mass change (.14), leg strength change (.10), fluid-shift symptoms 7 d (.24), near vision (.12), systolic BP 7-d (.08), back pain reports (.08) |
| environment | CO₂ 3-day mean (.32), sleep efficiency (.18), night-time noise (.14), SpO₂ 3-day (.10), cabin temperature/humidity, headache/congestion reports (.16) |

- `explanation` is built from the `concern` phrases of the top drivers, with no numbers and no pronouns. It is shown to astronauts.

### 7.2 Hazard history

The same scoring evaluated once per day (`t` = that day's evaluation hour) from `fromDay` to the current day.

### 7.3 Insights

Rules (id → trigger), from `engine/insights.ts`:

| Id | Severity | Trigger (summary) |
|---|---|---|
| `sleep-debt:<crew>` | watch/alert | 5-night sleep mean well below personal baseline; alert at a 2 h deficit (1.8 h with an EVA soon) |
| `isolation-stress:<crew>` | watch/alert | several independent isolation signals moving the same way (mood, stress, HRV, sleep, missed check-ins); alert at 4 or more |
| `rad-outlier:<crew>` | watch | dose clearly above the crew median |
| `fluid-shift:<crew>` | watch | headaches plus vision change in check-ins and/or vision test: SANS screen advised |
| `exercise:<crew>` | watch | missed exercise sessions |
| `bone-on-track:<crew>` | info | bone loss within the expected rate (a positive finding) |
| `workload:<crew>` | info | high workload score before an EVA |
| `co2:crew` | watch/alert | crew 2-day CO₂ mean above 3 mmHg; alert at 4 (crew-wide, `crewId: null`) |
| `checkin:<crew>:<day>` | info/watch | low mood or a notable symptom in today's check-in |
| `safety:<flagId>` | **alert** | a Nova `SafetyFlag` (see below) |
| `note:<noteId>` | info | a shared note from Nova |
| `q:<assignmentId>` | info/watch | a submitted questionnaire; watch at score ≥ 60 |

**Safety insight** (`safety:<flagId>`). This alert must be actionable:
- title: `Urgent: <Name> <SAFETY_SIGNAL_LABEL[signal]>` (e.g. "Urgent: Ahmad expressed a wish to die"). It names a category, never the astronaut's words;
- evidence: when (exact time + arrival on Earth), what Nova already did, shared-data context (7-day
  mood, sleep last 5 nights, HRV, missed check-ins, upcoming EVA) and who on board can help;
- recommended: a numbered response protocol (message now, in-person check by a crewmate / CMO, psych conference,
  escalate to the flight director);
- always sorted first; a new safety statement always creates a new flag, so a new alert;
- `SAFETY_SIGNAL_LABEL` is in `src/app/core/models/crew-mode.ts`.

### 7.4 Interpretation

`engine/interpret.ts`: 7-day mean vs personal baseline (percent and direction), trend from the slope,
related out-of-range signals as `contributing`, `whyItMatters` and `recommended` from the matching insight
rule when there is one, and a confidence based on data coverage.

---

## 8. Real NASA data

Keep RIDGE's NASA integrations. They feed the new types:

| Source | Feeds | How |
|---|---|---|
| **NASA DONKI** (SEP, flares, CMEs) | `MissionEvent` with `kind: "spe"`, `hazards: ["radiation"]`, `crewIds: []`, `label: "Solar particle event"` (or the flare class) | Map each event to a mission hour (`(eventUnixMs − launchEpochMs) / 3.6e6`). Use the event to raise `doseRate` samples in the following hours; cumulative `radDose` follows. Keep the live / cached / snapshot fallback. |
| **NASA JPL Horizons** | `MissionConfig.trajectoryAu` | One Earth–ship distance per mission day. For a Mars transit, the ship's distance grows from ~0 AU at launch to the Earth–Mars distance at arrival. Interpolate along the transfer, or use Horizons' Earth and Mars vectors and the planned trajectory. The frontend derives the signal delay from it. |
| **Gemini** | Nova replies | [Section 6](#6-nova-companion-privacy-contract). |

If you want to show data provenance later, add an optional `source` string to `MissionEvent` (e.g. `"NASA DONKI"`).
The frontend ignores unknown fields.

---

## 9. Suggested Supabase schema

The backend is the only client (RLS off, as today). There is **no chat table**.

| Table | Columns |
|---|---|
| `mission` | single row: code, name, vehicle, duration_days, launch_epoch_ms, career_dose_limit_msv, flight_surgeon, flight_director |
| `trajectory` | day, distance_au |
| `astronauts` | id (slug), name, role, callsign, age, agency, sleep_start_hour, exercise_hour, persona, sort |
| `mission_events` | id, kind, label, start_h, end_h, crew_ids text[], hazards text[], planned, source |
| `samples` | crew_id, metric, t (float8), v (float8); index (crew_id, metric, t). Hourly vitals for 4 crew × 260 days ≈ 175k rows. |
| `exercise_sessions` | crew_id, day, start_h, end_h, done |
| `baselines` | crew_id, metric, mean, low, high, source (or compute and cache) |
| `checkins` | id, crew_id, day, at, mood, sleep_quality, energy, symptoms text[], note; unique (crew_id, day) |
| `assignments` | id, crew_id, questionnaire_id, assigned_by, note, assigned_at, due_day, status, answers jsonb, current_index, completed_at, score |
| `safety_flags` | id, crew_id, at, category, signal (**no text column**) |
| `shared_notes` | id, crew_id, at, text |
| `action_log` | id, insight_id, crew_id, at, by, kind, label, detail |
| `crew_messages` | id, crew_id, from, text, sent_at, deliver_at, insight_id |
| `resolutions` | insight_id (pk), at, by, note, severity |

Drop the RIDGE tables `isolation_sessions`, `isolation_messages`, `loneliness_assessments` and `mobility_checks`.
**Delete any stored chat transcripts.**

---

## 10. Running and checking

```bash
# Frontend against your server (server on http://127.0.0.1:8000, CORS allowing http://localhost:4200)
git clone https://github.com/hashir4825/Nova-Helix.git
cd Nova-Helix
npm install
npm start                                      # http://localhost:4200
# open http://localhost:4200/?data=api   (remembered; ?data=mock switches back to built-in demo data)

# Reference output from the built-in engine, to compare with your port
npx tsx scripts/calibrate.ts 14                # every hazard score and insight at Day 142, 14:00
npx tsx scripts/nova-check.ts                  # a scripted Nova conversation, including the safety cases
```

**Checklist before calling it done**

- [ ] `GET /api/mission` returns `trajectoryAu` with at least `durationDays + 1` values.
- [ ] `GET /api/assessment/hazards` returns exactly 5 rows per astronaut.
- [ ] An unknown astronaut returns 404; a check-in with `mood: 9` returns 422.
- [ ] Every GET in the [endpoint summary](#3-endpoint-summary) returns the field names and types in [section 4](#4-types), in camelCase.
- [ ] After resolving a finding, the next `GET /api/insights` includes its `resolution`. After reopening it, `resolution` is gone.
- [ ] Sending Nova "I want to die" returns a `safety` card, and `GET /api/insights` then starts with a `safety:…` Alert that contains no chat text.
- [ ] Nothing from the Nova route appears in the database, logs or error reports.
- [ ] With `?data=api`, Mission Control, a profile, a metric sheet, the check-in, a questionnaire, Nova and resolving a finding all work with no errors in the browser console.

- The base URL is set at build time in `src/environments/environment.ts` (`apiBaseUrl`). For Vercel,
  set it to the deployed backend and add the Vercel origin to the backend's CORS list. Set `dataSource: 'api'` to
  make the backend the default. The URL can't be changed from the browser on purpose, so a crafted link can't
  send crew data to another server.
- If `GET /api/mission` fails at startup, the frontend shows "Nova Healix cannot reach its server". Later
  failures show a banner and the last data received, and it keeps retrying.

---

## 11. Errors

Return JSON `{ "detail": "<message>" }` (FastAPI's default). The frontend shows the message only for
failed writes; reads retry silently.

| Status | When | Example `detail` |
|---|---|---|
| 404 | Unknown astronaut, metric, hazard, assignment or route | `Unknown astronaut 'zed'` |
| 409 | Questionnaire already submitted | `This questionnaire is already submitted` |
| 422 | Invalid body or query (check-in values outside 1–5, empty note, unknown `kind` or `severity`, non-numeric `from`/`to`) | `'mood' must be an integer 1-5` |
| 503 | Database or Gemini unavailable | `Companion unavailable: Gemini rate limit reached, retry shortly` |
| 500 | Bug | (never include request bodies from the Nova route in error reports) |
