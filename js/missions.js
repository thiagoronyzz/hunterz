/* HUNTERZ — missions: a hunt is a set of contracts instead of "kill all 37 animals".
   Each hunt rolls one contract from every tier (core / skill / predator), so the
   session always has a reachable goal, one that asks for technique, and one that
   puts the hunter in front of something with teeth. */
(function () {
  'use strict';
  const HZ = (window.HZ = window.HZ || {});

  // evt: { type, zone, vital, distance, stealth, crouch, bledOut, time }
  const isDeer = (e) => e.type === 'deer';
  const isSmall = (e) => e.type === 'fox' || e.type === 'rabbit';
  const isPredator = (e) => e.type === 'wolf' || e.type === 'bear';

  const POOL = {
    core: [
      { key: 'deer', title: 'VITAL SHOT', desc: 'Harvest 2 deer with a vital hit', need: 2, reward: 250, test: (e) => isDeer(e) && !!e.vital },
      { key: 'deer', title: 'MEAT FOR THE WEEK', desc: 'Harvest 2 deer', need: 2, reward: 180, test: isDeer },
      { key: 'small', title: 'SMALL GAME', desc: 'Harvest 2 foxes or rabbits', need: 2, reward: 200, test: isSmall },
      { key: 'small', title: 'CLEAN SHOT', desc: '2 rabbits with head shots', need: 2, reward: 220, test: (e) => e.type === 'rabbit' && e.zone === 'head' },
      { key: 'boar', title: 'BOAR PROBLEM', desc: 'Harvest 2 boars', need: 2, reward: 220, test: (e) => e.type === 'boar' },
    ],
    skill: [
      { key: 'any', title: 'MARKSMAN', desc: '3 clean head shots', need: 3, reward: 320, test: (e) => e.zone === 'head' },
      { key: 'any', title: 'LONG SHOT', desc: '1 kill at 130 m or more', need: 1, reward: 300, test: (e) => (e.distance || 0) >= 130 },
      { key: 'any', title: 'PATIENT HUNTER', desc: '2 kills while crouched', need: 2, reward: 240, test: (e) => !!e.crouch },
      { key: 'any', title: 'GHOST', desc: '1 kill without being spotted', need: 1, reward: 300, test: (e) => !!e.stealth },
      { key: 'boar', title: 'TUSKER', desc: 'Harvest a boar with a vital hit', need: 1, reward: 280, test: (e) => e.type === 'boar' && !!e.vital },
    ],
    predator: [
      { key: 'wolf', title: 'PACK CONTROL', desc: 'Harvest 2 wolves', need: 2, reward: 350, test: (e) => e.type === 'wolf' },
      { key: 'wolf', title: 'BY THE FANG', desc: '1 vital hit on a wolf', need: 1, reward: 300, test: (e) => e.type === 'wolf' && !!e.vital },
      { key: 'bear', title: 'THE BIG ONE', desc: 'Harvest a bear', need: 1, reward: 400, test: (e) => e.type === 'bear' },
      { key: 'predator', title: 'KEEP THE TEETH AWAY', desc: 'Harvest a wolf or a bear', need: 1, reward: 300, test: isPredator },
      { key: 'predator', title: 'NO WOUNDED PREDATORS', desc: '1 vital hit on a wolf or bear', need: 1, reward: 380, test: (e) => isPredator(e) && !!e.vital },
    ],
  };
  const TIERS = ['core', 'skill', 'predator'];

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // one contract per tier, no two contracts chasing the same kind of animal
  function roll(rng = Math.random) {
    const used = new Set();
    const picked = [];
    for (const tier of TIERS) {
      const options = shuffle(POOL[tier], rng);
      const def = options.find(c => !used.has(c.key)) || options[0];
      used.add(def.key);
      picked.push({ ...def, tier, progress: 0, done: false });
    }
    return picked;
  }

  class ContractSession {
    constructor(list) { this.list = list || []; }
    get total() { return this.list.length; }
    get completed() { return this.list.filter(c => c.done).length; }
    get allDone() { return this.list.length > 0 && this.list.every(c => c.done); }
    get rewardTotal() { return this.list.reduce((s, c) => s + c.reward, 0); }
    get active() { return this.list.find(c => !c.done) || this.list[this.list.length - 1] || null; }
    progressOf(c) { return Math.min(c.progress, c.need); }
    // returns the contracts finished by this kill
    onKill(evt) {
      const finished = [];
      for (const c of this.list) {
        if (c.done || !c.test(evt)) continue;
        c.progress++;
        if (c.progress >= c.need) { c.done = true; finished.push(c); }
      }
      return finished;
    }
  }

  HZ.Missions = { POOL, TIERS, roll, create: (rng) => new ContractSession(roll(rng)), Session: ContractSession };
})();
