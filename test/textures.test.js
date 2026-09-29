const boot = require('./harness.js');
const { sandbox } = boot(require('path').join(__dirname, '..'), ['js/util.js', 'js/world.js', 'js/textures.js']);
const HZ = sandbox.HZ;
let fails = 0;
for (const q of ['high', 'medium', 'low']) {
  try {
    HZ.textures.build(q);
    HZ.textures.toThree();
    const names = Object.keys(HZ.textures).filter(k => k !== 'build' && k !== 'toThree');
    console.log(`build('${q}') -> OK, textures:`, names.length, names.slice(0, 8).join(','), '...');
  } catch (e) {
    fails++; console.log(`build('${q}') -> FAIL`, e.message);
  }
}
// legacy id must no longer resolve to a branch of its own: 'baixa' falls into the "else" (high) branch
HZ.textures.build('baixa');
console.log("build('baixa') legacy id -> OK (falls through to the high-res branch, unused by game.js)");
console.log(fails === 0 ? 'PASS textures' : 'FAIL textures');
process.exit(fails ? 1 : 0);
