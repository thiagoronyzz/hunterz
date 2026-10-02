/* Spawns fauna through the real manager and checks names, predator/prey reactions,
   and that mission targets remain possible with the generated wildlife roster. */
const path = require('path');
const boot = require('./harness.js');
const ROOT = path.join(__dirname, '..');
const SCRIPTS = ['js/util.js', 'js/physics.js', 'js/vegetation.js', 'js/animals.js', 'js/score.js', 'js/missions.js'];
const noop = () => {};

const h = boot(ROOT, SCRIPTS);
const sb = h.sandbox;
sb.HZ.heightAt = () => 0;
sb.HZ.isWater = () => false;
// HZ.tx is normally produced by textures.toThree(); stub it with texture-like objects
sb.HZ.tx = new Proxy({}, { get: (t, k) => (typeof k === 'string' ? {} : undefined) });

const scene = { add: noop, remove: noop };
const physics = { isBlocked: () => false, raycast: () => null };
const effects = { bloodStain: noop, groundDecal: noop, bodyDecal: noop };
const audio = new Proxy({}, { get: () => noop });

const mgr = new sb.HZ.AnimalManager(scene, physics, effects, audio);
mgr.spawnAll({ x: 0, z: 18 });

const names = mgr.list.map(a => a.sp.name);
const uniq = [...new Set(names)].sort();
console.log('spawned animals :', names.length);
console.log('species names   :', uniq.join(', '));

let fails = 0;
const want = ['Bear', 'Boar', 'Deer', 'Fox', 'Rabbit', 'Wolf'];
if (uniq.join(',') !== want.join(',')) { fails++; console.log('FAIL species names -> expected', want.join(', ')); }
else console.log('PASS species names');

// the interaction hint uppercases the species name, the kill feed uses it verbatim
const hint = `${mgr.list[0].sp.name.toUpperCase()} DOWN`;
if (/[à-ÿ]/.test(hint) || !/^[A-Z ]+ DOWN$/.test(hint)) { fails++; console.log('FAIL hint text', hint); }
else console.log('PASS interaction hint text:', JSON.stringify(hint));

// Every animal that is not a predator should flee on sight, including boars.
const player = { pos: { x: 0, y: 0, z: 0, clone() { return { x: this.x, y: this.y, z: this.z }; } }, alive: true, moving: true, noise: 0, crouch: false };
const perception = { player, time: 1, rain: false };
for (const type of ['deer', 'boar', 'fox', 'rabbit']) {
  const animal = mgr.list.find(a => a.type === type);
  animal.state = 'walk'; animal.stateT = 10; animal.aware = 0; animal.senseT = 0;
  animal.sense = () => ({ canSee: true, canHear: false, sightR: animal.sp.sight });
  animal.think(0.016, perception, 20);
  if (animal.state !== 'flee' || animal.targetSpeed <= 0) { fails++; console.log(`FAIL ${type} should flee from a hunter in sight`); }
  else console.log(`PASS ${type} flees on sight`);
}
for (const type of ['wolf', 'bear']) {
  const animal = mgr.list.find(a => a.type === type);
  animal.state = 'idle'; animal.stateT = 10; animal.aware = 0; animal.senseT = 0;
  animal.sense = () => ({ canSee: true, canHear: false, sightR: animal.sp.sight });
  animal.think(0.016, perception, 20);
  if (animal.state === 'flee') { fails++; console.log(`FAIL ${type} predator incorrectly flees`); }
  else console.log(`PASS ${type} remains predator behavior`);
}

// ---------------------------------------------------------------- mission feasibility
// every contract in the pool must be solvable with the animals this forest spawns
const PLAN = new Map(sb.HZ.SPAWN_PLAN.map(([type, n]) => [type, n]));
const KEY_SPECIES = { deer: ['deer'], boar: ['boar'], small: ['fox', 'rabbit'], wolf: ['wolf'], bear: ['bear'], predator: ['wolf', 'bear'], any: [...PLAN.keys()] };
console.log('spawn plan      :', [...PLAN.entries()].map(([t, n]) => `${t}x${n}`).join(' '));
for (const tier of sb.HZ.Missions.TIERS) {
  for (const def of sb.HZ.Missions.POOL[tier]) {
    const species = KEY_SPECIES[def.key];
    const available = species ? species.reduce((sum, t) => sum + (PLAN.get(t) || 0), 0) : 0;
    if (available < def.need) { fails++; console.log(`FAIL impossible contract [${tier}] ${def.title} (${def.desc}) needs ${def.need} of ${def.key}, forest has ${available}`); }
    else console.log(`PASS solvable   [${tier}] ${def.title.padEnd(22)} ${def.desc} (+${def.reward})`);
  }
}

console.log(fails === 0 ? 'PASS species' : `FAIL ${fails} check(s)`);
process.exit(fails ? 1 : 0);
