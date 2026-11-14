// Prints hazard scores, insights and baselines at D142 <hour>. Usage: npx tsx scripts/calibrate.ts 14
import { MockDatabase } from '../src/app/core/mock/mock-database';
import { assessHazards } from '../src/app/core/mock/engine/hazards';
import { detectInsights } from '../src/app/core/mock/engine/insights';
import { at, distanceAuOnDay } from '../src/app/core/mock/mission-plan';
const db = new MockDatabase();
const hour = at(142, Number(process.argv[2] ?? 14));
const t0=Date.now();
const ctx = { db, hour, link: { mode: 'nominal' as const, delaySeconds: distanceAuOnDay(142)*499, distanceAu: 0 }, careerLimitMsv: 600 };
const hz = assessHazards(ctx);
for (const a of db.crew()) console.log(a.id.padEnd(10), hz.filter(h=>h.crewId===a.id).map(h=>`${h.hazard.slice(0,3)}:${h.score}`).join(' '));
console.log('delay', ctx.link.delaySeconds.toFixed(0));
for (const i of detectInsights(ctx)) console.log(i.severity.padEnd(6), (i.crewId??'crew').padEnd(10), i.title, '|', i.confidence);
for (const a of db.crew()) { const b=['hr','hrv','sleepDuration','mood','stress','co2'].map(m=>{const x=db.baseline(a.id,m as any);return x?`${m}:${x.mean.toFixed(1)}[${x.low.toFixed(1)}-${x.high.toFixed(1)}]`:''}); console.log(a.id, b.join(' ')); }
console.log('ms', Date.now()-t0);
for (const id of ['hannan','ahmad','sabaina']) { const d = hz.filter(h=>h.crewId===id && h.score>=35); for (const h of d) console.log(id,h.hazard,h.drivers.map(x=>`${x.label}=${x.value}(${x.contribution})`).join('; ')); }
if (process.argv[3] === 'explain') for (const h of hz.filter((x) => x.status !== 'nominal')) console.log(`${h.crewId}/${h.hazard} [${h.headline}] ${h.explanation}`);
