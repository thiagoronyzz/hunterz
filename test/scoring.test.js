/* Scoring rules and contract rolling, without a browser: the point of the scoring
   system is that a clean, patient hunt beats a fast, sloppy one, so that is what
   these checks measure. */
const path = require('path');
const boot = require('./harness.js');
const { sandbox } = boot(path.join(__dirname, '..'), ['js/util.js', 'js/score.js', 'js/missions.js']);
const HZ = sandbox.HZ;

let fails = 0;
const check = (name, got, pred) => {
  const ok = pred(got);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(42)} ${JSON.stringify(got).slice(0, 80)}`);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ---------------------------------------------------------------- zone / distance
const deer = { name: 'Deer', points: 150 };
check('body shot at 0 m = species points', HZ.Score.killPoints(deer, { zone: 'body' }), v => v === 150);
check('head shot doubles the points', HZ.Score.killPoints(deer, { zone: 'head' }), v => v === 300);
check('neck shot = 1.5x', HZ.Score.killPoints(deer, { zone: 'neck' }), v => v === 225);
check('leg shot is penalised', HZ.Score.killPoints(deer, { zone: 'leg' }), v => v === 113);
check('distance factor is flat to 60 m', HZ.Score.distanceMult(60), v => near(v, 1));
check('distance factor caps at 1.6', HZ.Score.distanceMult(1000), v => near(v, 1.6));
check('far kill is worth more than a close one',
  HZ.Score.killPoints(deer, { zone: 'body', distance: 200 }) > HZ.Score.killPoints(deer, { zone: 'body', distance: 20 }), v => v === true);
check('stealth bonus', HZ.Score.killPoints(deer, { zone: 'body', stealth: true }), v => v === 180);
check('bleeding out pays less', HZ.Score.killPoints(deer, { zone: 'body', bledOut: true }), v => v === 120);
check('no species = no points', HZ.Score.killPoints(null, { zone: 'head' }), v => v === 0);
check('kill label: vital body shot', HZ.Score.killLabel({ zone: 'body', vital: true }), v => v === 'heart/lung');
check('kill label: bled out', HZ.Score.killLabel({ zone: 'body', bledOut: true }), v => v === 'bled out');

// ---------------------------------------------------------------- multipliers
check('accuracy: no shot fired = 0.75', HZ.Score.accuracyMult(0, 0), v => near(v, 0.75));
check('accuracy: 50% = 1.00', HZ.Score.accuracyMult(4, 2), v => near(v, 1));
check('accuracy: perfect = 1.25', HZ.Score.accuracyMult(4, 4), v => near(v, 1.25));
check('accuracy cannot exceed 1.25 (multi-hit bug guard)', HZ.Score.accuracyMult(2, 9), v => near(v, 1.25));
check('vitals: none = 0.85', HZ.Score.vitalsMult(4, 0), v => near(v, 0.85));
check('vitals: all = 1.20', HZ.Score.vitalsMult(4, 4), v => near(v, 1.2));

// a sloppy run: same kills, rushed and wasteful
const clean = { shots: 4, hits: 4, kills: 4, vitalKills: 4, killPoints: 1200, objectivePoints: 400 };
const sloppy = { shots: 20, hits: 5, kills: 4, vitalKills: 1, killPoints: 1200, objectivePoints: 400 };
const cB = HZ.Score.breakdown(clean), sB = HZ.Score.breakdown(sloppy);
console.log('  clean run  ->', cB.total, `(acc x${cB.accuracyMult.toFixed(2)}, vitals x${cB.vitalsMult.toFixed(2)})`);
console.log('  sloppy run ->', sB.total, `(acc x${sB.accuracyMult.toFixed(2)}, vitals x${sB.vitalsMult.toFixed(2)})`);
check('same kills: the clean hunt scores higher', cB.total > sB.total, v => v === true);
check('empty hunt scores 0', HZ.Score.breakdown({}).total, v => v === 0);

// the tally keeps the session numbers in sync with the breakdown
const tally = HZ.Score.create();
tally.shotFired(); tally.shotHit(); tally.shotFired(); tally.shotFired();
tally.addKill(deer, { zone: 'head', vital: true, distance: 60 });
tally.addObjective(250);
check('tally counts kills', tally.kills, v => v === 1);
check('tally counts vital kills', tally.vitalKills, v => v === 1);
check('tally accumulates kill points', tally.killPoints, v => v === 300);
check('tally adds contract rewards', tally.objectivePoints, v => v === 250);
check('tally live total = breakdown total', tally.total, v => v === tally.breakdown().total && v > 0);
const before = tally.total;
tally.reset();
check('reset clears the session', tally.total, v => v === 0 && before > 0);

// ---------------------------------------------------------------- contracts
const seeded = () => HZ.rng(7);
for (let i = 0; i < 200; i++) {
  const list = HZ.Missions.roll(HZ.rng(100 + i));
  if (list.length !== 3 || !list.every(c => c.need > 0 && c.reward > 0 && typeof c.test === 'function')) { fails++; console.log('FAIL rolled contracts are malformed', JSON.stringify(list.map(c => c.id))); break; }
  const tiers = list.map(c => c.tier).join(',');
  if (tiers !== 'core,skill,predator') { fails++; console.log('FAIL one contract per tier, got', tiers); break; }
  if (new Set(list.map(c => c.key)).size !== 3) { fails++; console.log('FAIL duplicate species keys in', list.map(c => c.key).join(',')); break; }
}
console.log('PASS 200 rolls: 3 contracts, one per tier, no duplicated target');

// pool sanity: every contract must react to any kill event without throwing
let poolOk = true;
const sample = { type: 'deer', zone: 'head', vital: true, distance: 200, stealth: true, crouch: true, bledOut: false };
for (const tier of HZ.Missions.TIERS) {
  for (const def of HZ.Missions.POOL[tier]) {
    for (const type of ['deer', 'boar', 'fox', 'rabbit', 'wolf', 'bear']) {
      const r = def.test({ ...sample, type, zone: type === 'rabbit' ? 'head' : 'body' });
      if (typeof r !== 'boolean') { poolOk = false; console.log('FAIL contract', def.title, 'returned', r); }
    }
  }
}
check('every contract survives any kill event', poolOk, v => v === true);

// session semantics on a fixed contract (2 deer, vital hit)
const list = HZ.Missions.roll(seeded());
const fake = { key: 'deer', tier: 'core', title: 'TEST', desc: 'Harvest 2 deer with a vital hit', need: 2, reward: 100, progress: 0, done: false, test: (e) => e.type === 'deer' && !!e.vital };
const session = new HZ.Missions.Session([fake]);
check('session starts untouched', `${session.completed}/${session.total}`, v => v === '0/1');
check('session is not done at the start', session.allDone, v => v === false);
check('active contract is the first incomplete', session.active === fake, v => v === true);

check('a wound does not count', session.onKill({ type: 'deer', vital: false }).length, v => v === 0);
session.onKill({ type: 'deer', vital: true });
check('progress after one vital hit', session.progressOf(fake), v => v === 1);
const finished = session.onKill({ type: 'deer', vital: true });
check('contract completes on the second hit', fake.done, v => v === true);
check('completion is reported once', finished.filter(c => c === fake).length, v => v === 1);
check('progress never exceeds need', session.progressOf(fake), v => v === 2);
check('no progress after done', session.onKill({ type: 'deer', vital: true }).length, v => v === 0);
check('allDone with a single contract', session.allDone, v => v === true);

check('reward total sums every contract', session.rewardTotal, v => v === 100);
check('a rolled hunt is worth the sum of its contracts',
  new HZ.Missions.Session(list).rewardTotal, v => v === list.reduce((sum, c) => sum + c.reward, 0) && v >= 700);

console.log(fails === 0 ? 'PASS scoring + missions' : `FAIL ${fails} check(s)`);
process.exit(fails ? 1 : 0);
