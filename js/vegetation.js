/* HUNTERZ — geometria procedural de vegetação: pinheiros, abetos, carvalhos, bétulas,
   árvores mortas, arbustos, mudas, grama, samambaias, flores, cogumelos, gravetos, juncos. */
(function () {
  'use strict';
  const HZ = window.HZ;
  const THREE = window.THREE;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0);

  // ------------------------------------------------------------- cartões
  class Cards {
    constructor() { this.pos = []; this.nor = []; this.uv = []; this.wind = []; this.col = []; this.idx = []; }
    // anchor: 'bottom' (base no centro inferior), 'center', 'left' (borda esquerda no meio)
    add(c, right, up, w, h, o = {}) {
      const base = this.pos.length / 3;
      const face = V().crossVectors(right, up).normalize();
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
      const uv = o.uv || [0, 0, 1, 1];
      for (const [sx, sy] of corners) {
        let ox, oy;
        if (o.anchor === 'left') { ox = sx * w; oy = (sy - 0.5) * h; }
        else if (o.anchor === 'center') { ox = (sx - 0.5) * w; oy = (sy - 0.5) * h; }
        else { ox = (sx - 0.5) * w; oy = sy * h; }
        const p = V().copy(c).addScaledVector(right, ox).addScaledVector(up, oy);
        if (o.bend) p.addScaledVector(face, o.bend * (o.anchor === 'left' ? sx * sx : sy * sy) * h);
        this.pos.push(p.x, p.y, p.z);
        let n = face;
        if (o.normal) n = o.normal(p, face);
        this.nor.push(n.x, n.y, n.z);
        this.uv.push(uv[0] + (uv[2] - uv[0]) * sx, uv[1] + (uv[3] - uv[1]) * sy);
        this.wind.push(o.wind ? o.wind(p, sx, sy) : 0);
        const cc = typeof o.color === 'function' ? o.color(p, sx, sy) : o.color || [1, 1, 1];
        this.col.push(cc[0], cc[1], cc[2]);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    // faixa (strip) ao longo de pontos, largura w, com "lado" (vetor)
    strip(points, sideVecs, widths, o = {}) {
      const base = this.pos.length / 3, n = points.length;
      for (let i = 0; i < n; i++) {
        const s = i / (n - 1);
        for (const k of [-0.5, 0.5]) {
          const p = V().copy(points[i]).addScaledVector(sideVecs[i], widths[i] * k);
          this.pos.push(p.x, p.y, p.z);
          const nn = o.normal ? o.normal(p, s) : UP;
          this.nor.push(nn.x, nn.y, nn.z);
          this.uv.push(k + 0.5, s);
          this.wind.push(o.wind ? o.wind(p, s) : 0);
          const cc = typeof o.color === 'function' ? o.color(p, s) : o.color || [1, 1, 1];
          this.col.push(cc[0], cc[1], cc[2]);
        }
      }
      for (let i = 0; i < n - 1; i++) { const a = base + i * 2; this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('wind', new THREE.Float32BufferAttribute(this.wind, 1));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      g.setIndex(this.idx);
      return g;
    }
  }
  HZ.Cards = Cards;

  const perp = d => { const a = Math.abs(d.y) < 0.9 ? UP : V(1, 0, 0); return V().crossVectors(d, a).normalize(); };
  const woodAttrs = g => HZ.ensureAttrs(g, [['wind', 1, 0], ['color', 3, [1, 1, 1]]]);

  // --------------------------------------------------------------- tronco
  function trunk(rand, H, r0, o = {}) {
    const segs = o.segs || 12, radial = o.radial || 9;
    const pts = [], secs = [];
    let x = 0, z = 0;
    const lx = o.lean ? o.lean[0] : 0, lz = o.lean ? o.lean[1] : 0;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, y = H * Math.pow(t, 1.15);
      if (i > 0) { x += (rand() - 0.5) * (o.wiggle || 0.12); z += (rand() - 0.5) * (o.wiggle || 0.12); }
      pts.push(V(x + lx * y, y - 0.35, z + lz * y));
      let r = r0 * (1 - (1 - (o.top || 0.1)) * Math.pow(t, o.taperPow || 0.9));
      r *= 1 + (o.flare || 0.4) * Math.exp(-y * 1.8);
      secs.push(r);
    }
    const circ = Math.PI * 2 * r0;
    const g = HZ.loft(pts, secs, {
      radial, capEnd: true, vScale: 1 / (circ * (o.aspect || 2)),
      radiusFn: (ph, s) => 1 + (o.ridges || 0.14) * Math.exp(-s * H * 1.4) * Math.sin(ph * 5 + 1.3) + 0.03 * Math.sin(ph * 3 + s * 20),
      wind: p => Math.pow(Math.max(0, p.y) / H, 2) * (o.sway || 0.03),
    });
    const at = y => { // ponto do eixo numa altura
      const t = Math.pow(HZ.clamp(y / H, 0, 1), 1 / 1.15) * segs; const i = Math.min(segs - 1, Math.floor(t)), f = t - i;
      return V().lerpVectors(pts[i], pts[i + 1], f).setY(y - 0.35);
    };
    const radAt = y => { const t = HZ.clamp(y / H, 0, 1); return r0 * (1 - (1 - (o.top || 0.1)) * Math.pow(t, o.taperPow || 0.9)); };
    return { geo: woodAttrs(g), at, radAt, pts };
  }

  function branch(start, dir, L, r0, r1, o = {}) {
    const n = o.n || 4, pts = [], secs = [];
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const p = V().copy(start).addScaledVector(dir, L * s);
      p.y += L * ((o.up || 0) * s * s - (o.droop || 0) * s * s + (o.sag || 0) * s * (s - 1) * 0 + (o.tipUp || 0) * s * s * s);
      if (o.jitter) { p.x += (o.rand() - 0.5) * o.jitter * s; p.z += (o.rand() - 0.5) * o.jitter * s; }
      pts.push(p); secs.push(r0 + (r1 - r0) * s);
    }
    const g = HZ.loft(pts, secs, { radial: o.radial || 5, ref: perp(dir), vScale: 1 / (Math.PI * 2 * Math.max(r0, 0.03) * 2), capEnd: true, wind: p => o.windFn ? o.windFn(p) : 0 });
    return { geo: woodAttrs(g), pts, at: s => { const t = s * n, i = Math.min(n - 1, Math.floor(t)); return V().lerpVectors(pts[i], pts[i + 1], t - i); } };
  }

  const sphereNormal = (center, sc, faceMix = 0.25) => (p, face) => {
    const n = V((p.x - center.x) / sc.x, (p.y - center.y) / sc.y, (p.z - center.z) / sc.z).normalize();
    return n.multiplyScalar(1 - faceMix).addScaledVector(face, faceMix * (face.dot(n) >= 0 ? 1 : -1)).normalize();
  };

  // ================================================================ PINHEIRO
  function pine(rand, q) {
    const H = 15 + rand() * 8, r0 = 0.26 + rand() * 0.12;
    const T = trunk(rand, H, r0, { flare: 0.5, radial: q.radial, top: 0.08, wiggle: 0.16, sway: 0.05, lean: [(rand() - 0.5) * 0.03, (rand() - 0.5) * 0.03] });
    const wood = [T.geo], cards = new Cards();
    const cs = H * (0.56 + rand() * 0.1);
    const crownC = T.at(H * 0.8), crownS = V(3.2, (H - cs) * 0.55, 3.2);
    const nrm = sphereNormal(crownC, crownS, 0.3);
    const nB = 15 + ((rand() * 8) | 0);
    const leafColor = (p) => { const k = HZ.clamp((p.y - cs) / (H - cs), 0, 1); const d = Math.hypot(p.x - crownC.x, p.z - crownC.z) / 3.2; const s = 0.55 + 0.3 * k + 0.25 * Math.min(1, d); return [s, s, s * 0.95]; };
    const leafWind = p => 0.1 + 0.25 * Math.pow(Math.max(0, p.y) / H, 2) + 0.06 * Math.hypot(p.x - crownC.x, p.z - crownC.z);
    const cluster = (c, dir, size) => {
      const up = V().copy(dir).multiplyScalar(0.75).addScaledVector(UP, 0.55).normalize();
      const a = perp(up), b = V().crossVectors(up, a);
      for (let k = 0; k < 3; k++) {
        const ang = (k * Math.PI) / 3 + rand() * 0.5;
        const right = V().copy(a).multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
        cards.add(V().copy(c).addScaledVector(up, -size * 0.4), right, up, size, size, { normal: nrm, wind: leafWind, color: leafColor, bend: 0.08 });
      }
    };
    for (let i = 0; i < nB; i++) {
      const t = i / nB, y = cs + (H * 0.96 - cs) * Math.pow(t, 0.85);
      const az = i * 2.39996 + rand() * 0.6;
      const L = (1.1 + 2.5 * Math.sin(Math.PI * (0.3 + 0.7 * (1 - t)))) * (0.7 + rand() * 0.5) * (H / 19);
      const dir = V(Math.cos(az), 0.2 + rand() * 0.5, Math.sin(az)).normalize();
      const st = T.at(y);
      const br = branch(st, dir, L, T.radAt(y) * 0.45 + 0.02, 0.02, { up: 0.25, radial: q.branchRadial, windFn: p => 0.05 * p.distanceTo(st) });
      wood.push(br.geo);
      const size = (1.35 + rand() * 0.9) * (H / 19);
      if (L > 1.6) cluster(br.at(0.55), dir, size * 0.85);
      cluster(br.at(0.85), dir, size);
      cluster(br.at(1.02), dir, size * 0.9);
    }
    cluster(T.at(H * 0.99), UP, 1.9 * (H / 19));
    // galhos mortos no tronco
    const nd = 5 + ((rand() * 6) | 0);
    for (let i = 0; i < nd; i++) {
      const y = 1.5 + rand() * (cs - 2), az = rand() * 7;
      const dir = V(Math.cos(az), -0.15 - rand() * 0.2, Math.sin(az)).normalize();
      wood.push(branch(T.at(y), dir, 0.3 + rand() * 0.7, 0.035, 0.012, { radial: 4, n: 2 }).geo);
    }
    return { wood: HZ.merge(wood), leaves: cards.geometry(), height: H, trunkR: r0, crown: 3.2 * (H / 19) + 1, kind: 'pine' };
  }

  // ================================================================ ABETO
  function spruce(rand, q, Hover) {
    const H = Hover || 11 + rand() * 9, r0 = Hover ? 0.05 + Hover * 0.015 : 0.22 + rand() * 0.12;
    const T = trunk(rand, H, r0, { flare: Hover ? 0.1 : 0.45, radial: Hover ? 5 : q.radial, top: 0.05, wiggle: 0.05, taperPow: 1, sway: 0.04 });
    const wood = [T.geo], cards = new Cards();
    const Rmax = H * (0.19 + rand() * 0.04);
    const small = !!Hover;
    let y = small ? 0.25 : 0.9 + rand() * 0.8;
    const gap = small ? 0.22 : 0.36;
    let whorl = 0;
    const axisN = (p, face) => {
      const a = T.at(p.y);
      const n = V(p.x - a.x, 0, p.z - a.z); const l = n.length() || 1; n.multiplyScalar(1 / l);
      n.y = 0.55; n.normalize();
      return n.multiplyScalar(0.8).addScaledVector(face, 0.2 * (face.y >= 0 ? 1 : -1)).normalize();
    };
    while (y < H - 0.35) {
      const t = y / H;
      const nb = 4 + (rand() < 0.5 ? 1 : 0), off = whorl * 0.7 + rand();
      for (let j = 0; j < nb; j++) {
        const az = (j / nb) * Math.PI * 2 + off + (rand() - 0.5) * 0.4;
        const L = (0.3 + Rmax * Math.pow(1 - t, 0.92)) * (0.82 + rand() * 0.35);
        const dir = V(Math.cos(az), 0, Math.sin(az));
        const st = T.at(y);
        const droop = t < 0.45 ? 0.42 : 0.3;
        const br = branch(st, dir, L, Math.max(0.012, T.radAt(y) * 0.3), 0.01, { up: 0.12, droop, tipUp: 0.22, radial: small ? 3 : 4, n: 3, windFn: p => 0.07 * p.distanceTo(st) });
        if (L > 0.9 || small) wood.push(br.geo);
        const a0 = br.at(0.08), a1 = br.at(1.02);
        const chord = V().subVectors(a1, a0); const len = chord.length(); chord.normalize();
        const side = V().crossVectors(UP, chord).normalize();
        const inner = HZ.clamp(0.5 + 0.5 * t, 0, 1);
        const col = p => { const d = HZ.clamp(Math.hypot(p.x - st.x, p.z - st.z) / Math.max(L, 0.1), 0, 1); const s = (0.42 + 0.58 * d) * (0.7 + 0.35 * inner); return [s * 0.95, s, s * 0.95]; };
        const wnd = p => 0.04 + 0.16 * HZ.clamp(Math.hypot(p.x - st.x, p.z - st.z) / 3, 0, 1) + 0.1 * t;
        const w = len * 0.5 + 0.3;
        cards.add(a0, chord, side, len, w, { anchor: 'left', normal: axisN, color: col, wind: wnd, bend: -0.04 });
        const tilt = V().copy(side).applyAxisAngle(chord, (rand() < 0.5 ? 1 : -1) * (0.7 + rand() * 0.4));
        cards.add(V().copy(a0).addScaledVector(UP, 0.05), chord, tilt, len * 0.9, w * 0.85, { anchor: 'left', normal: axisN, color: col, wind: wnd });
      }
      y += gap + rand() * gap * 0.5; whorl++;
    }
    const top = T.at(H - 0.2);
    for (let k = 0; k < 2; k++) {
      const a = (k * Math.PI) / 2 + rand();
      cards.add(V().copy(top).addScaledVector(UP, -0.4), V(Math.cos(a), 0, Math.sin(a)), UP, small ? 0.6 : 1.1, small ? 0.8 : 1.5, { normal: axisN, wind: () => 0.25, color: [0.95, 1, 0.95], uv: [0, 0, 1, 1] });
    }
    return { wood: HZ.merge(wood), leaves: cards.geometry(), height: H, trunkR: r0, crown: Rmax + 0.5, kind: 'spruce' };
  }

  // ======================================================= FOLHOSA (carvalho/faia)
  function broadleaf(rand, q, birch) {
    const H = birch ? 12 + rand() * 5 : 11 + rand() * 6;
    const r0 = birch ? 0.14 + rand() * 0.07 : 0.32 + rand() * 0.16;
    const forkY = H * (birch ? 0.55 + rand() * 0.1 : 0.32 + rand() * 0.12);
    const lean = birch ? [(rand() - 0.5) * 0.08, (rand() - 0.5) * 0.08] : [0, 0];
    const T = trunk(rand, birch ? H * 0.95 : forkY + 1, r0, { flare: birch ? 0.25 : 0.55, radial: q.radial, top: birch ? 0.12 : 0.62, wiggle: birch ? 0.1 : 0.2, lean, taperPow: 1, sway: 0.03, aspect: birch ? 3 : 2 });
    const wood = [T.geo], cards = new Cards();
    const R = (birch ? 2.4 + rand() * 0.9 : 3.8 + rand() * 1.6) * (H / 14), Ry = H * (birch ? 0.3 : 0.3);
    const crownC = V(lean[0] * H * 0.7, H * (birch ? 0.68 : 0.64), lean[1] * H * 0.7);
    const anchors = [];
    const nL = birch ? 5 + ((rand() * 3) | 0) : 3 + ((rand() * 2) | 0);
    const forkP = T.at(birch ? forkY * 0.7 : forkY);
    for (let j = 0; j < nL; j++) {
      const az = (j / nL) * Math.PI * 2 + rand() * 0.6;
      const yStart = birch ? forkY * 0.55 + (j / nL) * H * 0.35 : forkY;
      const st = birch ? T.at(yStart) : forkP;
      const dir = V(Math.cos(az) * (birch ? 0.8 : 0.6), birch ? 0.75 : 1, Math.sin(az) * (birch ? 0.8 : 0.6)).normalize();
      const L = birch ? R * (0.9 + rand() * 0.4) : H * (0.42 + rand() * 0.14);
      const limb = branch(st, dir, L, birch ? r0 * 0.35 : r0 * 0.62, birch ? 0.015 : 0.05, { up: birch ? -0.25 : 0.15, droop: birch ? 0.25 : 0, radial: q.branchRadial + 1, n: 5, jitter: 0.8, rand, windFn: p => 0.02 * p.distanceTo(st) });
      wood.push(limb.geo);
      anchors.push(limb.at(1));
      const nS = birch ? 2 : 4;
      for (let k = 0; k < nS; k++) {
        const s = 0.35 + (k / nS) * 0.55 + rand() * 0.1;
        const p = limb.at(s);
        const out = V(p.x - crownC.x, 0, p.z - crownC.z).normalize();
        const sd = V().copy(out).multiplyScalar(0.9).addScaledVector(UP, 0.35 + rand() * 0.4).add(V((rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6)).normalize();
        const sb = branch(p, sd, R * (0.45 + rand() * 0.35), birch ? 0.03 : 0.07, 0.012, { up: birch ? -0.3 : 0.1, droop: birch ? 0.35 : 0.05, radial: q.branchRadial, n: 3, windFn: pp => 0.03 * pp.distanceTo(st) });
        wood.push(sb.geo);
        anchors.push(sb.at(0.7), sb.at(1));
      }
    }
    const nrm = sphereNormal(crownC, V(R, Ry, R), 0.22);
    const col = p => {
      const d = V((p.x - crownC.x) / R, (p.y - crownC.y) / Ry, (p.z - crownC.z) / R);
      const r = Math.min(1.2, d.length()), up = d.y / (r || 1);
      const s = 0.45 + 0.35 * r + 0.18 * up;
      return birch ? [s * 1.02, s, s * 0.9] : [s, s, s * 0.95];
    };
    const wnd = p => 0.12 + 0.12 * HZ.clamp(V((p.x - crownC.x) / R, 0, (p.z - crownC.z) / R).length(), 0, 1.3) + 0.1 * (p.y / H);
    const nC = birch ? q.leafCards * 0.8 : q.leafCards;
    for (let i = 0; i < nC; i++) {
      let c;
      if (i < anchors.length * 1.5 && anchors.length) {
        c = V().copy(anchors[i % anchors.length]).add(V((rand() - 0.5) * 1.2, (rand() - 0.5) * 0.9, (rand() - 0.5) * 1.2));
      } else {
        const u = rand() * Math.PI * 2, v = Math.acos(1 - rand() * 1.6), rr = 0.55 + rand() * 0.45;
        c = V(Math.sin(v) * Math.cos(u) * R * rr, Math.cos(v) * Ry * rr, Math.sin(v) * Math.sin(u) * R * rr).add(crownC);
      }
      const size = (birch ? 1.5 + rand() * 0.8 : 2.1 + rand() * 1.0) * (H / 14);
      const a = rand() * Math.PI, e = (rand() - 0.5) * 1.2;
      const right = V(Math.cos(a), 0, Math.sin(a));
      const up = V(-Math.sin(a) * Math.sin(e), Math.cos(e), Math.cos(a) * Math.sin(e)).normalize();
      cards.add(c, right, up, size, size, { anchor: 'center', normal: nrm, color: col, wind: wnd });
      const right2 = V().crossVectors(up, right).normalize();
      cards.add(c, right2, up, size * 0.9, size * 0.9, { anchor: 'center', normal: nrm, color: col, wind: wnd });
    }
    return { wood: HZ.merge(wood), leaves: cards.geometry(), height: H, trunkR: r0, crown: R + 1, kind: birch ? 'birch' : 'oak' };
  }

  // ================================================================ ÁRVORE MORTA
  function snag(rand, q) {
    const H = 7 + rand() * 7, r0 = 0.25 + rand() * 0.12;
    const T = trunk(rand, H, r0, { flare: 0.5, radial: q.radial, top: 0.55, wiggle: 0.2, sway: 0.01 });
    const wood = [T.geo];
    const n = 4 + ((rand() * 5) | 0);
    for (let i = 0; i < n; i++) {
      const y = H * (0.35 + rand() * 0.6), az = rand() * 7;
      const dir = V(Math.cos(az), 0.1 + rand() * 0.6, Math.sin(az)).normalize();
      const st = T.at(y);
      const b = branch(st, dir, 0.8 + rand() * 2.2, 0.06, 0.015, { radial: 4, n: 3, jitter: 0.4, rand });
      wood.push(b.geo);
      if (rand() < 0.6) wood.push(branch(b.at(0.6), V(dir.x + (rand() - 0.5), dir.y + 0.4, dir.z + (rand() - 0.5)).normalize(), 0.6 + rand(), 0.025, 0.008, { radial: 3, n: 2 }).geo);
    }
    return { wood: HZ.merge(wood), leaves: null, height: H, trunkR: r0, crown: 2, kind: 'snag' };
  }

  // ================================================================ ARBUSTO
  function bush(rand) {
    const cards = new Cards(), wood = [];
    const R = 0.8 + rand() * 0.6, Hh = 0.7 + rand() * 0.6;
    const c0 = V(0, Hh * 0.55, 0);
    for (let i = 0; i < 4; i++) { const a = rand() * 7; wood.push(branch(V(0, -0.1, 0), V(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize(), Hh * 1.1, 0.03, 0.008, { radial: 3, n: 2 }).geo); }
    const nrm = sphereNormal(c0, V(R, Hh * 0.6, R), 0.2);
    const n = 14 + ((rand() * 6) | 0);
    for (let i = 0; i < n; i++) {
      const u = rand() * 7, v = Math.acos(1 - rand() * 1.5), rr = 0.35 + rand() * 0.6;
      const c = V(Math.sin(v) * Math.cos(u) * R * rr, Math.cos(v) * Hh * 0.6 * rr, Math.sin(v) * Math.sin(u) * R * rr).add(c0);
      const a = rand() * Math.PI, size = 0.9 + rand() * 0.6;
      const right = V(Math.cos(a), (rand() - 0.5) * 0.6, Math.sin(a)).normalize();
      const up = V().crossVectors(V(-Math.sin(a), 0, Math.cos(a)), right).normalize();
      if (up.y < 0) up.negate();
      cards.add(c, right, up, size, size, { anchor: 'center', normal: nrm, wind: p => 0.05 + 0.08 * Math.max(0, p.y), color: p => { const s = 0.5 + 0.5 * HZ.clamp(p.y / (Hh * 1.1), 0, 1); return [s, s, s]; } });
    }
    return { wood: HZ.merge(wood), leaves: cards.geometry(), height: Hh * 1.2, crown: R };
  }

  // ================================================================ PEQUENOS
  function grassClump(rand, w = 0.75, h = 0.55) {
    const cards = new Cards();
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3 + rand() * 0.3;
      const right = V(Math.cos(a), 0, Math.sin(a));
      const face = V(-Math.sin(a), 0, Math.cos(a));
      const up = V().copy(UP).addScaledVector(face, (rand() - 0.5) * 0.35).normalize();
      cards.add(V((rand() - 0.5) * 0.1, -0.02, (rand() - 0.5) * 0.1), right, up, w * (0.8 + rand() * 0.4), h * (0.8 + rand() * 0.4), {
        normal: (p, f) => V().copy(UP).multiplyScalar(0.8).addScaledVector(f, 0.2).normalize(),
        wind: (p, sx, sy) => sy * sy * 0.14,
        color: (p, sx, sy) => { const s = 0.42 + 0.58 * sy; return [s, s, s]; },
        bend: 0.12,
      });
    }
    return cards.geometry();
  }

  function fern(rand) {
    const cards = new Cards();
    const n = 7 + ((rand() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + rand() * 0.4, L = 0.7 + rand() * 0.5;
      const dir = V(Math.cos(az), 0, Math.sin(az)), side = V(-Math.sin(az), 0, Math.cos(az));
      const lift = 0.9 + rand() * 0.4;
      const pts = [], sides = [], ws = [];
      for (let k = 0; k <= 6; k++) {
        const s = k / 6;
        pts.push(V().copy(dir).multiplyScalar(L * s * 0.95).setY(L * (lift * s - 0.95 * s * s)));
        const sd = V().copy(side).applyAxisAngle(dir, (rand() - 0.5) * 0.3);
        sides.push(sd); ws.push(L * 0.42);
      }
      cards.strip(pts, sides, ws, {
        normal: (p, s) => V(dir.x * 0.2, 1, dir.z * 0.2).normalize(),
        wind: (p, s) => s * s * 0.1,
        color: (p, s) => { const c = 0.5 + 0.5 * s; return [c, c, c]; },
      });
    }
    return cards.geometry();
  }

  function flower(rand) {
    const cards = new Cards();
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI / 2 + rand();
      cards.add(V(0, -0.02, 0), V(Math.cos(a), 0, Math.sin(a)), UP, 0.34, 0.34, { normal: () => UP, wind: (p, sx, sy) => sy * 0.1, color: [1, 1, 1] });
    }
    return cards.geometry();
  }

  function mushroom(capColor, stemColor, rand) {
    const parts = [];
    const cap = new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.scale(1, 0.55, 1); cap.translate(0, 0.085, 0);
    const stem = new THREE.CylinderGeometry(0.018, 0.024, 0.09, 7); stem.translate(0, 0.045, 0);
    const colorize = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
    for (let i = 0; i < 3; i++) {
      const s = 0.6 + rand() * 0.8;
      const m = new THREE.Matrix4().compose(V((rand() - 0.5) * 0.25, 0, (rand() - 0.5) * 0.25), new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3)), V(s, s, s));
      parts.push(colorize(cap.clone().applyMatrix4(m), capColor), colorize(stem.clone().applyMatrix4(m), stemColor));
    }
    return HZ.ensureAttrs(HZ.merge(parts), [['wind', 1, 0]]);
  }

  function twig(rand) {
    const parts = [];
    const L = 0.6 + rand() * 1.4, a = rand() * 7;
    const d = V(Math.cos(a), 0, Math.sin(a));
    const b = branch(V(0, 0.02, 0), d, L, 0.025, 0.008, { radial: 4, n: 3, jitter: 0.1, rand });
    parts.push(b.geo);
    for (let i = 0; i < 2; i++) { const p = b.at(0.3 + rand() * 0.5); parts.push(branch(p, V(d.x + (rand() - 0.5) * 1.5, 0.05, d.z + (rand() - 0.5) * 1.5).normalize(), 0.2 + rand() * 0.3, 0.01, 0.004, { radial: 3, n: 1 }).geo); }
    const g = HZ.merge(parts);
    const n = g.attributes.position.count, c = g.attributes.color.array; for (let i = 0; i < n; i++) { c[i * 3] = 0.34; c[i * 3 + 1] = 0.26; c[i * 3 + 2] = 0.19; }
    return g;
  }

  function reeds(rand) {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const h = 1 + rand() * 0.9, x = (rand() - 0.5) * 0.5, z = (rand() - 0.5) * 0.5;
      const b = branch(V(x, -0.05, z), V((rand() - 0.5) * 0.25, 1, (rand() - 0.5) * 0.25).normalize(), h, 0.014, 0.004, { radial: 3, n: 3, windFn: p => Math.max(0, p.y) * 0.1 });
      const g = b.geo, n = g.attributes.position.count, c = g.attributes.color.array, pp = g.attributes.position.array;
      for (let k = 0; k < n; k++) { const t = HZ.clamp(pp[k * 3 + 1] / h, 0, 1); c[k * 3] = 0.3 + t * 0.35; c[k * 3 + 1] = 0.36 + t * 0.3; c[k * 3 + 2] = 0.16 + t * 0.12; }
      parts.push(g);
    }
    return HZ.merge(parts);
  }

  function stone(rand) {
    const g = new THREE.IcosahedronGeometry(0.2, 1);
    const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
    const seed = (rand() * 1000) | 0;
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + HZ.perlin(x * 6 + seed, z * 6 + y * 3, 7) * 0.3;
      p.setXYZ(i, x * k, y * k * 0.6, z * k);
      const s = 0.38 + rand() * 0.06 + (y > 0.05 ? 0.06 : 0);
      col[i * 3] = s; col[i * 3 + 1] = s * 0.98; col[i * 3 + 2] = s * 0.93;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return HZ.ensureAttrs(g, [['wind', 1, 0]]);
  }

  HZ.veg = { Cards, trunk, branch, pine, spruce, broadleaf, snag, bush, grassClump, fern, flower, mushroom, twig, reeds, stone };
})();
