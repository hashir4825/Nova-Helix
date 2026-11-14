// Exercises the mock Nova responder. Usage: npx tsx scripts/nova-check.ts
import { MockDatabase } from '../src/app/core/mock/mock-database';
import { novaGreeting, novaRespond, NovaState } from '../src/app/core/mock/nova';
import { at } from '../src/app/core/mock/mission-plan';
const db = new MockDatabase();
let state: NovaState = { pendingSafetyCheck: false, awaitingCheckIn: false };
const ctx = (crewId: string, prev?: string) => ({ db, crewId, hour: at(142, 14), delaySeconds: 333, surgeon: 'Haleem', state, previousText: prev });
for (const r of novaGreeting(ctx('hannan')).replies) console.log('NOVA>', r.text);
let prev: string | undefined;
for (const msg of [
  'I miss my family a lot',
  'can you do my check-in? slept badly, feeling low and tired, bit of a headache',
  'please tell haleem',
  'Please tell Haleem I would like a private call this week',
  'honestly what is the point anymore',
  'no',
  'what is the point of any of this',
  'yes sometimes',
  'I have chest pain and my arm feels numb',
]) {
  const t = novaRespond(ctx('hannan', prev), msg);
  state = t.state;
  console.log('\nYOU >', msg);
  for (const r of t.replies) console.log('NOVA>', r.text.slice(0, 140), r.card ? JSON.stringify(r.card) : '');
  if (t.safety) console.log('  ⇒ SAFETY FLAG:', t.safety);
  prev = msg;
}
