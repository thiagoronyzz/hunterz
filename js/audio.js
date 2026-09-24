/* HUNTERZ — áudio procedural (Web Audio) com som posicional 3D, reverberação de floresta e ambiência. */
(function () {
  'use strict';
  const HZ = window.HZ;

  class Audio {
    constructor() { this.ctx = null; this.enabled = false; this.volume = 0.8; }
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain(); this.master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
      this.master.connect(comp); comp.connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      this.amb = ctx.createGain(); this.amb.gain.value = 0.9; this.amb.connect(this.master);
      // reverberação: resposta ao impulso gerada (floresta = difusa, longa, com ecos tardios)
      this.verb = ctx.createConvolver(); this.verb.buffer = this.makeIR(3.2);
      this.verbSend = ctx.createGain(); this.verbSend.gain.value = 0.55;
      this.verbSend.connect(this.verb); this.verb.connect(this.master);
      this.noise = this.makeNoise(3, false); this.pink = this.makeNoise(3, true);
      this.enabled = true;
      this.startAmbience();
    }
    makeIR(sec) {
      const ctx = this.ctx, n = (ctx.sampleRate * sec) | 0, b = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < n; i++) {
          const t = i / ctx.sampleRate;
          let v = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * 0.6;
          for (const e of [0.34, 0.71, 1.23]) { const dt = t - e - c * 0.013; if (dt > 0 && dt < 0.12) v += (Math.random() * 2 - 1) * 0.35 * (1 - dt / 0.12) * Math.exp(-e * 1.2); }
          d[i] = v;
        }
      }
      return b;
    }
    makeNoise(sec, pink) {
      const ctx = this.ctx, n = (ctx.sampleRate * sec) | 0, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (!pink) { d[i] = w; continue; }
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
      return b;
    }
    setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

    // destino: posicional (panner HRTF) ou direto
    out(pos, verb = 0.3) {
      const ctx = this.ctx, g = ctx.createGain();
      if (pos) {
        const p = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 3, maxDistance: 400, rolloffFactor: 1.2, positionX: pos.x, positionY: pos.y, positionZ: pos.z });
        g.connect(p); p.connect(this.sfx);
        // ar abafa agudos à distância
        if (this.listenerPos) { const d = Math.hypot(pos.x - this.listenerPos.x, pos.z - this.listenerPos.z); if (d > 30) { g.disconnect(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(700, 14000 - d * 55); g.connect(lp); lp.connect(p); } }
      } else g.connect(this.sfx);
      if (verb > 0) { const s = ctx.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.verbSend); }
      return g;
    }
    noiseBurst({ dur = 0.2, type = 'bandpass', f = 1000, f1, Q = 1, gain = 0.5, a = 0.003, pos, verb = 0.3, pink = false, t0 = 0, rate = 1 }) {
      if (!this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime + t0;
      const s = ctx.createBufferSource(); s.buffer = pink ? this.pink : this.noise; s.playbackRate.value = rate;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur); fl.Q.value = Q;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(fl); fl.connect(g); g.connect(this.out(pos, verb));
      s.start(t, Math.random() * 2, dur + 0.05);
    }
    tone({ type = 'sine', f = 440, f1, dur = 0.2, gain = 0.3, a = 0.005, pos, verb = 0.3, t0 = 0, vib = 0, vibF = 5, am = 0, amF = 30, lp = 0, curve }) {
      if (!this.enabled) return;
      const ctx = this.ctx, t = ctx.currentTime + t0;
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
      if (curve) o.frequency.setValueCurveAtTime(new Float32Array(curve), t, dur);
      else if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vibF; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.1); }
      if (am) { const l = ctx.createOscillator(), lg = ctx.createGain(), ag = ctx.createGain(); ag.gain.value = 1 - am; l.frequency.value = amF; lg.gain.value = am; l.connect(lg); lg.connect(ag.gain); l.start(t); l.stop(t + dur + 0.1); node.connect(ag); node = ag; }
      if (lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp; node.connect(f2); node = f2; }
      node.connect(g); g.connect(this.out(pos, verb));
      o.start(t); o.stop(t + dur + 0.05);
    }

    updateListener(cam) {
      if (!this.enabled) return;
      const L = this.ctx.listener, p = cam.position, t = this.ctx.currentTime;
      this.listenerPos = p;
      const f = HZ._fwd || (HZ._fwd = new THREE.Vector3());
      cam.getWorldDirection(f);
      if (L.positionX) {
        L.positionX.setTargetAtTime(p.x, t, 0.02); L.positionY.setTargetAtTime(p.y, t, 0.02); L.positionZ.setTargetAtTime(p.z, t, 0.02);
        L.forwardX.setTargetAtTime(f.x, t, 0.02); L.forwardY.setTargetAtTime(f.y, t, 0.02); L.forwardZ.setTargetAtTime(f.z, t, 0.02);
        L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }
    }

    // -------------------------------------------------------- arma
    gunshot() {
      if (!this.enabled) return;
      this.noiseBurst({ dur: 0.09, type: 'highpass', f: 1800, Q: 0.7, gain: 1.0, a: 0.001, verb: 0.2 });
      this.noiseBurst({ dur: 0.5, type: 'lowpass', f: 2400, f1: 160, Q: 0.8, gain: 1.2, a: 0.001, verb: 1.0 });
      this.tone({ type: 'sine', f: 110, f1: 38, dur: 0.45, gain: 0.9, a: 0.002, verb: 0.6 });
      // eco distante rolando pelo vale
      this.noiseBurst({ dur: 1.6, type: 'lowpass', f: 900, f1: 200, gain: 0.18, a: 0.2, t0: 0.55, verb: 1.2, pink: true });
    }
    boltCycle() {
      this.noiseBurst({ dur: 0.05, type: 'bandpass', f: 3200, Q: 3, gain: 0.35, t0: 0.26, verb: 0.05 });
      this.noiseBurst({ dur: 0.14, type: 'bandpass', f: 1800, f1: 2600, Q: 2, gain: 0.25, t0: 0.36, verb: 0.05 });
      this.noiseBurst({ dur: 0.12, type: 'bandpass', f: 2600, f1: 1600, Q: 2, gain: 0.25, t0: 0.52, verb: 0.05 });
      this.noiseBurst({ dur: 0.05, type: 'bandpass', f: 3600, Q: 3, gain: 0.4, t0: 0.68, verb: 0.05 });
    }
    casing(pos, t0) { for (let i = 0; i < 3; i++) this.tone({ type: 'triangle', f: 3200 + Math.random() * 900, dur: 0.06, gain: 0.05 / (i + 1), pos, t0: t0 + i * 0.09 + Math.random() * 0.03, verb: 0.05 }); }
    roundIn(t0 = 0) { this.noiseBurst({ dur: 0.06, type: 'bandpass', f: 2400, Q: 4, gain: 0.3, t0, verb: 0.05 }); this.tone({ type: 'square', f: 900, dur: 0.03, gain: 0.05, t0: t0 + 0.02, verb: 0 }); }
    dry() { this.noiseBurst({ dur: 0.04, type: 'bandpass', f: 3000, Q: 5, gain: 0.3, verb: 0 }); }
    aim(on) { this.noiseBurst({ dur: 0.12, type: 'bandpass', f: on ? 900 : 700, Q: 1, gain: 0.08, verb: 0 }); }

    // -------------------------------------------------------- jogador
    step(surface, loud = 1) {
      if (!this.enabled) return;
      const g = 0.12 * loud;
      if (surface === 'leaves') { for (let i = 0; i < 3; i++) this.noiseBurst({ dur: 0.05 + Math.random() * 0.04, type: 'bandpass', f: 2200 + Math.random() * 2000, Q: 1.5, gain: g * 0.8, t0: i * 0.025, verb: 0.05 }); }
      else if (surface === 'grass') this.noiseBurst({ dur: 0.14, type: 'highpass', f: 2500, Q: 0.7, gain: g * 0.6, verb: 0.03, pink: true });
      else if (surface === 'rock') { this.noiseBurst({ dur: 0.05, type: 'bandpass', f: 1500, Q: 2, gain: g, verb: 0.1 }); this.tone({ type: 'sine', f: 160, f1: 90, dur: 0.06, gain: g * 0.6, verb: 0 }); }
      else if (surface === 'wood') { this.tone({ type: 'sine', f: 230, f1: 120, dur: 0.08, gain: g, verb: 0.05 }); this.noiseBurst({ dur: 0.04, type: 'bandpass', f: 800, Q: 2, gain: g * 0.5 }); }
      else if (surface === 'water') this.noiseBurst({ dur: 0.22, type: 'bandpass', f: 1200, f1: 500, Q: 1, gain: g * 1.2, verb: 0.05 });
      else this.noiseBurst({ dur: 0.08, type: 'lowpass', f: 700, Q: 0.7, gain: g * 1.2, verb: 0.02, pink: true });
      if (Math.random() < 0.08) this.noiseBurst({ dur: 0.03, type: 'bandpass', f: 3500, Q: 6, gain: g * 0.9, t0: 0.03 }); // graveto estalando
    }
    land(v) { this.noiseBurst({ dur: 0.15, type: 'lowpass', f: 400, gain: Math.min(0.5, v * 0.05), verb: 0.05 }); }
    hurt() {
      this.tone({ type: 'sawtooth', f: 170, f1: 105, dur: 0.32, gain: 0.22, lp: 900, verb: 0.05 });
      this.noiseBurst({ dur: 0.25, type: 'bandpass', f: 700, Q: 1.2, gain: 0.12, verb: 0.02 });
      this.noiseBurst({ dur: 0.1, type: 'lowpass', f: 300, gain: 0.5, verb: 0 });
    }
    heartbeat(rate = 1) { this.tone({ type: 'sine', f: 55, f1: 40, dur: 0.12, gain: 0.35 * rate, verb: 0 }); this.tone({ type: 'sine', f: 50, f1: 38, dur: 0.12, gain: 0.25 * rate, t0: 0.22, verb: 0 }); }
    breath() { this.noiseBurst({ dur: 0.6, type: 'bandpass', f: 1100, Q: 0.8, gain: 0.05, a: 0.2, verb: 0, pink: true }); }
    bandage() { for (let i = 0; i < 4; i++) this.noiseBurst({ dur: 0.18, type: 'bandpass', f: 3000 + i * 300, Q: 0.8, gain: 0.1, t0: i * 0.3, verb: 0 }); }

    // -------------------------------------------------------- impactos
    impact(kind, pos) {
      if (kind === 'flesh') { this.tone({ type: 'sine', f: 120, f1: 60, dur: 0.12, gain: 0.5, pos, verb: 0.2 }); this.noiseBurst({ dur: 0.12, type: 'lowpass', f: 900, gain: 0.4, pos, verb: 0.2 }); }
      else if (kind === 'tree' || kind === 'wood') { this.tone({ type: 'sine', f: 240, f1: 140, dur: 0.1, gain: 0.4, pos }); this.noiseBurst({ dur: 0.1, type: 'bandpass', f: 1200, Q: 1.5, gain: 0.35, pos }); }
      else if (kind === 'rock') { this.tone({ type: 'sine', f: 2600, f1: 900, dur: 0.35, gain: 0.12, pos, verb: 0.5 }); this.noiseBurst({ dur: 0.05, type: 'highpass', f: 3000, gain: 0.5, pos }); }
      else this.noiseBurst({ dur: 0.12, type: 'lowpass', f: 600, gain: 0.35, pos, verb: 0.2, pink: true });
    }

    // -------------------------------------------------------- animais
    growl(pos, big) { this.tone({ type: 'sawtooth', f: big ? 62 : 95, f1: big ? 55 : 80, dur: big ? 1.6 : 1.0, gain: 0.5, a: 0.15, am: 0.6, amF: big ? 18 : 28, lp: big ? 500 : 800, pos, verb: 0.3 }); this.noiseBurst({ dur: big ? 1.4 : 0.9, type: 'bandpass', f: big ? 350 : 600, Q: 1, gain: 0.25, a: 0.2, pos, verb: 0.3 }); }
    roar(pos) {
      this.tone({ type: 'sawtooth', f: 120, curve: [110, 160, 150, 120, 80], dur: 2.0, gain: 0.8, a: 0.12, vib: 8, vibF: 7, lp: 1000, pos, verb: 0.8 });
      this.tone({ type: 'sawtooth', f: 60, curve: [55, 80, 75, 60, 40], dur: 2.0, gain: 0.6, a: 0.12, am: 0.4, amF: 22, lp: 500, pos, verb: 0.6 });
      this.noiseBurst({ dur: 1.8, type: 'bandpass', f: 500, Q: 0.8, gain: 0.45, a: 0.15, pos, verb: 0.8 });
    }
    howl(pos) { this.tone({ type: 'sine', f: 380, curve: [380, 560, 620, 600, 560, 420], dur: 3.2, gain: 0.35, a: 0.4, vib: 9, vibF: 5, pos, verb: 1.3 }); this.tone({ type: 'triangle', f: 760, curve: [760, 1120, 1240, 1200, 1120, 840], dur: 3.2, gain: 0.06, a: 0.4, pos, verb: 1.3 }); }
    snarl(pos, big) { this.noiseBurst({ dur: 0.35, type: 'bandpass', f: big ? 400 : 900, Q: 1.2, gain: 0.6, pos, verb: 0.2 }); this.tone({ type: 'sawtooth', f: big ? 140 : 260, f1: big ? 90 : 180, dur: 0.3, gain: 0.35, am: 0.5, amF: 40, lp: 1600, pos, verb: 0.2 }); }
    yelp(pos) { this.tone({ type: 'sine', f: 1100, f1: 520, dur: 0.25, gain: 0.3, pos, verb: 0.4 }); this.tone({ type: 'sine', f: 1000, f1: 600, dur: 0.2, gain: 0.2, pos, t0: 0.3, verb: 0.4 }); }
    squeal(pos) { this.tone({ type: 'sawtooth', f: 900, curve: [800, 1400, 1300, 700], dur: 0.6, gain: 0.35, lp: 3000, pos, verb: 0.4 }); }
    grunt(pos) { this.tone({ type: 'sawtooth', f: 95, f1: 70, dur: 0.28, gain: 0.35, am: 0.7, amF: 35, lp: 700, pos, verb: 0.2 }); }
    bark(pos) { this.noiseBurst({ dur: 0.12, type: 'bandpass', f: 900, Q: 2, gain: 0.45, pos, verb: 0.6 }); this.tone({ type: 'sawtooth', f: 420, f1: 300, dur: 0.12, gain: 0.15, lp: 1500, pos, verb: 0.6 }); }
    thud(pos, big) { this.tone({ type: 'sine', f: big ? 70 : 110, f1: 40, dur: 0.3, gain: big ? 0.7 : 0.4, pos, verb: 0.2 }); this.noiseBurst({ dur: 0.25, type: 'lowpass', f: 500, gain: 0.35, pos, verb: 0.2, pink: true }); }
    thunder() { this.noiseBurst({ dur: 4, type: 'lowpass', f: 400, f1: 60, gain: 0.9, a: 0.05, verb: 1.0, pink: true, t0: 0.6 + Math.random() * 1.5 }); }

    // -------------------------------------------------------- ambiência
    loop(buf, filterType, f, Q, gain, dest) {
      const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = filterType; fl.frequency.value = f; fl.Q.value = Q;
      const g = ctx.createGain(); g.gain.value = gain;
      s.connect(fl); fl.connect(g); g.connect(dest || this.amb); s.start();
      return { s, fl, g };
    }
    startAmbience() {
      this.wind = this.loop(this.pink, 'lowpass', 500, 0.5, 0.25);
      this.leaves = this.loop(this.noise, 'bandpass', 3800, 0.6, 0.02);
      this.rainL = this.loop(this.pink, 'highpass', 900, 0.4, 0);
      this.nextBird = 1; this.nextPecker = 12; this.nextCrow = 20; this.nextInsect = 3;
    }
    updateAmbience(dt, windAmt, rain, danger) {
      if (!this.enabled) return;
      const t = this.ctx.currentTime;
      const w = 0.16 + windAmt * 0.3;
      this.wind.g.gain.setTargetAtTime(w + (rain ? 0.1 : 0), t, 0.5);
      this.wind.fl.frequency.setTargetAtTime(350 + windAmt * 500, t, 0.5);
      this.leaves.g.gain.setTargetAtTime(0.012 + windAmt * 0.05, t, 0.5);
      this.rainL.g.gain.setTargetAtTime(rain ? 0.35 : 0, t, 1.5);
      if (rain) return;
      const L = this.listenerPos || { x: 0, y: 0, z: 0 };
      const around = (d) => { const a = Math.random() * 6.28; return { x: L.x + Math.cos(a) * d, y: L.y + 8 + Math.random() * 10, z: L.z + Math.sin(a) * d }; };
      this.nextBird -= dt; this.nextPecker -= dt; this.nextCrow -= dt;
      if (this.nextBird <= 0 && !danger) {
        this.nextBird = 1.5 + Math.random() * 4;
        const p = around(15 + Math.random() * 40), kind = Math.random();
        if (kind < 0.4) { const b = 2600 + Math.random() * 1500; for (let i = 0; i < 3 + (Math.random() * 4 | 0); i++) this.tone({ type: 'sine', f: b, f1: b * (0.7 + Math.random() * 0.6), dur: 0.08 + Math.random() * 0.06, gain: 0.05, pos: p, t0: i * 0.13, verb: 0.4 }); }
        else if (kind < 0.7) { this.tone({ type: 'sine', f: 3200, curve: [3000, 4200, 3600, 4400, 3100], dur: 0.5, gain: 0.04, pos: p, verb: 0.5 }); }
        else { for (let i = 0; i < 2; i++) this.tone({ type: 'sine', f: 1600, f1: 1250, dur: 0.28, gain: 0.05, pos: p, t0: i * 0.45, verb: 0.6 }); } // cuco / pomba
      }
      if (this.nextPecker <= 0) { this.nextPecker = 15 + Math.random() * 25; const p = around(40 + Math.random() * 40); for (let i = 0; i < 14; i++) this.noiseBurst({ dur: 0.02, type: 'bandpass', f: 1300, Q: 4, gain: 0.12, pos: p, t0: i * 0.055, verb: 0.6 }); }
      if (this.nextCrow <= 0) { this.nextCrow = 25 + Math.random() * 30; const p = around(60); for (let i = 0; i < 3; i++) this.tone({ type: 'sawtooth', f: 620, f1: 480, dur: 0.22, gain: 0.07, lp: 1800, pos: p, t0: i * 0.35, verb: 0.8 }); }
    }
  }
  HZ.Audio = Audio;
})();
