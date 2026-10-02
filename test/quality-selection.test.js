/* Exercises js/game.js: quality selection, touch-device detection and virtual
   joystick/action handlers, plus loading/error strings and the low-quality retry.
   Runs real modules in the stubbed DOM + THREE sandbox (see harness.js); GPU-bound
   world and texture generation is covered separately by textures.test.js. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const boot = require('./harness.js');
const ROOT = path.join(__dirname, '..');
const SCRIPTS = ['js/util.js', 'js/physics.js', 'js/vegetation.js', 'js/world.js', 'js/textures.js', 'js/effects.js', 'js/audio.js', 'js/animals.js', 'js/weapon.js', 'js/score.js', 'js/missions.js'];
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const noop = () => {};

function run({ search = '', stored = null, mobile = false, failBuild = false }) {
  const h = boot(ROOT, SCRIPTS);
  const sb = h.sandbox;
  sb.HZ.textures.build = noop;
  sb.HZ.textures.toThree = noop;
  sb.HZ.heightAt = () => 0;
  sb.HZ.isWater = () => false;
  sb.HZ.forestDensity = () => 0.2;
  sb.HZ.windUniforms = { uWind: { value: 1 } };
  sb.HZ.sharedUniforms = { uFadeGrass: { value: { x: 30, y: 30, clone() { return { x: this.x, y: this.y }; }, set() {} } } };
  sb.HZ.Effects = function () { return { groundDecal: noop, muzzleSmoke: noop, ejectCasing: noop, impact: noop, update: noop, clear: noop }; };
  sb.HZ.Audio = function () { return new Proxy({}, { get: () => noop }); };
  sb.HZ.AnimalManager = function () { return { list: [], threats: [], spawnAll() {}, update: noop, gunshot: noop, raycast: () => null, onKillCb: null }; };
  sb.HZ.Rifle = function () { return { root: {}, scene: {}, state: 'ready', startReload: noop, fire: noop, update: noop, muzzleWorld: noop, ejectWorld: noop, sun: { intensity: 1 } }; };
  sb.HZ.Post = function () { return { u: new Proxy({}, { get: () => ({ value: 0 }) }), setSize: noop, render: noop }; };
  sb.HZ.buildWorld = async (renderer, scene, quality, onProgress) => {
    if (failBuild) throw new Error('stubbed world failure');
    if (onProgress) onProgress(0.5, 'Sculpting the terrain');
    return {
      scene: null, layers: [], physics: { raycast: () => null, moveCircle: (p, mx, mz) => ({ ground: 0 }) },
      SPAWN: { x: 0, z: 18 }, BOUND: 196, sunDir: { x: -0.4, y: 0.6, z: -0.7 },
      sun: { intensity: 3.3, color: {} }, hemi: { intensity: 0.55 },
      skyU: { uHorizon: { value: { clone: () => ({ copy() { return this; }, lerp() { return this; } }) } }, uZenith: { value: { clone: () => ({ copy() { return this; }, lerp() { return this; } }) } }, uRain: { value: 0 }, uFlash: { value: 0 }, uSunI: { value: 1 } },
      wetU: { value: 0 }, forceUpdate: noop, update: noop, trailDist: () => 99,
    };
  };
  sb.location = { href: 'http://localhost:8000/index.html' + search, search, replace(u) { sb.__replaced = u; }, assign(u) { sb.__assigned = u; } };
  if (stored) sb.localStorage.setItem('hunterz-quality', stored);
  if (mobile) sb.navigator = { userAgent: 'Mozilla/5.0 (iPhone) Mobile/15E148', deviceMemory: 0, hardwareConcurrency: 0 };
  sb.requestAnimationFrame = () => 0;
  vm.runInContext(fs.readFileSync(ROOT + '/js/game.js', 'utf8'), sb, { filename: ROOT + '/js/game.js' });
  return { sb, el: h.elCache, listeners: h.listeners };
}

let fails = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(34)} got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
};

(async () => {
  const cases = [
    ['?q=low',                { search: '?q=low' },        'low'],
    ['?q=high',               { search: '?q=high' },       'high'],
    ['?q=alta  (legacy pt)',  { search: '?q=alta' },       'high'],
    ['?q=baixa (legacy pt)',  { search: '?q=baixa' },      'low'],
    ['?q=media (legacy pt)',  { search: '?q=media' },      'medium'],
    ['?q=nonsense',           { search: '?q=nonsense' },   'medium'],
    ['stored baixa (legacy)', { stored: 'baixa' },         'low'],
    ['stored medium',         { stored: 'medium' },        'medium'],
    ['mobile default',        { mobile: true },            'low'],
    ['desktop default',       {},                          'medium'],
  ];
  let mobileRun = null;
  for (const [name, opts, want] of cases) {
    const r = run(opts);
    await wait(120);
    check(name + ' -> quality', r.el.get('qualitySelect').value, want);
    if (name === 'mobile default') {
      mobileRun = r;
      check('mobile touch controls detected', r.el.get('touchControls').classList.contains('touch-enabled'), true);
    }
  }

  // exercise real touch handlers from the game module using touch-like pointer events
  await wait(300);
  const MG = mobileRun.sb.HZ.game;
  MG.startGame();
  const pointer = (pointerId, x = 0, y = 0) => ({ pointerType: 'touch', pointerId, clientX: x, clientY: y, preventDefault() {} });
  const call = (id, type, event) => {
    const entry = mobileRun.listeners.filter(([name]) => name === `${id}:${type}`).pop();
    if (!entry) throw new Error(`missing touch handler ${id}:${type}`);
    entry[1](event);
  };
  call('touchFire', 'pointerdown', pointer(1));
  check('touch fire queues a shot', MG.S.fire, true);
  call('touchAim', 'pointerdown', pointer(2));
  check('touch aim toggles scope', MG.S.aimHeld, true);
  call('touchCrouch', 'pointerdown', pointer(5));
  check('touch crouch toggles stance', MG.P.crouch, true);
  call('touchJump', 'pointerdown', pointer(6));
  check('touch jump queues one hop', MG.S.touchJump, true);
  call('touchBreath', 'pointerdown', pointer(7));
  check('touch breath hold is active', MG.S.touchBreath, true);
  call('touchBreath', 'pointerup', pointer(7));
  check('touch breath releases', MG.S.touchBreath, false);
  call('touchSprint', 'pointerdown', pointer(3));
  check('sprint stays active while pressed', MG.S.touchSprint, true);
  call('touchSprint', 'pointerup', pointer(3));
  check('sprint releases on touch up', MG.S.touchSprint, false);
  mobileRun.el.get('touchStick').getBoundingClientRect = () => ({ left: 0, top: 0, width: 128, height: 128 });
  call('touchStick', 'pointerdown', pointer(4, 96, 64));
  check('joystick produces smooth analog input', MG.S.touchMove.x > 0.7 && MG.S.touchMove.x < 0.8, true);
  call('touchStick', 'pointerup', pointer(4, 96, 64));
  check('joystick centers after release', MG.S.touchMove.x === 0 && MG.S.touchMove.y === 0, true);

  // happy path: translated loading messages and the final "Ready"
  const ok = run({ search: '?q=low' });
  await wait(300);
  check('loadMsg is English', /[à-ÿ]/.test(ok.el.get('loadMsg').textContent), false);
  check('loadMsg = Ready', ok.el.get('loadMsg').textContent, 'Ready');
  check('loading screen hidden', ok.el.get('loadingScreen').classList.contains('hidden'), true);
  check('start screen visible', ok.el.get('startScreen').classList.contains('hidden'), false);

  // failure path: translated error copy + the low-quality retry writes the English id
  const bad = run({ search: '?q=high', failBuild: true });
  await wait(300);
  check('error loadMsg', bad.el.get('loadMsg').textContent, 'Could not prepare the forest at this quality.');
  check('error detail', bad.el.get('loadErrorDetail').textContent, 'stubbed world failure');
  check('error panel shown', bad.el.get('loadError').classList.contains('hidden'), false);
  const retry = bad.listeners.filter(([k]) => k === 'retryLowButton:click').pop();
  check('retry button bound', !!retry, true);
  if (retry) retry[1]();
  check('retry stores low', bad.sb.localStorage.getItem('hunterz-quality'), 'low');
  check('retry URL uses q=low', /q=low/.test(bad.sb.__replaced || ''), true);

  console.log(fails === 0 ? 'PASS quality-selection' : `FAIL ${fails} check(s)`);
  process.exit(fails ? 1 : 0);
})();
