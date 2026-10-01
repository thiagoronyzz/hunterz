/* End-to-end hunt flow with the real js/game.js: contracts are rolled at the start,
   kills score by zone/distance/stealth, finishing the contracts ends the hunt with a
   score breakdown, and the leaderboard stores scores instead of times. */
const fs = require('fs'), vm = require('vm');
const boot = require('./harness.js');
const ROOT = require('path').join(__dirname, '..');
const SCRIPTS = ['js/util.js','js/physics.js','js/vegetation.js','js/world.js','js/textures.js','js/effects.js','js/audio.js','js/animals.js','js/weapon.js','js/score.js','js/missions.js'];
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const h = boot(ROOT, SCRIPTS);
const sb = h.sandbox;
sb.HZ.textures.build = () => {}; sb.HZ.textures.toThree = () => {};
sb.HZ.heightAt = () => 0;
sb.HZ.isWater = () => false;
sb.HZ.forestDensity = () => 0.2;
sb.HZ.windUniforms = { uWind: { value: 1 } };
sb.HZ.sharedUniforms = { uFadeGrass: { value: { x: 30, y: 30, clone() { return { x: this.x, y: this.y }; }, set() {} } } };

const fakeWorld = {
  scene: null, layers: [], physics: { raycast: () => null, moveCircle: (p, mx, mz) => { p.x += mx; p.z += mz; return { ground: 0 }; } },
  SPAWN: { x: 0, z: 18 }, BOUND: 196, sunDir: { x: -0.4, y: 0.6, z: -0.7 },
  sun: { intensity: 3.3, color: {} }, hemi: { intensity: 0.55 },
  skyU: { uHorizon: { value: { clone: () => ({ copy() { return this; }, lerp() { return this; } }) } }, uZenith: { value: { clone: () => ({ copy() { return this; }, lerp() { return this; } }) } }, uRain: { value: 0 }, uFlash: { value: 0 }, uSunI: { value: 1 } },
  wetU: { value: 0 },
  forceUpdate() {}, update() {}, trailDist: () => 99,
};
const noop = () => {};
sb.HZ.Effects = function () { return { groundDecal: noop, muzzleSmoke: noop, ejectCasing: noop, impact: noop, update: noop, clear: noop }; };
sb.HZ.Audio = function () { return new Proxy({}, { get: () => noop }); };
sb.HZ.AnimalManager = function () { return { list: [], threats: [], spawnAll() { this.list = [{ dead: false }, { dead: false }, { dead: false }, { dead: false }]; }, update: noop, gunshot: noop, raycast: () => null, onKillCb: null }; };
sb.HZ.Rifle = function () { return { root: { visible: true }, scene: {}, state: 'ready', startReload: noop, fire: noop, update: noop, muzzleWorld: noop, ejectWorld: noop, sun: { intensity: 1 } }; };
sb.HZ.Post = function () { return { u: new Proxy({}, { get: () => ({ value: 0 }) }), setSize: noop, render: noop }; };
sb.HZ.buildWorld = async (renderer, scene, quality, onProgress) => { if (onProgress) onProgress(1, 'Ready'); return fakeWorld; };

sb.location = { href: 'http://localhost:8000/index.html?test=1&q=low', search: '?test=1&q=low', replace() {}, assign() {} };
sb.requestAnimationFrame = () => 0;
vm.runInContext(fs.readFileSync(ROOT + '/js/game.js', 'utf8'), sb, { filename: ROOT + '/js/game.js' });

