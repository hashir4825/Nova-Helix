import { HAZARDS, HAZARD_KEYS, HazardAssessment, MetricKey, Severity, Status, STATUS_LABEL } from '../core/models';
import { TipContent } from './tooltip/tooltip.service';

/**
 * Plain-language help copy, written for someone opening the app for the first time.
 * Keep all explanatory text here so wording stays consistent across screens.
 */

export const STATUS_HELP: Record<Status | Severity, TipContent> = {
  nominal: {
    title: 'Nominal',
    body: 'Everything is within this astronaut’s own normal range. No action needed.',
  },
  watch: {
    title: 'Watch',
    body: 'Something is drifting away from normal. Review it today and consider a countermeasure.',
  },
  alert: {
    title: 'Alert',
    body: 'Several signals point to a real problem. Review now and take action.',
  },
  info: {
    title: 'Info',
    body: 'Useful context, such as a countermeasure that is working. No action needed.',
  },
};

export const HELP = {
  brand: {
    title: 'Nova Healix',
    body: 'Crew health monitoring for the NHX-1 Mars transit.',
    hint: 'Click to return to Mission Control',
  },
  day: {
    title: 'Mission day',
    body: 'Day 1 was launch. The spacecraft reaches Mars on the final day.',
  },
  utc: {
    title: 'Ship clock (UTC)',
    body: 'All times in the app use Coordinated Universal Time, the clock the crew and Mission Control share.',
  },
  link: {
    title: 'Earth link',
    body: 'One-way signal delay: how long a message takes to reach Earth. A reply takes the same again. It grows as the ship travels further away.',
  },
  linkAutonomous: {
    title: 'Autonomous mode',
    body: 'There is no link to Earth. The crew must handle medical issues on their own; messages to Earth are queued until the link returns.',
  },
  modeMc: {
    title: 'Mission Control',
    body: 'The flight surgeon’s view: monitor all four astronauts, review findings and act on them.',
  },
  modeCrew: {
    title: 'Crew Mode',
    body: 'The astronaut’s view: a 30-second daily check-in, assigned questionnaires and messages from Mission Control.',
  },
  crewStatus: {
    title: 'Crew status',
    body: 'How many astronauts are at each level. Each astronaut takes their most serious level across all hazards and findings.',
  },
  trajectory: {
    title: 'Where the ship is',
    body: 'Blue is Earth, red is Mars. The solid line is the distance travelled so far; the glowing dot is the ship now. Markers show key mission events.',
  },
  nextEvent: {
    title: 'Next scheduled event',
    body: 'EVA means extravehicular activity: a spacewalk outside the ship. Crew health before an EVA matters most.',
  },
  console: {
    title: 'On console',
    body: 'The flight surgeon currently responsible for crew health. Messages and escalations are sent in this person’s name.',
  },
  crewSection: {
    title: 'Crew',
    body: 'One card per astronaut. The ring around each initial shows their five hazard scores; the three tiles show live vitals with a 24-hour trend. The shaded band in each trend is that astronaut’s own normal range, not an average of other people.',
  },
  insightsSection: {
    title: 'Insights',
    body: 'Findings the analysis engine detects automatically by combining vitals, sleep, radiation, check-ins and questionnaires. Most serious first.',
    hint: 'Click a finding to see the evidence and take action',
  },
  checkInDone: (time: string): TipContent => ({
    title: 'Daily check-in done',
    body: `The astronaut reported mood, sleep, energy and symptoms at ${time} ship time today.`,
  }),
  checkInDue: (time: string): TipContent => ({
    title: 'Daily check-in not done yet',
    body: `Expected around ${time} ship time, shortly after waking. Missed check-ins are themselves a warning sign.`,
  }),
  live: 'Live reading, updated every few seconds.',
} satisfies Record<string, unknown>;

