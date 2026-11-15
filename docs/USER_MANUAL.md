# Nova Healix: User Manual

How to use every screen of Nova Healix, for the **flight surgeon** (Mission Control) and the **astronaut** (Crew Mode),
plus a 2-minute demo walkthrough.

Open the app at **https://nova-helix.vercel.app** (or http://localhost:4200 when running it yourself; see the
[README](../README.md#3-run-it)).

> Decision-support prototype, not a medical device. Crew data is simulated; space weather (NASA DONKI) and distance
> (NASA JPL Horizons) are real NASA data. Thresholds that are our own are illustrative, not clinical.

## Contents

1. [The basics](#1-the-basics)
2. [Mission Control (flight surgeon)](#2-mission-control-flight-surgeon)
3. [Crew Mode (astronaut)](#3-crew-mode-astronaut)
4. [Reading the screens](#4-reading-the-screens)
5. [2-minute demo walkthrough](#5-2-minute-demo-walkthrough)
6. [Questions](#6-questions)

---

## 1. The basics

### The crew and the mission

Mission **NHX-1** on the spacecraft **DSV Meridian**: a 260-day transit from Earth to Mars. The demo is always on
**Day 142**, with the real time of day.

| Person | Role | In the app |
|---|---|---|
| Hashir | Commander | Astronaut (steady reference case) |
| Ahmad | Flight engineer | Astronaut (sleep debt before a spacewalk) |
| Hannan | Mission specialist | Astronaut (isolation stress, skipped exercise) |
| Sabaina | Crew medical officer | Astronaut (highest radiation dose, headaches and vision change) |
| Haleem | Flight surgeon | Mission Control, the person using the dashboard |
| Hamza | Flight director | On Earth; urgent cases can be escalated to him |

### The top bar

From left to right:

- **Nova Healix** logo: back to the Overview.
- **Day 142/260** and the **UTC** clock: hover for days left and the mission timeline.
- **Page links:** Mission Control shows *Overview · Crew · Insights*; Crew Mode shows *My health · Mobility check ·
  Daily log · Nova*.
- **Who you are:** in Mission Control, Haleem (flight surgeon). In Crew Mode, a dropdown to pick which astronaut you
  are (demo only).
- **Earth link** with the **signal delay** (for example `5m 32s`): how long a message takes to reach Earth, one way.
- **Mission Control** (cyan) and **Crew Mode** (violet) buttons: switch between the two views.

### Getting help anywhere

- **Hover** over (or **Tab** to) any number, ring, chart, icon or term to see what it means, its normal range and
  what a click does.
- The **?** button next to a section title explains the whole section.
- On the Overview, a **"New here?"** hint explains this; close it with **×**.

### Status words

| Status | Icon | Meaning |
|---|---|---|
| **Nominal** | circle with check | Inside the person's own normal range |
| **Watch** | triangle | Worth keeping an eye on (hazard score 40–69) |
| **Alert** | octagon | Needs attention now (score 70 or more) |
| **Info** | i in a circle | Good to know, often positive news |

Colour is never the only signal; the word and icon are always there.

---

## 2. Mission Control (flight surgeon)

Click **Mission Control** in the top bar.

### 2.1 Overview (`/`)

1. **Mission panel:** the mission day, how many astronauts are Alert / Watch / Nominal, the **Earth → Mars
   trajectory** with the ship's position and distance, mission events on the arc (for example the Day 97 solar storm),
   the **next event** (for example EVA-3 in 3 days) and who is on console.
2. **Crew cards**, one per astronaut:
   - The **ring** around the initial shows the five hazard scores; hover for the numbers.
   - The **status** badge (Nominal / Watch / Alert).
   - **Live vitals**: heart rate, heart-rate variability, blood oxygen, each with a 24-hour trend against that
     astronaut's own normal band. **Click a tile** for the full trend.
   - The hazard that needs most attention, and today's **check-in** time.
   - A **red banner** if Nova raised a safety alert: click **Respond**.
3. **All crew** (top right of the crew section) opens the crew directory.

### 2.2 Crew (`/crew`)

One card per astronaut with status, the reason, top hazard, check-in, open findings and next event.
**Click a card** to open that astronaut's profile.

### 2.3 Astronaut profile (`/crew/:id`)

- **Header:** overall status with a one-line reason, today's check-in, next event. Use the name buttons at the top to
  switch astronaut; **All crew** goes back.
- **Live vitals:** heart rate, HRV, blood oxygen, temperature, blood pressure, breathing. Each tile shows the value
  now, the person's normal range and the last 24 hours. Orange numbers are outside the normal range.
  **Click a tile** for the full trend.
- **Findings:** what needs attention, with recommended actions. Click a finding to act on it.
- **Recent check-ins:** the last 7 days of mood, sleep, energy and symptoms.

### 2.4 Metric detail (opens over any screen)

Opens when you click a vital tile or a linked value.

- **Range:** 24 h · 7 days · 30 days · Mission.
- **The chart:** the shaded band is the astronaut's **own normal range**; dashed lines are watch/alert thresholds;
  coloured columns are mission events (spacewalks, the solar storm, the sleep shift, the CO₂ scrubber fault).
- **Analysis:** what changed, why it matters, signals moving with it, and a **confidence** value.
- **Recommended actions.**

Close with **×**, **Esc** or a click outside. The URL (`?metric=…`) can be shared.

### 2.5 Insights (`/insights`)

Every finding for the crew.

1. **Crew member** (top right): *All crew*, one astronaut, or *Whole crew* (ship-wide, such as cabin air). Each shows
   how many findings are active.
2. **Active / Resolved / All** tabs, and a **severity** filter (Alert, Watch, Info).
3. Each row shows who, severity, the hazards involved, title, summary, when it was detected and what has been done
   ("Not yet handled", the last action, or "Resolved … by Haleem").
4. **Profile** opens that astronaut. **Click the row** to open the finding.

### 2.6 A finding (opens over any screen)

- **Who** (with **Open profile**) and **Acknowledge**.
- **Summary** and **Why it matters**.
- **Evidence:** each value against the astronaut's own normal; linked values open the metric detail.
- **Recommended actions**, numbered. Click **Do this** (or **Mark done** for "talk at the next comms window") to
  record it; it shows "Done 14:32 by Haleem".
- **Action log:** everything done so far, newest first.
- **Close this finding → Resolve:** pick a quick note (or write one; a note is required) and click **Resolve**. The
  finding leaves the active views and moves to *Resolved*. **Reopen** brings it back. If it gets *worse* after
  you resolved it, it reopens itself, labelled "Reopened: got worse".

### 2.7 When Nova raises a safety alert

An astronaut told Nova something that shows a risk to their life or an acute medical emergency.

1. A red **"Urgent: <name> <category>"** banner appears on their crew card and profile, and it is first in Insights.
   You see the **category only** (for example "expressed a wish to die"), never their words.
2. Click **Respond**. The sheet shows the exact time, when it reached Earth, what Nova already did, context from shared
   data (mood, sleep, HRV, missed check-ins, upcoming spacewalk), who on board can help, and a numbered **response
   protocol** (call at the next comms window, in-person check by a crewmate or the medical officer, psychologist
   conference, escalate to the flight director).
3. Record each step as you do it, then **Resolve** with a note.

---

## 3. Crew Mode (astronaut)

Click **Crew Mode** in the top bar. In the demo, pick who you are with the **name dropdown** next to the Earth link.

### 3.1 My health (`/me`)

- **How you are doing:** your status in plain words, and today's check-in.
- **Mobility & balance check:** your last result for each test (balance, sit-to-stand, knee bend), "valid until"
  date. When there is no check yet, or the last one is 7 or more days old, the card turns violet with
  **Take a new check**.
- **Live vitals** with your own normal range.
- **What needs attention**, with **What you can do**.
- **Recent check-ins.**

You never see raw risk scores here, only plain-language explanations.

### 3.2 Mobility check (`/mobility`)

Three movement tests, about 2 minutes. They measure **movement** (balance, leg strength, knee bend), not bone health.
**The video never leaves your device**; only five numbers are sent.

**Set up:** place the device 2–3 m away at hip height, good light, **side-on** to the camera, whole body in view.
You need a chair for test 2.

1. Click **Start camera** and allow the camera (or **Use a recorded video** for a demo). A skeleton appears on you.
   - Below the video: **Knee bend** (0° = straight leg) and **Tracking** (how clearly the camera sees you).
   - If tracking is poor, a hint says *"Turn side-on and step back…"* or *"No one in view…"*.
2. **Test 1, Single-leg balance:** click **Start**, wait for the 3-second countdown, lift one foot and hold, hands
   on hips, up to 30 s. The test ends when your foot comes down.
3. **Test 2, 5× sit-to-stand:** start seated, arms crossed. Click **Start**, then stand up fully and sit down
   5 times as fast as is safe.
4. **Test 3, Squat knee bend:** click **Start**, then do 3 slow squats as deep as is comfortable.
5. Any test can be cancelled (**Cancel**) or repeated (**Redo**; **Try again** if it timed out).
6. **Ready to send** lists exactly what will be shared. Click **Send results**.
7. **The result:** overall status, each test with its value, the change since your first check, and a note.
   If something was flagged: *What you can do*. **Done** returns to My health.
   If tracking was too weak, the check is **not counted**: click **Retake the check**.

The first check becomes your personal reference; later checks are compared with it. Flagged checks raise the Gravity
hazard and a finding for the flight surgeon. The info panel (*How it works and what is measured*) lists the
(illustrative) limits.

### 3.3 Daily log (`/checkin`)

**Shared with Mission Control** (the cyan label).

- **Today's check-in (about 30 seconds):** choose your **mood**, **sleep** and **energy** (1–5), tap any
  **symptoms**, add an optional **note**, then **Send check-in**. One per day; **Update** replaces today's.
  *Rather talk it through?* opens Nova, which can fill this in for you to review.
- **Questionnaires:** short sets assigned by the flight surgeon (wellbeing, sleep, workload, team). Click **Start**
  (or **Continue**): one question at a time, **Back** / **Next** / **Skip**, saved as you go, so you can stop and
  resume. Finish with **Send answers**.

### 3.4 Nova (`/nova`)

Your **private** companion. Only you see the conversation.

1. **First time:** read how privacy works and click **I understand, start talking**.
2. Type a message or tap a suggestion (*Do my check-in*, *I can't sleep*, *I miss home*, *Breathing exercise*,
   *Nervous about the EVA*, *Tell Haleem something*).
3. **Nova never shares anything on its own.** It can *offer* two things, which you review first:
   - **Check-in draft:** the exact fields that would be shared. **Send check-in**, **Don't send**, or *Edit in form*.
     Your chat text is never attached.
   - **Note to Haleem:** edit the text, then **Send to Haleem** or **Not now**. Only that text is shared.
4. **Safety exception:** if you say something that shows a risk to your life or an acute medical emergency, Nova
   replies with support and tells Haleem that you need help (the category only, never your words). It always shows
   you a card saying it did this. If you sound hopeless, Nova asks you directly first.
5. Delete the conversation with the bin icon (confirm with **Delete**). Reloading the page also clears it: nothing is
   stored.

Nova supports; it does not diagnose. For a medical problem it points you to the crew medical officer (or the
commander if the medical officer is unwell).

---

## 4. Reading the screens

- **Personal normal range:** the shaded band on charts and "Normal 56–76" under a value, computed from that
  astronaut's own data early in the flight, not from other people.
- **Hazard score (0–100):** how much a hazard is affecting someone, from several weighted signals ("what feeds this").
  40+ is Watch, 70+ is Alert. Thresholds we chose are illustrative.
- **Signal delay:** one-way light time to Earth from the real distance (NASA JPL Horizons). A question to Earth and its
  answer take twice this long.
- **Mission events:** spacewalks (EVA), the Day 97 solar particle event (a real NASA DONKI storm replayed), the
  sleep shift before EVA-3, the CO₂ scrubber fault, course-correction burns.
- **The background:** a slow, decorative starfield with a solar system; it carries no data. It stays still if your
  system has *reduce motion* on.

## 5. 2-minute demo walkthrough

1. **Overview (Mission Control):** Day 142, four crew, one Alert (Hannan). Point out the trajectory, the signal delay
   in the top bar and the live vitals.
2. **Insights → Ahmad → "Sleep debt building ahead of EVA-3":** evidence against his own baseline, recommended actions.
   Click a linked value to show the chart with his personal band and the sleep-shift event.
3. **Real NASA data:** the solar storm on Day 97 on the trajectory and in the radiation chart; the distance and delay
   from Horizons.
4. **Crew Mode → Nova (as Ahmad):** *Do my check-in*, review the card, **Send check-in**. Then type a safety phrase:
   Nova answers with support and shows the safety card.
5. **Mission Control:** the urgent alert is first, showing the category but never the words. **Respond**, record a
   step, **Resolve** with a note.
6. **Crew Mode → Mobility check:** start the camera, run a test or two (or a recorded video), send. Show the result
   and My health's last-result card.
7. Close: *"Far from Earth, astronauts must judge their own health. Nova Healix compares them with their own normal,
   and keeps their private conversations private."*

## 6. Questions

**Is this real astronaut data?** No. Crew data is simulated with a fixed seed so the demo repeats exactly. Space
weather and distance are real NASA data.

**Why is it always Day 142?** The demo mission clock is set so "now" is Day 142, where every storyline is visible.

**Does anything I type to Nova get stored?** No. Only cards you confirm are sent, and safety alerts carry a category,
not your words.

**Why does a reload clear things in demo mode?** Demo data lives in the browser's memory. With the backend
(`?data=api`, the default on the live site), check-ins, actions and mobility checks are saved on the server.

**The background is distracting.** It's decorative and slow; turning on *reduce motion* in your system settings
stops it.
