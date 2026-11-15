import { CheckInDraft, ChatCard, CompanionState, SafetyCategory, SafetySignal, Symptom } from '../models';
import { formatDelay } from '../util/format';
import { MockDatabase } from './mock-database';
import { MISSION_EVENTS, hourToDay } from './mission-plan';
import { mean, sliceSamples } from './stats';

/*
 * Mock of the Nova companion (stands in for an LLM such as Gemini / onboard Gemma).
 * Deterministic, rule-based, and conservative. Safety messages are pre-written,
 * never generated. Nova is supportive, never diagnostic.
 */

export type NovaState = CompanionState;

export interface NovaContext {
  db: MockDatabase;
  crewId: string;
  hour: number;
  delaySeconds: number;
  surgeon: string;
  state: NovaState;
  /** Previous astronaut message (for "share that with…"). */
  previousText?: string;
}

export interface NovaReply {
  text: string;
  card?: ChatCard;
}

export interface NovaTurn {
  replies: NovaReply[];
  safety?: { category: SafetyCategory; signal: SafetySignal };
  state: NovaState;
}

const IDLE: NovaState = { pendingSafetyCheck: false, awaitingCheckIn: false };

// ── Patterns ────────────────────────────────────────────────────────
const SELF_HARM = /\b(kill myself|end my life|end it all|suicid\w*|hurt myself|harm myself|don'?t want to (live|be alive|wake up)|better off dead|want to die)\b/i;
const MEDICAL = /(chest pain|can'?t breathe|cannot breathe|hard to breathe|face (is |feels )?numb|arm (is |feels )?numb|slurred|worst headache|passed out|fainted|blacked out|lost (my )?vision|sudden(ly)? (blind|can'?t see)|seizure)/i;
const HOPELESS = /(what'?s the point|what is the point|no point|pointless|hopeless|can'?t go on|giving up|give up on|nothing matters|can'?t do this anymore|can'?t take (it|this) anymore|no way out)/i;
const YES = /^\s*(yes|yeah|yep|i am|i do|sometimes|maybe|kind of|a bit|i think so)\b/i;
const NO = /^\s*(no|nope|not really|never|i'?m not|no,)\b/i;
const CHECKIN = /(check.?in|log (my )?day|daily report|fill (in|out) my)/i;
const SHARE = /\b(tell|share|send|let)\b.*\b(haleem|doctor|surgeon|mission control|ground)\b/i;
const BREATH = /(breath|panic|anxious|anxiety|calm (me )?down|heart racing|overwhelm)/i;
const SLEEP = /(sleep|slept|insomnia|can'?t rest|awake all|tired|exhausted|nightmare)/i;
const HOME = /(home|family|miss (my|them|her|him|the)|lonely|alone|isolat|kids|partner|wife|husband|mum|mom|dad)/i;
const EVA = /(eva|spacewalk|space walk|nervous|scared|afraid|worried about)/i;
const SYMPTOM = /(headache|migraine|nausea|nauseous|sick to my stomach|blurr|vision|back (pain|hurts|ache)|congest|stuffy|blocked nose)/i;
const CONFLICT = /(argu|conflict|annoy|fight|tension|crewmate|got on my nerves|snapped at)/i;
const THANKS = /\b(thanks|thank you|cheers|appreciate)\b/i;
const HELLO = /^\s*(hi|hello|hey|morning|good (morning|evening|afternoon))\b/i;

// ── Helpers using the astronaut's own data ──────────────────────────
function name(ctx: NovaContext): string {
  return ctx.db.astronaut(ctx.crewId)?.name ?? 'there';
}

function sleepPicture(ctx: NovaContext): { recent: number; usual: number } | null {
  const s = sliceSamples(ctx.db.series(ctx.crewId, 'sleepDuration'), ctx.hour - 5 * 24, ctx.hour);
  const b = ctx.db.baseline(ctx.crewId, 'sleepDuration');
  if (!s.length || !b) return null;
  return { recent: mean(s.map((x) => x.v)), usual: b.mean };
}

function nextEva(ctx: NovaContext): { label: string; days: number } | null {
  const e = MISSION_EVENTS.filter((x) => x.kind === 'eva' && x.crewIds.includes(ctx.crewId) && x.start > ctx.hour).sort((a, b) => a.start - b.start)[0];
  return e ? { label: e.label.split(' ')[0], days: Math.ceil((e.start - ctx.hour) / 24) } : null;
}

function checkedInToday(ctx: NovaContext): boolean {
  const today = hourToDay(ctx.hour);
  return ctx.db.checkIns(ctx.crewId).some((c) => c.day === today && c.at <= ctx.hour);
}

/** CMO to involve for acute medical problems (someone else if the CMO is the one unwell). */
function medicalContact(ctx: NovaContext): string {
  const crew = ctx.db.crew();
  const cmo = crew.find((a) => a.role === 'CMO');
  if (cmo && cmo.id !== ctx.crewId) return `${cmo.name} (crew medical officer)`;
  const cdr = crew.find((a) => a.role === 'CDR');
  return cdr ? `${cdr.name} (commander)` : 'a crewmate';
}

// ── Check-in extraction ─────────────────────────────────────────────
function scoreWords(text: string, table: [RegExp, number][], fallback: number): number {
  for (const [re, v] of table) if (re.test(text)) return v;
  return fallback;
}

export function extractCheckIn(ctx: NovaContext, text: string): { draft: CheckInDraft; found: number } {
  const t = text.toLowerCase();
  let found = 0;
  const mood = scoreWords(
    t,
    [
      [/(awful|terrible|miserable|horrible|really low|very low|depressed)/, 1],
      [/(low|down|sad|flat|stressed|not great|rough|bad day|homesick|lonely)/, 2],
      [/(\bok\b|okay|alright|meh|so-so|fine-ish)/, 3],
      [/(good|fine|well|happy|positive|content)/, 4],
      [/(great|excellent|amazing|fantastic|brilliant)/, 5],
    ],
    0,
  );
  if (mood) found++;
  const sleep = scoreWords(
    t,
    [
      [/(no sleep|didn'?t sleep|barely slept|awful night|terrible night)/, 1],
      [/(slept (badly|poorly|bad)|bad night|rough night|woke up (a lot|often|twice|several)|couldn'?t sleep|broken sleep|restless)/, 2],
      [/(slept (ok|okay|alright)|average night)/, 3],
      [/(slept (well|fine|good)|good night|good sleep)/, 4],
      [/(slept (great|really well|brilliantly)|best sleep)/, 5],
    ],
    0,
  );
  if (sleep) found++;
  const energy = scoreWords(
    t,
    [
      [/(exhausted|drained|no energy|wiped out|shattered)/, 1],
      [/(tired|sleepy|sluggish|low energy|groggy)/, 2],
      [/(energ(y|etic|ised|ized)|lively|full of beans|sharp)/, 4],
    ],
    0,
  );
  if (energy) found++;
  const symptoms: Symptom[] = [];
  if (/(headache|migraine)/.test(t)) symptoms.push('headache');
  if (/(nause|sick to my stomach|queasy)/.test(t)) symptoms.push('nausea');
  if (/(blurr|vision)/.test(t)) symptoms.push('vision');
  if (/back (pain|hurts|ache|is sore)/.test(t)) symptoms.push('back-pain');
  if (/(congest|stuffy|blocked nose)/.test(t)) symptoms.push('congestion');
  found += symptoms.length;

  // Fill gaps from the astronaut's own recent data, so the draft is sensible.
  const sp = sleepPicture(ctx);
  const sleepFromData = sp ? (sp.recent < sp.usual - 1 ? 2 : sp.recent < sp.usual - 0.4 ? 3 : 4) : 3;
  return {
    draft: {
      mood: mood || 3,
      sleepQuality: sleep || sleepFromData,
      energy: energy || (sleep && sleep <= 2 ? 2 : 3),
      symptoms,
      // Privacy: never attach chat text to a shared check-in. The card shows exactly what is sent.
    },
    found,
  };
}

// ── Specific safety signal (a category for the clinician, never the words) ──
function selfHarmSignal(text: string, wasAsked: boolean): SafetySignal {
  if (/(want to die|better off dead|don'?t want to (live|be alive|wake up))/i.test(text)) return 'wish-to-die';
  if (/(kill myself|suicid|end my life|end it all)/i.test(text)) return 'suicidal-thoughts';
  if (/(hurt myself|harm myself)/i.test(text)) return 'self-harm-intent';
  return wasAsked ? 'confirmed-when-asked' : 'suicidal-thoughts';
}

function medicalSignal(text: string): SafetySignal {
  if (/chest pain/i.test(text)) return 'chest-pain';
  if (/(breathe)/i.test(text)) return 'breathing';
  if (/(numb|slurred)/i.test(text)) return 'stroke-signs';
  if (/(passed out|fainted|blacked out)/i.test(text)) return 'unconscious';
  if (/(vision|blind|can'?t see)/i.test(text)) return 'vision-loss';
  if (/headache/i.test(text)) return 'severe-headache';
  return 'seizure';
}

// ── Pre-written safety messages ─────────────────────────────────────
function safetyMessage(ctx: NovaContext, category: SafetyCategory): string {
  const delay = formatDelay(ctx.delaySeconds);
  if (category === 'medical') {
    return (
      `These symptoms need medical attention now. Please tell ${medicalContact(ctx)} straight away, or use the crew intercom. ` +
      `I have alerted ${ctx.surgeon}, your flight surgeon, that you need urgent medical help. I only sent that, not what you wrote. ` +
      `The alert reaches Earth in about ${delay}. Stay where you are and do not exercise.`
    );
  }
  return (
    `Thank you for telling me. You don’t have to carry this alone. ` +
    `I have let ${ctx.surgeon}, your flight surgeon, know that you need support right now. I did not share what you wrote, only that it is urgent. ` +
    `The message reaches Earth in about ${delay}. If you can, find a crewmate now so you are not on your own. I’m here. Will you keep talking with me while you wait?`
  );
}

// ── Public API ──────────────────────────────────────────────────────
export function novaGreeting(ctx: NovaContext): NovaTurn {
  const lines = [`Hi ${name(ctx)}. This is a private space: only you can see what we talk about. How are you doing today?`];
  const sp = sleepPicture(ctx);
  if (sp && sp.recent < sp.usual - 0.8) {
    lines.push(`I noticed your sleep has been shorter than usual this week (${sp.recent.toFixed(1)} h a night, you normally get ${sp.usual.toFixed(1)} h). We can talk about that if it helps.`);
  }
  if (!checkedInToday(ctx)) lines.push('Your daily check-in isn’t done yet. If you like, just tell me about your day and I’ll fill it in for you to review.');
  return { replies: lines.map((text) => ({ text })), state: IDLE };
}

export function novaRespond(ctx: NovaContext, text: string): NovaTurn {
  const s = ctx.state;

  // 1. Safety always comes first.
  if (SELF_HARM.test(text) || (s.pendingSafetyCheck && YES.test(text))) {
    const signal = selfHarmSignal(text, s.pendingSafetyCheck);
    return {
      replies: [{ text: safetyMessage(ctx, 'self-harm'), card: { kind: 'safety', category: 'self-harm' } }],
      safety: { category: 'self-harm', signal },
      state: IDLE,
    };
  }
  if (MEDICAL.test(text)) {
    return {
      replies: [{ text: safetyMessage(ctx, 'medical'), card: { kind: 'safety', category: 'medical' } }],
      safety: { category: 'medical', signal: medicalSignal(text) },
      state: IDLE,
    };
  }
  if (s.pendingSafetyCheck && NO.test(text)) {
    return {
      replies: [{ text: 'Thank you for being honest with me. It still sounds really heavy. What has been weighing on you the most?' }],
      state: IDLE,
    };
  }
  if (HOPELESS.test(text)) {
    return {
      replies: [
        {
          text: 'That sounds really hard, and I want to make sure I understand. Are you having any thoughts of hurting yourself or of not wanting to be alive?',
        },
      ],
      state: { ...IDLE, pendingSafetyCheck: true },
    };
  }

  // 2. Explicit requests.
  if (SHARE.test(text)) {
    // Share what follows the request ("tell Haleem I'd like a call" → "I'd like a call"),
    // otherwise the previous message, otherwise a neutral default.
    const rest = text
      .replace(/^\s*(please\s+)?(can you\s+|could you\s+)?(tell|share with|send (this |it )?to|let)\s+(haleem|the doctor|my doctor|the flight surgeon|mission control|the ground)(\s+know)?(\s+that)?[\s,:]*/i, '')
      .trim();
    const own = rest && rest !== text.trim() && rest.length > 6 ? rest.charAt(0).toUpperCase() + rest.slice(1) : '';
    const draft = own || ctx.previousText?.trim() || 'I would like to talk when you have time.';
    return {
      replies: [
        {
          text: `I can send a note to ${ctx.surgeon}. Here is what would be shared. Nothing else from our conversation goes with it. Send it?`,
          card: { kind: 'share', text: draft, status: 'proposed' },
        },
      ],
      state: IDLE,
    };
  }

  if (CHECKIN.test(text) || s.awaitingCheckIn) {
    const { draft, found } = extractCheckIn(ctx, text);
    if (found === 0 && !s.awaitingCheckIn) {
      return {
        replies: [{ text: 'Sure. In a sentence or two: how did you sleep, how is your mood and energy, and any symptoms like headache or nausea?' }],
        state: { ...IDLE, awaitingCheckIn: true },
      };
    }
    return {
      replies: [
        {
          text: 'Here is your check-in from what you told me. Check-ins are shared with Mission Control, so review it before sending.',
          card: { kind: 'checkin', draft, status: 'proposed' },
        },
      ],
      state: IDLE,
    };
  }

  if (BREATH.test(text)) {
    return {
      replies: [
        {
          text: 'Let’s slow things down together. Breathe in for 4, hold for 4, out for 6. Follow the circle for a minute; I’ll be here after.',
          card: { kind: 'breathing' },
        },
      ],
      state: IDLE,
    };
  }

  // 3. Topics, with the astronaut's own context.
  const replies: NovaReply[] = [];
  if (SYMPTOM.test(text)) {
    const { draft } = extractCheckIn(ctx, text);
    const vision = draft.symptoms.includes('vision');
    replies.push({
      text: vision
        ? `Changes in vision are worth checking early in microgravity. Please mention it to ${medicalContact(ctx)} today. I can also log it in your check-in so ${ctx.surgeon} sees it.`
        : 'I’m sorry, that’s unpleasant. Logging symptoms helps spot patterns: CO₂ levels and fluid shift can both cause headaches up here. Want me to add it to today’s check-in?',
      card: { kind: 'checkin', draft, status: 'proposed' },
    });
  } else if (SLEEP.test(text)) {
    const sp = sleepPicture(ctx);
    const eva = nextEva(ctx);
    let msg = 'Poor sleep is one of the hardest parts of a long flight.';
    if (sp && sp.recent < sp.usual - 0.5) msg += ` Your wearable shows about ${sp.recent.toFixed(1)} h a night lately, against your usual ${sp.usual.toFixed(1)} h.`;
    if (eva && eva.days <= 5) msg += ` With ${eva.label} in ${eva.days} days, protecting the next few nights matters.`;
    msg += ' A few things that tend to help: dim the module lights an hour before, keep the sleep station cool, and park work thoughts on a list. Want a short breathing routine to wind down?';
    replies.push({ text: msg });
  } else if (HOME.test(text)) {
    replies.push({
      text:
        'Missing home is completely normal this far out, and it often gets harder around the middle of a mission. ' +
        'Some crews record a short video for family before each downlink window, so there is always something on its way. ' +
        `You could also ask ${ctx.surgeon} for a private conference with the psychologist. Would talking about the people you miss help right now?`,
    });
  } else if (EVA.test(text)) {
    const eva = nextEva(ctx);
    replies.push({
      text:
        `Feeling nervous before ${eva ? eva.label : 'a spacewalk'} is a sign you take it seriously. ` +
        'It can help to walk through the timeline once more with your EVA partner and name the one step you are least sure about. ' +
        'Sleep is the biggest single thing that improves performance outside. What part is on your mind?',
    });
  } else if (CONFLICT.test(text)) {
    replies.push({
      text:
        'Friction is almost guaranteed with four people in a small space for months. ' +
        'If it helps, we can rehearse what you want to say: start with what you noticed, how it affected you, and one thing you would like to change. Want to try?',
    });
  } else if (THANKS.test(text)) {
    replies.push({ text: 'Any time. I’m here whenever you want to talk, day or night.' });
  } else if (HELLO.test(text)) {
    replies.push({ text: `Hi ${name(ctx)}. How are you feeling today?` });
  } else {
    replies.push({
      text:
        'Thank you for telling me. That sounds like a lot to carry. Would you like to say more, or would something practical help: a breathing exercise, a wind-down routine, or turning this into today’s check-in?',
    });
  }
  return { replies, state: IDLE };
}

