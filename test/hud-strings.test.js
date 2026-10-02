/* Runs js/game.js end-to-end in the sandbox with a stubbed world, then drives the
   real HUD/weapon/kill-feed functions and asserts every player-facing string is English. */
const fs = require('fs'), vm = require('vm');
const boot = require('./harness.js');
const ROOT = require('path').join(__dirname, '..');
const SCRIPTS = ['js/util.js','js/physics.js','js/vegetation.js','js/world.js','js/textures.js','js/effects.js','js/audio.js','js/animals.js','js/weapon.js','js/score.js','js/missions.js'];
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const h = boot(ROOT, SCRIPTS);
const sb = h.sandbox;
sb.HZ.textures.build = () => {}; sb.HZ.textures.toThree = () => {};
sb.HZ.heightAt = (x, z) => 0;
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
// Effects/Audio/Animals/Rifle/Post are GPU-bound; stub them so the real game.js
// string paths (HUD, kill feed, hints, death screen) can be driven headlessly.
const noop = () => {};
sb.HZ.Effects = function () { return { groundDecal: noop, muzzleSmoke: noop, ejectCasing: noop, impact: noop, update: noop, clear: noop }; };
sb.HZ.Audio = function () { return new Proxy({}, { get: () => noop }); };
sb.HZ.AnimalManager = function () { return { list: [], threats: [], spawnAll() { this.list = [{ dead: false }, { dead: false }, { dead: false }]; }, update: noop, gunshot: noop, raycast: () => null, onKillCb: null }; };
sb.HZ.Rifle = function () { return { root: { visible: true }, scene: {}, state: 'ready', startReload: noop, fire: noop, update: noop, muzzleWorld: noop, ejectWorld: noop, sun: { intensity: 1 } }; };
sb.HZ.Post = function () { return { u: new Proxy({}, { get: () => ({ value: 0 }) }), setSize: noop, render: noop }; };

sb.HZ.buildWorld = async (renderer, scene, quality, onProgress) => { if (onProgress) { onProgress(0.5, 'Sculpting the terrain'); onProgress(1, 'Adjusting the light'); } return fakeWorld; };

sb.location = { href: 'http://localhost:8000/index.html?test=1&q=low', search: '?test=1&q=low', replace() {}, assign() {} };
sb.requestAnimationFrame = () => 0;
vm.runInContext(fs.readFileSync(ROOT + '/js/game.js', 'utf8'), sb, { filename: ROOT + '/js/game.js' });