/** Tooltip for a hazard ring: what it is + all five scores. */
export function hazardRingTip(name: string, assessments: HazardAssessment[]): TipContent {
  return {
    title: `${name}’s hazard ring`,
    body: 'One segment per NASA hazard, clockwise from the top. A longer, warmer segment means higher risk.',
    rows: HAZARD_KEYS.map((k) => {
      const a = assessments.find((x) => x.hazard === k);
      return { label: HAZARDS[k].label, value: `${a?.score ?? 0}`, tone: a?.status ?? 'nominal' };
    }),
    hint: 'Click to open the highest hazard',
  };
}

/** Tooltip for one matrix cell / hazard score. */
export function hazardScoreTip(name: string, a: HazardAssessment | undefined): TipContent {
  const def = a ? HAZARDS[a.hazard] : undefined;
  return {
    title: def ? `${name} · ${def.label}` : name,
    body: a ? `Score ${a.score} of 100: ${STATUS_LABEL[a.status]}. Main contributing signals:` : undefined,
    rows: (a?.drivers ?? []).slice(0, 3).map((d) => ({ label: d.label, value: d.value })),
    hint: 'Click for hazard detail',
  };
}

export function hazardColumnTip(key: keyof typeof HAZARDS): TipContent {
  return { title: HAZARDS[key].label, body: HAZARDS[key].description, hint: 'Click to compare all crew' };
}

/** What each measurement means, in plain language. */
export const METRIC_HELP: Partial<Record<MetricKey, string>> = {
  hr: 'Heart beats per minute. Rises with exercise, stress, illness and poor sleep.',
  hrv: 'Heart rate variability: the small variation between heartbeats. Higher is generally better; a sustained drop can signal stress, fatigue or poor recovery.',
  spo2: 'Blood oxygen saturation. Normal is 95–100%. Low values can point to cabin air or breathing problems.',
  coreTemp: 'Core body temperature. Runs slightly higher in space; a rise can mean infection or heat stress.',
  bpSys: 'Systolic blood pressure, the peak pressure per heartbeat. Fluid shifts in microgravity can raise it.',
  bpDia: 'Diastolic blood pressure, the pressure between heartbeats.',
  resp: 'Breaths per minute. Rises with exertion, anxiety or poor air quality.',
  sleepDuration: 'Hours of sleep per night measured by a wearable.',
  sleepEfficiency: 'Share of time in bed actually spent asleep.',
  radDose: 'Total radiation absorbed since launch, compared with the career safety limit.',
  boneDensity: 'Bone strength at the hip. Bone thins in microgravity without exercise.',
  muscleMass: 'Lean muscle mass. Muscles weaken in microgravity without exercise.',
  mood: 'Self-rated mood from the daily check-in (1 = very low, 5 = very good).',
  energy: 'Self-rated energy from the daily check-in.',
  sleepQuality: 'Self-rated sleep quality from the daily check-in.',
  stress: 'Stress score from the weekly wellbeing questionnaire (higher = more stress).',
  workload: 'Workload score from the weekly questionnaire (higher = heavier).',
  co2: 'Carbon dioxide the astronaut breathes. Above 3 mmHg can cause headaches and poor focus.',
  doseRate: 'How much radiation is being absorbed right now, per hour. Jumps sharply during a solar storm.',
  reactionTime: 'Average reaction time on a 3-minute tablet test. Slower times signal fatigue or stress.',
  visionAcuity: 'Near vision measured on a tablet chart (1.00 = normal). A drop can be an early sign of fluid shifting toward the head.',
  wbc: 'White blood cells fight infection. Spaceflight can weaken the immune system.',
  lymphocytes: 'A type of white blood cell that is sensitive to radiation and stress.',
  boneMarker: 'A urine marker of bone breakdown. It rises weeks before a bone scan shows any loss.',
  cabinNoise: 'Sound level in the crew quarters. Above about 50 dBA at night disturbs sleep.',
  cabinTemp: 'Air temperature in the crew module.',
  cabinHumidity: 'Moisture in the cabin air. High humidity helps microbes grow.',
  legStrength: 'Estimated maximum leg-press load from the exercise machine. Shows whether strength is being kept for walking on Mars.',
  medKit: 'How well stocked the ship’s pharmacy and medical kits are. There is no resupply on the way to Mars.',
};
