# Nova Healix

**Crew health monitoring for a long-duration Mars transit.** NASA Space Apps 2026 · *Create Health Monitoring Software for Astronauts on Space Missions*.

Live app: **https://nova-helix.vercel.app** · Backend API: https://nova-healix-backend-production.up.railway.app (docs at `/docs`)

> Decision-support prototype, not a medical device. Crew data is simulated. Space weather (NASA DONKI) and
> distance (NASA JPL Horizons) are real NASA data.

This repository is the **frontend** (Angular). The backend (FastAPI + Supabase) lives in its own repository; the
contract between the two is [`docs/BACKEND_API_GUIDE.md`](docs/BACKEND_API_GUIDE.md). How to use each screen:
[`docs/USER_MANUAL.md`](docs/USER_MANUAL.md).

## Contents

1. [What it does](#1-what-it-does)
2. [Technologies](#2-technologies)
3. [Run it](#3-run-it)
4. [How the frontend and backend fit together](#4-how-the-frontend-and-backend-fit-together)
5. [Screens and URLs](#5-screens-and-urls)
6. [Project structure](#6-project-structure)
7. [Privacy and safety](#7-privacy-and-safety)
8. [Design and accessibility](#8-design-and-accessibility)
9. [Deployment](#9-deployment)
10. [Troubleshooting](#10-troubleshooting)
11. [Status against the requirements](#11-status-against-the-requirements)
12. [Data sources and credits](#12-data-sources-and-credits)

---

## 1. What it does

On a Mars mission, help from Earth arrives minutes late, so astronauts and their doctors must notice health changes
early and act on their own. Nova Healix watches a crew of four on the *DSV Meridian* (mission NHX-1, a 260-day Earth→Mars
transit) and organises everything around **NASA's five hazards of human spaceflight**: Radiation, Isolation &
confinement, Distance from Earth, Gravity fields, and the Hostile/closed environment.

| For | What they get |
|---|---|
| **Flight surgeon** (Mission Control, Haleem) | The whole crew at a glance; a 0–100 score per hazard; *findings* that explain what changed, why it matters, the evidence and what to do; an action log; resolve / reopen |
| **Astronaut** (Crew Mode) | Their own health in plain language; a 30-second daily check-in and short questionnaires; a camera **Mobility & balance check**; **Nova**, a private companion |

What makes it different:

- **Personal baselines.** Every value is compared with *that astronaut's own normal range*, never a population average.
- **Five-hazard scoring** with explainable drivers ("what feeds this").
- **Nova, a private companion** that stores nothing and shares nothing, except a content-free safety alert when
  someone is at risk (category only, never their words).
- **Camera Mobility & balance check** that runs entirely in the browser (MediaPipe Pose). Only five numbers leave the device.
- **Real NASA data:** the DONKI solar storm replayed on mission day 97 and the JPL Horizons Earth–Mars distance that
  sets the signal delay.

## 2. Technologies

| Layer | Technology | Used for |
|---|---|---|
| Framework | **Angular 22** (standalone components, signals, `OnPush`, new control flow) | The whole app |
| Language | **TypeScript 6** (strict, strict templates) | All code |
| Styling | **SCSS** with design tokens (`src/styles/_tokens.scss`) | Dark theme, layout |
| State | Angular **signals** + RxJS 7 | Stores, data streams |
| Charts | **ECharts 6** via **ngx-echarts 22** (tree-shaken, SVG renderer) | Metric trends with personal baseline bands |
| Small graphics | Hand-drawn **SVG** and **Canvas** | Hazard rings, sparklines, trajectory, animated space backdrop |
| Pose tracking | **@mediapipe/tasks-vision 1.2.0** (PoseLandmarker lite, video mode) | Mobility & balance check, on device |
| Icons | **Lucide** (vanilla icon nodes in our own `<nh-icon>`) | All icons (no emoji) |
| Fonts | **Unbounded** (display), **Sora** (UI), **Martian Mono** (numbers) via @fontsource | Typography |
| HTTP | Angular `HttpClient` (fetch) | Backend API |
| Build | Angular CLI / `@angular/build` (esbuild + Vite dev server) | Dev server and production build |
| Hosting | **Vercel** (static SPA, auto-deploy from GitHub) | Live site |
| Backend (separate repo) | **FastAPI** (Python) on **Railway**, **Supabase** (Postgres), **Google Gemini** (Nova/ECHO replies), **NASA DONKI** + **JPL Horizons** | API, analysis engine, storage |

## 3. Run it

### Requirements

- **Node.js** 22.22+, 24.15+ or 26+ (Angular 22 requirement) and **npm** 11
- A modern browser (Chrome, Edge, Firefox, Safari). The camera check needs **https or localhost**.

### Start the app (demo data, no backend needed)

```bash
git clone https://github.com/hashir4825/Nova-Helix.git
cd Nova-Helix
npm install
npm start            # ng serve → http://localhost:4200
```

`npm start` uses the **built-in demo data**: a seeded, deterministic mission (always Day 142, same crew story every
load). Everything works offline, including Nova (rule-based) and the mobility check.

### Run against a backend

The data source is chosen when the page loads:

| URL | Data |
|---|---|
| `…/?data=mock` | Built-in demo data (remembered in the browser) |
| `…/?data=api` | The backend (remembered in the browser) |

The backend address is fixed at build time, on purpose (a crafted link must never redirect crew data to another server):

| Build | File | Default data | Backend address |
|---|---|---|---|
| `npm start` (development) | `src/environments/environment.development.ts` | demo | `http://127.0.0.1:8000` (a backend running on your machine) |
| `npm run build` (production, Vercel) | `src/environments/environment.ts` | **backend** | `https://nova-healix-backend-production.up.railway.app` |

So, to develop against a backend:

- **Local backend:** start the FastAPI backend on port 8000 (see its README; its `CORS_ORIGINS` must include
  `http://localhost:4200`), then open http://localhost:4200/?data=api.
- **The live backend from your machine:** `npx ng serve --configuration production`, then http://localhost:4200
  (the live backend already allows `http://localhost:4200`).

### Other commands

| Command | What it does |
|---|---|
| `npm run build` | Production build into `dist/nova-frontend/browser` |
| `npm run watch` | Rebuild on change (development) |
| `npx tsx scripts/calibrate.ts 14` | Print every hazard score and finding of the demo engine at Day 142, 14:00 |
| `npx tsx scripts/nova-check.ts` | Run a scripted conversation through the rule-based Nova (incl. the safety cases) |

After changing `angular.json` or adding folders, restart `ng serve`.

## 4. How the frontend and backend fit together

```
 Browser (Angular, Vercel)                                   Backend (FastAPI, Railway)
 ─────────────────────────                                   ──────────────────────────
 Screens ──► data contracts (core/data/apis.ts)
                 │
                 ├─ demo:  core/mock  (seeded data + engine, in the browser)
                 │
                 └─ api:   core/http  ── HTTPS/JSON ──────────►  /api/...  ──► analysis engine (hazards, findings)
                                                                     │         ├─► Supabase (check-ins, actions, …)
                                                                     │         ├─► NASA DONKI, JPL Horizons
                                                                     │         └─► Gemini (Nova replies)
 Camera ─► MediaPipe Pose (in the browser) ─► 5 numbers ─► POST /api/mobility/{crewId}
```

- **One contract, two implementations.** Screens never call HTTP directly. They use abstract APIs in
  [`src/app/core/data/apis.ts`](src/app/core/data/apis.ts): `MissionApi`, `CrewApi`, `TelemetryApi`, `AssessmentApi`,
  `CrewModeApi`, `CompanionApi`, `ActionsApi`, `MobilityApi`. `app.config.ts` binds them either to the demo
  implementation (`core/mock`) or to the HTTP one (`core/http`). Switching to a real backend changed **no screen code**.
- **One endpoint per method.** Each contract method maps to one endpoint; the JSON is the frontend's own model types
  (camelCase, times in *mission hours* since launch). Full list, types and examples: [`docs/BACKEND_API_GUIDE.md`](docs/BACKEND_API_GUIDE.md).
- **The backend is the "AI".** Hazard scores (0–100: watch ≥ 40, alert ≥ 70), findings, evidence, recommended actions
  and metric interpretations come from the backend's analysis engine. The demo engine in `core/mock/engine` is the
  reference the backend was ported from; both produce the same results for the seeded mission.
- **Live feel.** Screens re-fetch every 15 s and right after any change you make; live vitals refresh every 3 s.
  If the backend is unreachable, a banner says so and the last data stays on screen.
- **Mission clock.** `GET /api/mission` gives the launch time; the app runs its own clock from it (Day 142 of 260 in the
  demo story). The signal delay to Earth is computed from the Horizons distance per day.
- **Mobility check.** Pose tracking runs in the browser; only `balanceHoldS`, `swayPctHeight`, `sitToStandS`,
  `kneeFlexionDeg` and `poseConfidence` are sent. The backend scores them and they appear in the Gravity hazard
  and as a finding (`mobility:<crewId>`).
- **Nova.** The conversation stays in the browser tab. Each message goes to the stateless
  `POST /api/crew/{id}/companion/reply` with recent turns; the backend stores nothing (see §7).

## 5. Screens and URLs

| URL | Screen | User |
|---|---|---|
| `/` | **Overview** (Mission Control): mission day, crew status counts, Earth→Mars trajectory, next event, crew cards with live vitals | Flight surgeon |
| `/crew` | **Crew** directory | Flight surgeon |
| `/crew/:id` | **Astronaut profile**: status, live vitals, findings, recent check-ins | Flight surgeon |
| `/insights` | **Insights**: every finding, filter by crew member, Active / Resolved / All, severity | Flight surgeon |
| `/me` | **My health**: own status, last mobility result, live vitals, what needs attention | Astronaut |
| `/mobility` | **Mobility check**: camera tests | Astronaut |
| `/checkin` | **Daily log**: 30-second check-in and questionnaires | Astronaut |
| `/checkin/q/:id` | Questionnaire, one question at a time (resumable) | Astronaut |
| `/nova` | **Nova**: private companion | Astronaut |

Overlays open on top of any screen and can be linked to: `?metric=<crewId>:<metric>` (metric detail with trend and
interpretation) and `?insight=<id>` (finding detail and actions). Other parameters: `?data=api|mock`,
`?member=<crewId>` (Insights filter).

## 6. Project structure

```
src/
├─ environments/            build-time settings (data source, backend URL)
├─ styles/                  design tokens, mixins, global styles
└─ app/
   ├─ app.ts, app.config.ts, app.routes.ts
   ├─ core/
   │  ├─ data/              apis.ts (contracts), data-source.ts (?data= switch)
   │  ├─ http/              HTTP implementation of the contracts (backend)
   │  ├─ mock/              demo implementation: seeded generator, analysis engine, rule-based Nova
   │  ├─ models/            TypeScript types shared by everything (= the JSON wire format)
   │  ├─ state/             signal stores: mission clock, session, API status
   │  └─ util/              formatting, signal-delay math, ranges
   ├─ shared/               UI building blocks: icon, status badge, hazard ring, sparkline, charts,
   │                        tooltips/help, sheet, dropdown, animated space backdrop
   ├─ layout/               top bar
   └─ features/
      ├─ mission-control/   Overview, crew cards, mission hero
      ├─ crew-directory/    Crew page
      ├─ profile/           Astronaut profile and My health
      ├─ insights/          Insights page
      ├─ overlays/          metric sheet, finding (insight) sheet
      └─ crew-mode/         Daily log, questionnaires, Nova, mobility/ (camera check)
public/mediapipe/           pose model (served locally so the camera check works offline)
scripts/                    calibrate.ts, nova-check.ts (demo engine tools)
docs/                       BACKEND_API_GUIDE.md, USER_MANUAL.md
vercel.json                 Vercel build and single-page-app routing
```

## 7. Privacy and safety

- **Nova is private.** Conversations never reach the analysis engine or Mission Control: no transcript, no mood score,
  no usage metrics. Only what the astronaut explicitly confirms leaves the chat: a check-in card (exact fields, no chat
  text) or a note they choose to share with the flight surgeon.
- **Safety exception.** Explicit self-harm intent or an acute medical red flag gets a pre-written reply, and the flight
  surgeon receives an urgent finding with the *category* only ("expressed a wish to die"), never the words. Ambiguous
  hopelessness makes Nova ask directly first. The astronaut is told before first use and every time it happens.
- **The astronaut never sees the clinical alert about themself**; their view shows a calm support note.
- **Camera:** video never leaves the device; only five numbers are sent.
- **No Mission Control ↔ crew messaging** in the app (by decision); recommended "contact" actions mean a call at the
  next comms window and are only logged.
- **Prototype security:** no login. The backend URL is fixed at build time.

## 8. Design and accessibility

- Deep-space theme with an animated backdrop (parallax stars, a shooting star every few seconds, drifting nebulae,
  a faint solar system); translucent cards. Mission Control is cyan, Crew Mode is violet. Dark theme only (by decision).
- Status is never colour alone: icon + text everywhere (Nominal / Watch / Alert / Info).
- Tooltips on every number, chart and term, with a "?" help button per section, written for first-time users.
- Full keyboard use with visible focus; sheets trap focus and return it; `Esc` closes overlays; charts have text labels.
- `prefers-reduced-motion` turns all animation off (Windows: Settings → Accessibility → Visual effects → Animation effects).
- Works from 1920 px wide screens down to phones (400 px) with no sideways scrolling.

## 9. Deployment

- **Vercel** project `nova-helix`, connected to this GitHub repo: every push to `main` builds and deploys
  https://nova-helix.vercel.app. Settings come from [`vercel.json`](vercel.json): build `npm run build`, output
  `dist/nova-frontend/browser`, all routes rewritten to `index.html`. Node.js 22.x or newer.
- The backend must list the site in `CORS_ORIGINS` (`https://nova-helix.vercel.app` and `http://localhost:4200`).
- To point the live site at another backend, change `apiBaseUrl` in `src/environments/environment.ts` and push.

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "Nova Healix cannot reach its server" | `GET /api/mission` failed: backend down, wrong URL or CORS. Check `/health` on the backend; open `?data=mock` to use demo data |
| Banner "Can't reach the Nova Healix server" | Backend stopped answering after load; the app keeps the last data and retries |
| Saving fails (check-in, resolve, mobility) with a server error | Backend database tables missing or Supabase down; the backend returns 503 |
| The site shows demo data although the backend is up | Your browser remembered `?data=mock`; open `?data=api` once |
| Camera does not start | The page must be https or localhost; allow the camera in the browser; close other apps using it |
| "No one in view" / poor tracking | Stand 2–3 m away, side-on, whole body in frame, good light |
| Nothing in the background moves | Your system has *reduce motion* on (see §8) |
| Dev server shows old code after editing `angular.json` | Restart `npm start` |

## 11. Status against the requirements

Compared with the backend team's requirements document (15 Nov 2026):

| Item | Frontend status |
|---|---|
| FR-01 crew, hazard scores, overall status | ✅ Overview, crew cards (hazard ring), profiles |
| FR-05/06/07 findings with evidence and actions, safety first | ✅ Insights page and finding sheet |
| FR-05b actions, resolve, reopen | ✅ (crew **messaging removed** from the app by decision; the backend's `/messages` is unused) |
| FR-10b/c Nova private, safety exception | ✅ verified end to end |
| FR-10d daily check-in and questionnaires | ✅ "Daily log" tab |
| FR-13 personal baselines, metric readings | ✅ metric sheet (baseline band, thresholds, interpretation) |
| FR-14b Mobility & balance check page | ✅ built (`/mobility`), backend format v2 |
| FR-11 signal delay from real distance | ✅ top bar and Overview |
| FR-12 lost-link mode | ⏳ the API supports `autonomous=true`; **no toggle in the UI yet** |
| FR-23 disclaimer **on every page** | ⏳ shown on the Mobility check and in this README; **not yet on every page** |
| FR-10 ECHO scored check-in chat | ➖ not used by the frontend (Nova is the only chat) |
| Hazard history chart, `/api/distance`, `/api/dashboard`, `/api/alerts` | ➖ not used (removed or not needed by the UI) |
| Saving data on the live backend | ⏳ reads verified (65 calls, no errors); saves depend on the backend's Supabase tables |
| Hard-coded names | ⏳ three remain: Nova button "Tell Haleem…", the EVA-3 tooltip naming Ahmad and Hannan, and the default astronaut id `hashir` |

## 12. Data sources and credits

- NASA, *The Human Body in Space* (five hazards / RIDGE framework)
- NASA **DONKI** space-weather API (solar particle events, flares, CMEs) · NASA **JPL Horizons** (Earth–Mars distance)
- NASA-STD-3001 and NASA briefs on radiation, CO₂ and ECLSS (limits)
- Google **MediaPipe** Pose Landmarker (on-device pose tracking)
- Simulated crew data: our seeded generator (same seed, same mission every load). Thresholds that are our own are
  illustrative, not clinical.

**Use of AI:** the frontend was built with AI coding assistance (Claude); the backend uses Google Gemini for Nova's
free-text replies (safety replies are pre-written, never generated).