let fails = 0;
const isEn = (s) => !/[à-ÿÀ-Ÿ]/.test(String(s));
const check = (name, got, pred) => {
  const ok = pred(got);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(36)} ${JSON.stringify(String(got).slice(0, 90))}`);
};

(async () => {
  await wait(3000);
  const el = h.elCache;
  check('loading finished', el.get('loadingScreen').classList.contains('hidden'), v => v === true);
  check('loadMsg = Ready', el.get('loadMsg').textContent, v => v === 'Ready');

  const G = sb.HZ.game;
  check('HZ.game exposed (?test=1)', !!G, v => !!v);

  G.startGame();
  G.setRain(false);
  check('toast on start', el.get('toast').textContent, v => /Deer, foxes, rabbits and boars flee; wolves and bears may attack\./.test(v) && isEn(v));
  check('mission text (contracts)', el.get('missionText').textContent, v => v === G.contracts.active.desc && !/[à-ÿ]/.test(v));
  check('contracts rolled for the hunt', G.contracts.list.length, v => v === 3);
  check('contract list rendered', el.get('contractList').children.length, v => v === 3);
  check('contract counter', String(el.get('contractCount').textContent), v => v === '0/3');
  check('score line starts at zero', String(el.get('scoreValue').textContent), v => v === '0');
  check('reload hint', el.get('reloadHint').textContent, v => v === 'R TO RELOAD');
  check('weather label (clear)', el.get('weatherLabel').textContent, v => v === 'Clear sky');

  G.setRain(true);
  check('weather label (rain)', el.get('weatherLabel').textContent, v => v === 'Heavy rain');

  // empty magazine -> out of ammo hints
  G.S.ammo = 0; G.S.reserve = 10;
  G.shoot();
  check('hintBottom out of ammo', el.get('hintBottom').textContent, v => v === 'OUT OF AMMO · PRESS R');
  G.S.reserve = 0;
  G.shoot();
  check('hintBottom no reserve', el.get('hintBottom').textContent, v => v === 'OUT OF AMMO');

  // bandage flow
  G.P.bandages = 0;
  const kd = h.listeners.filter(([k]) => k === 'win:keydown').pop();
  G.P.bandages = 1; G.P.hp = 50;
  kd[1]({ code: 'KeyQ', preventDefault() {} });
  check('bandage applying hint', el.get('hintBottom').textContent, v => v === 'APPLYING BANDAGE...');
  G.P.bandaging = 0.001;
  // drive one player update through the real loop
  for (let i = 0; i < 4; i++) { G.P.bandaging = 0.001; sb.HZ.game.stepFrames(1, 1 / 30, false); }
  check('bandage done toast', el.get('toast').textContent, v => v === 'Wounds bandaged · +40 health');

  // kill feed: use the real onKillCb via the animals manager hook
  // (spotted -> no stealth bonus; 60 m -> distance factor 1.0, so 150 x2 = 300)
  G.S.lastSpottedT = G.S.time;
  const an = { sp: { name: 'Deer', points: 150 }, type: 'deer' };
  G.animals.onKillCb(an, 'head', { zone: 'head', vital: true, distance: 60 });
  check('kill feed entry', el.get('killFeed').children[0] && el.get('killFeed').children[0].innerHTML, v => v === 'Deer down · head shot <b>+300 pts</b>');
  check('mission after kill', el.get('missionText').textContent, v => isEn(v));
  check('score after kill', Number(el.get('scoreValue').textContent) > 0, v => v === true);

  // player death by predator
  G.damagePlayer(999, { x: 5, z: 5, type: 'wolf' }, 0);
  check('death cause (wolf)', el.get('deathCause').textContent, v => v === 'ATTACKED BY A WOLF');
  G.P.alive = true; G.P.hp = 100;
  G.damagePlayer(999, null, 0);
  check('death cause (bleed out)', el.get('deathCause').textContent, v => v === 'YOU BLED OUT');
  // real killPlayer -> P.alive = false; then let the real frame loop open the death screen
  G.P.alive = true; G.P.hp = 100;
  G.damagePlayer(999, { x: 5, z: 5, type: 'bear' }, 0);
  check('death cause (bear)', el.get('deathCause').textContent, v => v === 'ATTACKED BY A BEAR');
  G.S.mode = 'playing';
  G.stepFrames(90, 1 / 30, false);
  check('death stats', el.get('deathStats').textContent, v => /^Contracts: \d+\/3 · Kills: \d+ · Score: \d+ · Time: \d\d:\d\d$/.test(v));
  G.setHuntMode('free'); G.S.kills = 0; G.updateAnimalUI();
  check('free-hunt mission text', el.get('missionText').textContent, v => /Take down the wildlife · 0\/\d+/.test(v));
  check('free-hunt remaining label', el.get('remainingLabel').textContent, v => v === 'ANIMALS REMAINING');
  G.setHuntMode('contracts');
  check('death screen shown', el.get('deathScreen').classList.contains('hidden'), v => v === false);

  // hit zone labels via the real shoot path
  const zones = [];
  G.animals.raycast = () => ({ distance: 42, point: { x: 0, y: 1, z: 0 }, object: { userData: { animal: {
    takeHit: (hit, dmg, dir) => { zones.push(dir); return { killed: false, vital: true, zone: 'body' }; },
    sp: { name: 'Boar', hostile: 'prey', points: 200 }, dead: false, pos: { distanceTo: () => 3 }, x: 1, y: 1, z: 1 } } } });
  G.S.ammo = 5; G.S.reserve = 40; G.S.mode = 'playing'; G.P.alive = true;
  G.shoot();
  check('hit feed entry', el.get('killFeed').children[0] && el.get('killFeed').children[0].innerHTML, v => v === 'Boar hit · HEART/LUNG <b>42 m</b>');
  check('blood trail hint', el.get('hintBottom').textContent, v => v === 'ANIMAL HIT · FOLLOW THE BLOOD TRAIL');

  // compass directions are the English set
  const dirs = new Set();
  for (let i = 0; i < 8; i++) { G.P.yaw = -(i * Math.PI / 4); sb.HZ.game.stepFrames(1, 0, false); dirs.add(el.get('compassMain').textContent); }
  check('compass uses N/NE/E/SE/S/SW/W/NW', [...dirs].sort().join(','), v => v === 'E,N,NE,NW,S,SE,SW,W');

  console.log(fails === 0 ? 'PASS game.js HUD strings' : `FAIL ${fails} check(s)`);
  process.exit(fails ? 1 : 0);
})();
