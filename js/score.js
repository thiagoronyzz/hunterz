/* HUNTERZ — scoring: turns a hunt into a number that rewards clean, patient shooting
   instead of a dash for kills. Points come from the species, the hit zone, the shot
   distance and whether the animal ever saw you; the total is then shaped by shot
   accuracy and how many kills were vital (heart/lung, neck or head). */
(function () {
  'use strict';
  const HZ = (window.HZ = window.HZ || {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // hit zones: a head shot is worth twice a body shot, a wounded leg much less
  const ZONE_MULT = { head: 2, neck: 1.5, body: 1, leg: 0.75 };
  const ZONE_LABEL = { head: 'head shot', neck: 'neck shot', body: 'body shot', leg: 'leg shot' };

  // 1.00 up to 60 m, growing to 1.60 at 220 m and beyond
  const distanceMult = (d) => 1 + 0.6 * clamp(((d || 0) - 60) / 160, 0, 1);
  const stealthMult = 1.2;   // the animal never spotted you
  const bleedOutMult = 0.8;  // died from the wound, not from a clean follow-up

  function killPoints(sp, evt) {
    if (!sp) return 0;
    const zone = evt && evt.zone;
    let pts = (sp.points || 0) * (ZONE_MULT[zone] || 1) * distanceMult(evt && evt.distance);
    if (evt && evt.stealth) pts *= stealthMult;
    if (evt && evt.bledOut) pts *= bleedOutMult;
    return Math.round(pts);
  }

  // human-readable reason shown in the kill feed
  function killLabel(evt) {
    if (!evt) return 'killed';
    if (evt.bledOut) return 'bled out';
    if (evt.zone === 'body' && evt.vital) return 'heart/lung';
    return ZONE_LABEL[evt.zone] || 'body shot';
  }

  // 0.75 with every shot missed, 1.25 with a perfect hunt
  const accuracyMult = (shots, hits) => 0.75 + 0.5 * (shots > 0 ? clamp(hits / shots, 0, 1) : 0);
  // 0.85 when nothing died from a vital hit, 1.20 when everything did
  const vitalsMult = (kills, vitalKills) => 0.85 + 0.35 * (kills > 0 ? clamp(vitalKills / kills, 0, 1) : 0);

  function breakdown(s) {
    const shots = s.shots || 0, hits = s.hits || 0, kills = s.kills || 0;
    const aMult = accuracyMult(shots, hits);
    const vMult = vitalsMult(kills, s.vitalKills || 0);
    const base = (s.killPoints || 0) + (s.objectivePoints || 0);
    return {
      shots, hits, kills,
      accuracy: shots ? hits / shots : 0,
      vitalsRatio: kills ? (s.vitalKills || 0) / kills : 0,
      stealthKills: s.stealthKills || 0,
      killPoints: s.killPoints || 0,
      objectivePoints: s.objectivePoints || 0,
      accuracyMult: aMult,
      vitalsMult: vMult,
      base,
      total: Math.max(0, Math.round(base * aMult * vMult)),
    };
  }

  // per-hunt tally: keeps the numbers the end screen needs
  class Tally {
    constructor() { this.reset(); }
    reset() {
      this.shots = 0; this.hits = 0; this.kills = 0;
      this.vitalKills = 0; this.stealthKills = 0;
      this.killPoints = 0; this.objectivePoints = 0;
    }
    shotFired() { this.shots++; }
    shotHit() { this.hits++; }
    addKill(sp, evt) {
      const points = killPoints(sp, evt);
      this.kills++;
      this.killPoints += points;
      if (evt && evt.vital) this.vitalKills++;
      if (evt && evt.stealth) this.stealthKills++;
      return { points, label: killLabel(evt) };
    }
    addObjective(reward) { this.objectivePoints += Math.max(0, Math.round(reward || 0)); return this.objectivePoints; }
    // live score shown in the HUD (same maths as the end screen)
    get total() { return breakdown(this).total; }
    breakdown() { return breakdown(this); }
  }

  HZ.Score = { ZONE_MULT, ZONE_LABEL, distanceMult, stealthMult, bleedOutMult, killPoints, killLabel, accuracyMult, vitalsMult, breakdown, Tally, create: () => new Tally() };
})();