let fails = 0;
const el = h.elCache;
const check = (name, got, pred) => {
  const ok = pred(got);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(40)} ${JSON.stringify(String(got).slice(0, 84))}`);
};
const text = (id) => el.get(id).textContent;
const deer = (name, points) => ({ sp: { name, points }, type: name.toLowerCase() });

(async () => {
  await wait(3000);
  const G = sb.HZ.game;
  check('HZ.game exposed (?test=1)', !!G, v => v === true);
  check('hunt mode defaults to contracts', G.huntMode, v => v === 'contracts');

  // ---------------------------------------------------------------- hunt start
  G.startGame();
  const rolled = G.contracts;
  check('three contracts are rolled', rolled.list.length, v => v === 3);
  check('contracts panel is visible', !el.get('contracts').classList.contains('hidden'), v => v === true);
  check('contract counter', String(text('contractCount')), v => v === '0/3');
  check('contract list rendered', el.get('contractList').children.length, v => v === 3);
  check('HUD mission shows the active contract', text('missionText') === rolled.active.desc, v => v === true);
  check('remaining line switched to contracts', String(text('remainingLabel')), v => v === 'CONTRACTS LEFT');
  check('score starts at zero', String(text('scoreValue')), v => v === '0');

  // deterministic contracts so the whole flow can be driven exactly
  rolled.list.length = 0;
  rolled.list.push(
    { key: 'deer', tier: 'core', title: 'MEAT FOR THE WEEK', desc: 'Harvest 2 deer', need: 2, reward: 180, progress: 0, done: false, test: (e) => e.type === 'deer' },
    { key: 'any', tier: 'skill', title: 'MARKSMAN', desc: '3 clean head shots', need: 3, reward: 320, progress: 0, done: false, test: (e) => e.zone === 'head' },
    { key: 'wolf', tier: 'predator', title: 'PACK CONTROL', desc: 'Harvest a wolf', need: 1, reward: 350, progress: 0, done: false, test: (e) => e.type === 'wolf' },
  );
  G.updateAnimalUI();
  const rows = () => el.get('contractList').children.map(li => ({ cls: li.className, text: li.children.map(c => c.textContent).join(' · ') }));

  // ---------------------------------------------------------------- scoring
  const hit = (animal, zone, info) => { G.animals.onKillCb(animal, zone, info); };
  const deer = (name, points) => ({ sp: { name, points }, type: name.toLowerCase() });
  G.S.lastSpottedT = G.S.time;                      // spotted: no stealth bonus
  hit(deer('Deer', 150), 'body', { zone: 'body', vital: true, distance: 60 });
  // 150 points, accuracy 0.75 (no shot recorded), vitals 1.20 (1 vital of 1 kill) = 135
  check('kill feed shows points', el.get('killFeed').children[0].innerHTML, v => v === 'Deer down · heart/lung <b>+150 pts</b>');
  check('score updated on kill', String(text('scoreValue')), v => v === '135');
  check('contract progress rendered', rows()[0].text, v => v === 'Harvest 2 deer · 1/2 · MEAT FOR THE WEEK · +180');
  console.log('       contract rows:', JSON.stringify(rows()));

  // second deer finishes the first contract
  hit(deer('Deer', 150), 'head', { zone: 'head', vital: true, distance: 30 });
  check('contract completed', String(text('contractCount')), v => v === '1/3');
  check('finished contract is marked done', rows()[0].cls, v => v === 'done');
  check('next contract becomes active', rows()[1].cls, v => v === 'active');
  check('completion toast', String(text('toast')), v => /CONTRACT COMPLETE · MEAT FOR THE WEEK · \+180/.test(v));
  check('objective points credited', G.score.objectivePoints, v => v === 180);

  // skill contract: three head shots (one is already in)
  hit(deer('Deer', 150), 'head', { zone: 'head', vital: true, distance: 30 });
  check('skill contract halfway', String(text('contractCount')), v => v === '1/3');
  check('an animal that bleeds out pays 20% less', (() => {
    const before = G.score.killPoints;
    hit({ sp: { name: 'Fox', points: 120 }, type: 'fox' }, 'body', null);
    return G.score.killPoints - before;
  })(), v => v === 96);
  hit(deer('Deer', 150), 'head', { zone: 'head', vital: true, distance: 30 });
  check('skill contract completed', String(text('contractCount')), v => v === '2/3');
  check('second completion toast', String(text('toast')), v => /MARKSMAN · \+320/.test(v));
  check('hunt still running before the last contract', G.S.mode, v => v === 'playing');

  hit({ sp: { name: 'Wolf', points: 220 }, type: 'wolf' }, 'neck', { zone: 'neck', vital: true, distance: 90 });
  check('all contracts complete', String(text('contractCount')), v => v === '3/3');

  // the finished hunt opens the result screen with the breakdown
  await wait(1800);
  check('hunt ended', G.S.mode, v => v === 'ended');
  check('end screen visible', !el.get('endScreen').classList.contains('hidden'), v => v === true);
  check('end overline mentions contracts', String(text('endOverline')), v => v === 'ALL CONTRACTS COMPLETE');
  const bd = el.get('scoreBreakdown').children.map(li => li.children.map(c => c.textContent).join(' '));
  console.log('       breakdown:', JSON.stringify(bd));
  check('breakdown lists every factor', bd.length, v => v === 6);
  // 150 (deer body) + 300 + 300 (deer heads) + 96 (fox bled out) + 300 (deer head) + 367 (wolf neck at 90 m)
  check('kill points in the breakdown', bd.some(r => r === 'Kill points 1513'), v => v === true);
  check('contract points in the breakdown', bd.some(r => r === 'Contract points 850'), v => v === true);
  check('accuracy factor penalised', bd.some(r => r === 'Accuracy factor ×0.75'), v => v === true);
  check('final score matches the tally', String(text('finalScore')), v => v === String(G.score.total) && Number(v) > 1500);
  check('accuracy shown in the grid', String(text('finalAccuracy')), v => v === '0%');
  check('top-10 entry offered', !el.get('rankingEntry').classList.contains('hidden'), v => v === true);

  // ---------------------------------------------------------------- leaderboard
  el.get('playerName').value = 'thiago';
  const save = h.listeners.filter(([k]) => k === 'saveRankButton:click').pop();
  save[1]();
  const stored = JSON.parse(h.store.get('hunterz-ranking-v3') || '[]');
  check('leaderboard key is v3', h.store.has('hunterz-ranking-v3'), v => v === true);
  check('record stores the score', stored[0] && stored[0].score, v => v === G.score.total);
  check('record keeps name/kills/time', stored[0] && `${stored[0].name}/${stored[0].kills}/${typeof stored[0].time}`, v => v === 'THIAGO/6/number');
  const rankRow = el.get('startRanking').children[0];
  check('start-screen ranking shows the hunter', rankRow.children[0].textContent, v => v === 'THIAGO');
  check('start-screen ranking shows points', rankRow.children[1].textContent, v => v === `${G.score.total} pts`);
  check('save message', String(text('rankMessage')), v => v === 'Record saved to the Top 10!');

  // ---------------------------------------------------------------- free hunt mode
  G.setHuntMode('free');
  check('contracts panel hidden in free hunt', el.get('contracts').classList.contains('hidden'), v => v === true);
  check('remaining line back to animals', String(text('remainingLabel')), v => v === 'ANIMALS REMAINING');
  check('animal counter shows live animals', String(text('animalCount')), v => v === '4');
  G.S.kills = 0;
  G.updateAnimalUI();
  check('mission text in free hunt', String(text('missionText')), v => v === 'Take down the wildlife · 0/4');
  G.setHuntMode('contracts');

  console.log(fails === 0 ? 'PASS contracts + score flow' : `FAIL ${fails} check(s)`);
  process.exit(fails ? 1 : 0);
})();
