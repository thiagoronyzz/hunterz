const boot = require('./harness.js');
const { sandbox } = boot(require('path').join(__dirname, '..'), ['js/util.js', 'js/world.js']);
const HZ = sandbox.HZ;
const keys = Object.keys(HZ.QUALITY);
console.log('HZ.QUALITY keys      :', JSON.stringify(keys));
console.log("has high/medium/low  :", !!HZ.QUALITY.high, !!HZ.QUALITY.medium, !!HZ.QUALITY.low);
console.log("legacy alta/media/baixa gone:", HZ.QUALITY.alta === undefined, HZ.QUALITY.media === undefined, HZ.QUALITY.baixa === undefined);
console.log('high.terrainSeg      :', HZ.QUALITY.high.terrainSeg);
console.log('medium.treeStep      :', HZ.QUALITY.medium.treeStep);
console.log('low.shadow           :', HZ.QUALITY.low.shadow);
const ok = keys.length === 3 && !!HZ.QUALITY.high && !!HZ.QUALITY.medium && !!HZ.QUALITY.low
  && !HZ.QUALITY.alta && !HZ.QUALITY.media && !HZ.QUALITY.baixa;
console.log(ok ? 'PASS quality registry' : 'FAIL quality registry');
process.exit(ok ? 0 : 1);
