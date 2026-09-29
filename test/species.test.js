/* Spawns the fauna through the real js/animals.js manager and asserts the species
   names that surface in the kill feed / interaction hint are the English ones. */
const path = require('path');
const boot = require('./harness.js');
const ROOT = path.join(__dirname, '..');
const SCRIPTS = ['js/util.js', 'js/physics.js', 'js/vegetation.js', 'js/animals.js'];
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

console.log(fails === 0 ? 'PASS species' : `FAIL ${fails} check(s)`);
process.exit(fails ? 1 : 0);
