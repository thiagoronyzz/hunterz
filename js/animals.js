/* HUNTERZ — fauna: corpos anatômicos procedurais, locomoção com marchas (passo/trote/galope/salto),
   IA de presas (percepção, alerta, fuga) e predadores (perseguição, cerco, ataque),
   ferimentos com sangramento e morte realista (o animal tomba de lado e fica ensanguentado). */
(function () {
  'use strict';
  const HZ = window.HZ;
  const THREE = window.THREE;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ espécies
  // Corpo: [x, y, a(meia-altura), b(meia-largura)] em metros; x = frente, y = cima.
  const SPECIES = {
    deer: {
      name: 'Cervo', hostile: 'prey', hp: 100, walk: 1.3, run: 9.2, turn: 2.6, radius: 0.5, sight: 48, hearing: 55, points: 150, vital: [0.12, 0.6],
      body: [[-0.8, 1.0, 0.03, 0.03], [-0.76, 1.0, 0.17, 0.13], [-0.66, 1.0, 0.26, 0.19], [-0.48, 0.99, 0.3, 0.22], [-0.25, 0.97, 0.3, 0.23], [0, 0.97, 0.31, 0.23], [0.25, 1.0, 0.32, 0.22], [0.45, 1.04, 0.3, 0.19], [0.58, 1.08, 0.24, 0.15], [0.64, 1.12, 0.1, 0.08]],
      neck: { at: [0.5, 1.12], pts: [[0, 0, 0.17, 0.12], [0.1, 0.2, 0.14, 0.1], [0.2, 0.42, 0.11, 0.085], [0.26, 0.56, 0.1, 0.08]] },
      head: { pts: [[0.2, 0.64, 0.03, 0.03], [0.23, 0.66, 0.1, 0.085], [0.31, 0.64, 0.105, 0.08], [0.4, 0.58, 0.08, 0.06], [0.48, 0.52, 0.06, 0.045], [0.53, 0.49, 0.045, 0.035], [0.55, 0.48, 0.01, 0.01]], eye: [0.335, 0.675, 0.074, 0.018], ear: { at: [0.26, 0.72, 0.065], dir: [-0.35, 0.55, 0.75], len: 0.17, wid: 0.055 } },
      tail: { at: [-0.78, 1.05], pts: [[0, 0, 0.04, 0.05], [-0.06, -0.06, 0.05, 0.05], [-0.1, -0.15, 0.02, 0.03]] },
      front: { x: 0.4, z: 0.11, y: 0.97, up: 0.46, lo: 0.5, t: [0.085, 0.045, 0.034, 0.028], foot: 'hoof', rest: [0.04, -0.04] },
      hind: { x: -0.52, z: 0.11, y: 1.0, up: 0.5, lo: 0.52, t: [0.13, 0.055, 0.034, 0.026], foot: 'hoof', rest: [-0.25, 0.45] },
      colors: { back: 0x5d3e24, side: 0x7a5232, belly: 0xcbb798, leg: 0x5a3d26, nose: 0x141010, rump: 0xe8e0d0, muzzle: 0x3a2a1c },
      graze: -1.25, grazes: true,
    },
    wolf: {
      name: 'Lobo', hostile: 'predator', hp: 75, walk: 1.5, run: 7.8, turn: 4.0, radius: 0.45, sight: 60, hearing: 60, points: 220, vital: [0.1, 0.5], dmg: [8, 12], reach: 1.55, cd: 2.0,
      body: [[-0.58, 0.72, 0.03, 0.03], [-0.54, 0.72, 0.13, 0.11], [-0.44, 0.72, 0.18, 0.14], [-0.25, 0.71, 0.19, 0.15], [0, 0.72, 0.21, 0.16], [0.22, 0.73, 0.25, 0.17], [0.38, 0.75, 0.25, 0.16], [0.48, 0.78, 0.2, 0.14], [0.53, 0.8, 0.08, 0.07]],
      neck: { at: [0.42, 0.8], pts: [[0, 0, 0.15, 0.12], [0.1, 0.07, 0.13, 0.1], [0.2, 0.13, 0.11, 0.09]] },
      head: { pts: [[0.17, 0.16, 0.03, 0.03], [0.2, 0.17, 0.1, 0.095], [0.28, 0.16, 0.1, 0.09], [0.36, 0.12, 0.065, 0.055], [0.45, 0.09, 0.045, 0.04], [0.5, 0.08, 0.035, 0.03], [0.52, 0.08, 0.01, 0.01]], eye: [0.32, 0.2, 0.06, 0.013], ear: { at: [0.24, 0.25, 0.055], dir: [-0.15, 0.95, 0.3], len: 0.12, wid: 0.055 } },
      tail: { at: [-0.56, 0.74], pts: [[0, 0, 0.04, 0.04], [-0.1, -0.08, 0.07, 0.07], [-0.2, -0.2, 0.075, 0.075], [-0.28, -0.34, 0.05, 0.05], [-0.31, -0.42, 0.01, 0.01]] },
      front: { x: 0.33, z: 0.09, y: 0.7, up: 0.34, lo: 0.37, t: [0.07, 0.04, 0.03, 0.027], foot: 'paw', rest: [0.04, -0.06] },
      hind: { x: -0.4, z: 0.09, y: 0.73, up: 0.37, lo: 0.39, t: [0.1, 0.045, 0.03, 0.026], foot: 'paw', rest: [-0.3, 0.5] },
      colors: { back: 0x4a4540, side: 0x807564, belly: 0xc9bfae, leg: 0x8a7e6c, nose: 0x0c0c0c, muzzle: 0xb8ad9c },
      graze: -0.9,
    },
    bear: {
      name: 'Urso', hostile: 'predator', hp: 260, walk: 1.2, run: 7.2, turn: 2.2, radius: 0.8, sight: 42, hearing: 45, points: 400, vital: [0.1, 0.6], dmg: [24, 34], reach: 2.1, cd: 2.1, big: true,
      body: [[-0.85, 0.95, 0.03, 0.03], [-0.8, 0.95, 0.3, 0.28], [-0.65, 0.97, 0.42, 0.38], [-0.4, 0.98, 0.46, 0.42], [-0.1, 1.0, 0.47, 0.43], [0.2, 1.06, 0.48, 0.41], [0.42, 1.08, 0.44, 0.37], [0.6, 1.05, 0.34, 0.3], [0.7, 1.02, 0.12, 0.12]],
      neck: { at: [0.6, 1.02], pts: [[0, 0, 0.3, 0.28], [0.14, -0.02, 0.26, 0.24], [0.26, -0.04, 0.22, 0.2]] },
      head: { pts: [[0.24, 0.0, 0.04, 0.04], [0.28, 0.02, 0.2, 0.19], [0.38, 0.02, 0.19, 0.18], [0.48, -0.03, 0.12, 0.1], [0.58, -0.06, 0.08, 0.07], [0.63, -0.07, 0.06, 0.055], [0.65, -0.07, 0.01, 0.01]], eye: [0.45, 0.08, 0.1, 0.016], ear: { at: [0.33, 0.19, 0.13], dir: [-0.2, 0.9, 0.4], len: 0.09, wid: 0.08 } },
      tail: { at: [-0.83, 0.98], pts: [[0, 0, 0.05, 0.05], [-0.05, -0.03, 0.04, 0.04], [-0.07, -0.06, 0.01, 0.01]] },
      front: { x: 0.45, z: 0.22, y: 0.78, up: 0.4, lo: 0.37, t: [0.17, 0.12, 0.11, 0.1], foot: 'bearpaw', rest: [0.02, -0.02] },
      hind: { x: -0.55, z: 0.22, y: 0.82, up: 0.44, lo: 0.37, t: [0.2, 0.13, 0.12, 0.1], foot: 'bearpaw', rest: [-0.15, 0.2] },
      colors: { back: 0x3a2616, side: 0x4d3320, belly: 0x33231a, leg: 0x241810, nose: 0x0a0806, muzzle: 0x5c4630 },
      graze: -0.7,
    },
    boar: {
      name: 'Javali', hostile: 'territorial', hp: 110, walk: 1.1, run: 8.0, turn: 3.0, radius: 0.5, sight: 30, hearing: 38, points: 200, vital: [0.1, 0.5], dmg: [15, 20], reach: 1.4, cd: 1.4,
      body: [[-0.62, 0.62, 0.03, 0.03], [-0.58, 0.62, 0.2, 0.18], [-0.45, 0.63, 0.28, 0.24], [-0.2, 0.64, 0.31, 0.26], [0.05, 0.67, 0.34, 0.27], [0.28, 0.72, 0.37, 0.26], [0.42, 0.72, 0.33, 0.23], [0.5, 0.7, 0.24, 0.19], [0.54, 0.68, 0.1, 0.1]],
      neck: { at: [0.45, 0.72], pts: [[0, 0, 0.26, 0.22], [0.1, -0.04, 0.24, 0.2], [0.18, -0.08, 0.22, 0.17]] },
      head: { pts: [[0.16, -0.06, 0.04, 0.04], [0.19, -0.04, 0.2, 0.16], [0.3, -0.08, 0.17, 0.13], [0.42, -0.14, 0.11, 0.09], [0.54, -0.2, 0.075, 0.07], [0.6, -0.22, 0.07, 0.065], [0.61, -0.22, 0.01, 0.01]], eye: [0.31, 0.0, 0.105, 0.012], ear: { at: [0.22, 0.1, 0.1], dir: [-0.3, 0.8, 0.5], len: 0.12, wid: 0.065 } },
      tail: { at: [-0.61, 0.66], pts: [[0, 0, 0.02, 0.02], [-0.04, -0.1, 0.015, 0.015], [-0.05, -0.2, 0.01, 0.01]] },
      front: { x: 0.3, z: 0.13, y: 0.5, up: 0.25, lo: 0.27, t: [0.09, 0.05, 0.04, 0.035], foot: 'hoof', rest: [0.03, -0.03] },
      hind: { x: -0.42, z: 0.13, y: 0.55, up: 0.28, lo: 0.29, t: [0.12, 0.055, 0.04, 0.034], foot: 'hoof', rest: [-0.2, 0.35] },
      colors: { back: 0x1e1a15, side: 0x352c22, belly: 0x2e271f, leg: 0x1a1612, nose: 0x5a4640, muzzle: 0x2a221c },
      graze: -0.55, grazes: true, mane: true, tusks: true,
    },
    fox: {
      name: 'Raposa', hostile: 'prey', hp: 40, walk: 1.2, run: 8.4, turn: 4.0, radius: 0.3, sight: 40, hearing: 50, points: 120, vital: [0.04, 0.28],
      body: [[-0.32, 0.36, 0.02, 0.02], [-0.29, 0.36, 0.08, 0.07], [-0.2, 0.36, 0.1, 0.085], [0, 0.36, 0.11, 0.09], [0.16, 0.37, 0.12, 0.085], [0.26, 0.38, 0.1, 0.075], [0.3, 0.39, 0.04, 0.04]],
      neck: { at: [0.24, 0.4], pts: [[0, 0, 0.07, 0.06], [0.06, 0.06, 0.06, 0.05], [0.1, 0.1, 0.055, 0.045]] },
      head: { pts: [[0.08, 0.1, 0.02, 0.02], [0.1, 0.11, 0.06, 0.06], [0.15, 0.1, 0.06, 0.055], [0.21, 0.08, 0.035, 0.03], [0.27, 0.06, 0.018, 0.016], [0.29, 0.06, 0.005, 0.005]], eye: [0.17, 0.13, 0.04, 0.009], ear: { at: [0.11, 0.155, 0.035], dir: [-0.15, 0.9, 0.35], len: 0.09, wid: 0.045 } },
      tail: { at: [-0.31, 0.37], pts: [[0, 0, 0.03, 0.03], [-0.1, -0.05, 0.06, 0.06], [-0.22, -0.1, 0.07, 0.07], [-0.34, -0.14, 0.055, 0.055], [-0.4, -0.16, 0.02, 0.02]], tip: 0xf0ece4 },
      front: { x: 0.2, z: 0.055, y: 0.34, up: 0.17, lo: 0.18, t: [0.035, 0.02, 0.016, 0.014], foot: 'paw', rest: [0.04, -0.05] },
      hind: { x: -0.22, z: 0.055, y: 0.36, up: 0.18, lo: 0.19, t: [0.05, 0.022, 0.016, 0.014], foot: 'paw', rest: [-0.3, 0.5] },
      colors: { back: 0xa4501c, side: 0xc0652a, belly: 0xece6da, leg: 0x1c1410, nose: 0x0c0a0a, muzzle: 0xf0ece4 },
      graze: -0.8,
    },
    rabbit: {
      name: 'Coelho', hostile: 'prey', hp: 20, walk: 0.9, run: 7.5, turn: 5.0, radius: 0.2, sight: 30, hearing: 45, points: 80, vital: [-0.05, 0.15], hop: true,
      body: [[-0.2, 0.2, 0.02, 0.02], [-0.17, 0.21, 0.11, 0.1], [-0.08, 0.21, 0.13, 0.11], [0.04, 0.2, 0.11, 0.09], [0.12, 0.2, 0.08, 0.07], [0.16, 0.21, 0.03, 0.03]],
      neck: { at: [0.13, 0.24], pts: [[0, 0, 0.05, 0.045], [0.03, 0.03, 0.05, 0.045]] },
      head: { pts: [[0.02, 0.05, 0.02, 0.02], [0.04, 0.06, 0.055, 0.05], [0.09, 0.06, 0.05, 0.045], [0.13, 0.04, 0.03, 0.028], [0.15, 0.035, 0.01, 0.01]], eye: [0.09, 0.08, 0.04, 0.009], ear: { at: [0.05, 0.1, 0.022], dir: [-0.45, 0.88, 0.12], len: 0.13, wid: 0.035 } },
      tail: { at: [-0.2, 0.23], pts: [[0, 0, 0.03, 0.03], [-0.03, 0.01, 0.035, 0.035], [-0.05, 0.01, 0.01, 0.01]], tip: 0xf2eee8 },
      front: { x: 0.1, z: 0.05, y: 0.15, up: 0.08, lo: 0.085, t: [0.022, 0.018, 0.014, 0.012], foot: 'paw', rest: [0.1, -0.1] },
      hind: { x: -0.1, z: 0.065, y: 0.19, up: 0.12, lo: 0.12, t: [0.06, 0.03, 0.018, 0.016], foot: 'longfoot', rest: [-0.7, 1.2] },
      colors: { back: 0x6f5e4a, side: 0x8a7760, belly: 0xd9d0c2, leg: 0x7d6a55, nose: 0x3a2a26, muzzle: 0xb5a590 },
      graze: -0.5, grazes: true,
    },
  };
  HZ.SPECIES = SPECIES;

  const C = (hex) => HZ.colorArr(hex);
  const mats = {};
  function furMat(key) {
    if (mats[key]) return mats[key];
    const tx = HZ.tx;
    tx.fur.wrapS = tx.fur.wrapT = THREE.RepeatWrapping; if (tx.furN) tx.furN.wrapS = tx.furN.wrapT = THREE.RepeatWrapping;
    const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, map: tx.fur, normalMap: tx.furN || null, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.9, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.5, 0.45, 0.38), envMapIntensity: 0.45 });
    m.color.setScalar(1.35);
    mats[key] = m; return m;
  }
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0604, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x6e5a44, roughness: 0.75, vertexColors: true });
  const tuskMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.35 });

  function tube(pts, colorFn, radial, o = {}) {
    const path = pts.map(p => V(p[0], p[1], o.z || 0));
    const secs = pts.map(p => ({ a: p[2], b: p[3] }));
    return HZ.loft(path, secs, { radial, capStart: true, capEnd: true, vScale: o.vScale || 5, color: colorFn, ref: o.ref, radiusFn: o.radiusFn });
  }
  const smooth = (a, b, x) => { const t = HZ.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ------------------------------------------------------------------ construção do corpo
  function buildBody(type, sp, rnd) {
    const col = sp.colors, cBack = C(col.back), cSide = C(col.side), cBelly = C(col.belly), cLeg = C(col.leg), cNose = C(col.nose), cMuz = C(col.muzzle);
    const R = HZ.q ? HZ.q.radial + 6 : 14;
    const seed = rnd() * 100;
    const furVar = (p) => 0.86 + 0.28 * (HZ.perlin(p.x * 9 + seed, p.y * 9 + p.z * 5, 3) * 0.5 + 0.5);
    const coat = (p, ny) => { const t = smooth(-0.55, 0.65, ny); let c = t > 0.5 ? HZ.mixArr(cSide, cBack, (t - 0.5) * 2) : HZ.mixArr(cBelly, cSide, t * 2); const v = furVar(p); return [c[0] * v, c[1] * v, c[2] * v]; };
    const x0 = sp.body[0][0], x1 = sp.body[sp.body.length - 1][0];
    const bodyCol = (c, s, s01, p, nx, ny, nz) => {
      let cc = coat(p, ny);
      if (type === 'deer' && p.x < x0 + 0.14 && ny < 0.6) cc = HZ.mixArr(cc, C(col.rump), 0.85);
      if (type === 'fox' && p.x > x1 - 0.12 && ny < 0.2) cc = HZ.mixArr(cc, cBelly, 0.8);
      if (type === 'wolf' && ny > 0.75) cc = HZ.mixArr(cc, [0.02, 0.02, 0.02], 0.35);
      return cc;
    };
    const root = new THREE.Group(), fall = new THREE.Group(), rig = new THREE.Group();
    root.add(fall); fall.add(rig);
    const meshes = [];
    const mk = (geo, mat, zone, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.userData.zone = zone; parent.add(m); meshes.push(m); return m; };
    const fm = furMat(type);

    // corpo (+ crina do javali)
    let bodyGeo = tube(sp.body, bodyCol, R + 4, { radiusFn: (ph, s01) => 1 + 0.03 * Math.sin(ph * 3 + s01 * 9) });
    if (sp.mane) {
      const mane = sp.body.slice(2, -1).map(b => [b[0], b[1] + b[2] * 0.92, 0.07, 0.025]);
      bodyGeo = HZ.merge([bodyGeo, tube(mane, (c, s, s01, p) => { const v = furVar(p); return [0.04 * v, 0.035 * v, 0.03 * v]; }, 6)]);
    }
    const body = mk(bodyGeo, fm, 'body', rig);

    // pescoço e cabeça (pivô permite abaixar para pastar e olhar em volta)
    const neckPivot = new THREE.Group(); neckPivot.position.set(sp.neck.at[0], sp.neck.at[1], 0); rig.add(neckPivot);
    const neckCol = (c, s, s01, p, nx, ny) => { let cc = coat(p, ny * 0.8 + 0.1); if (type === 'fox' || type === 'wolf') cc = ny < -0.2 ? HZ.mixArr(cc, cMuz, 0.7) : cc; return cc; };
    const neck = mk(tube(sp.neck.pts, neckCol, R), fm, 'neck', neckPivot);
    const hp = sp.head.pts, hx0 = hp[0][0], hx1 = hp[hp.length - 1][0];
    const headCol = (c, s, s01, p, nx, ny) => {
      let cc = coat(p, ny);
      const f = (p.x - hx0) / (hx1 - hx0);
      if (f > 0.55) cc = HZ.mixArr(cc, cMuz, smooth(0.55, 0.8, f) * (ny < 0.5 ? 1 : 0.5));
      if (f > 0.9) cc = HZ.mixArr(cc, cNose, smooth(0.9, 0.97, f));
      return cc;
    };
    const parts = [tube(hp, headCol, R)];
    // orelhas
    const E = sp.head.ear;
    for (const sd of [-1, 1]) {
      const d = V(E.dir[0], E.dir[1], E.dir[2] * sd).normalize();
      const b0 = V(E.at[0], E.at[1], E.at[2] * sd);
      const pts = [], secs = [];
      for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(b0.clone().addScaledVector(d, E.len * t)); const w = E.wid * Math.sin(Math.min(1, t * 1.25 + 0.15) * Math.PI) * (1 - t * 0.35) + 0.004; secs.push({ a: w, b: 0.012 * (1 - t * 0.6) + 0.003 }); }
      const inner = type === 'rabbit' ? C(0x9c8070) : type === 'fox' ? C(0x2a1a12) : cSide;
      parts.push(HZ.loft(pts, secs, { radial: 8, capStart: true, capEnd: true, ref: V(1, 0, 0), vScale: 5, color: (c, s, s01, p) => (s01 > 0.8 && (type === 'fox' || type === 'wolf') ? [0.03, 0.02, 0.02] : HZ.mixArr(cBack, inner, s > 0 ? 0.5 : 0)) }));
    }
    const head = mk(HZ.merge(parts), fm, 'head', neckPivot);
    const eg = new THREE.SphereGeometry(sp.head.eye[3], 10, 8);
    for (const sd of [-1, 1]) { const e = mk(eg, eyeMat, 'head', neckPivot); e.position.set(sp.head.eye[0], sp.head.eye[1], sp.head.eye[2] * sd); e.castShadow = false; }
    // chifres (machos de cervo) / presas (javali)
    if (type === 'deer' && rnd() < 0.45) {
      const ag = [];
      const ac = (c, s, s01) => HZ.mixArr(C(0x5a4632), C(0xe0d4bc), smooth(0.6, 1, s01));
      for (const sd of [-1, 1]) {
        const base = V(0.27, 0.74, 0.045 * sd);
        const main = []; for (let i = 0; i <= 8; i++) { const t = i / 8; main.push(base.clone().add(V(-0.12 * t + 0.1 * t * t, 0.42 * t, (0.2 * t - 0.05 * t * t) * sd))); }
        ag.push(HZ.loft(main, main.map((p, i) => 0.022 * (1 - i / 10) + 0.004), { radial: 6, capEnd: true, color: ac }));
        for (const [ti, dir, L] of [[2, V(0.25, 0.3, 0.02 * sd), 0.14], [4, V(0.2, 0.35, 0.05 * sd), 0.13], [6, V(0.05, 0.4, 0.1 * sd), 0.1]]) {
          const s0 = main[ti], dn = dir.normalize(), pp = [0, 1, 2, 3].map(k => s0.clone().addScaledVector(dn, (L * k) / 3).add(V(0, 0.02 * k * k / 9, 0)));
          ag.push(HZ.loft(pp, pp.map((p, i) => 0.014 * (1 - i / 4) + 0.003), { radial: 5, capEnd: true, color: ac }));
        }
      }
      mk(HZ.merge(ag), hornMat, 'head', neckPivot);
    }
    if (sp.tusks) {
      const tg = [];
      for (const sd of [-1, 1]) { const pp = [0, 1, 2, 3, 4].map(k => { const t = k / 4; return V(0.5 + 0.05 * t, -0.24 + 0.1 * t * t + 0.02 * t, (0.06 + 0.03 * t) * sd); }); tg.push(HZ.loft(pp, pp.map((p, i) => 0.012 * (1 - i / 5) + 0.002), { radial: 6, capEnd: true })); }
      mk(HZ.merge(tg), tuskMat, 'head', neckPivot);
    }

    // cauda
    const tailPivot = new THREE.Group(); tailPivot.position.set(sp.tail.at[0], sp.tail.at[1], 0); rig.add(tailPivot);
    const tip = sp.tail.tip ? C(sp.tail.tip) : null;
    mk(tube(sp.tail.pts, (c, s, s01, p, nx, ny) => { let cc = coat(p, ny); if (type === 'deer' && ny < 0.3) cc = C(col.rump); if (tip && s01 > 0.78) cc = tip; return cc; }, 8), fm, 'body', tailPivot);

    // pernas: quadril -> joelho
    const legs = [];
    const legCol = (L, isLower) => (c, s, s01, p, nx, ny) => {
      let cc = HZ.mixArr(cLeg, cSide, isLower ? 0 : 0.5 * (1 - s01));
      const v = furVar(p); cc = [cc[0] * v, cc[1] * v, cc[2] * v];
      if (isLower) { const fy = p.y + L.lo; if (L.foot === 'hoof' && fy < 0.06) cc = [0.03, 0.025, 0.02]; if (L.foot === 'paw' && type === 'fox') cc = [0.03, 0.025, 0.02]; }
      return cc;
    };
    const buildLeg = (L, front, sd) => {
      const hip = new THREE.Group(); hip.position.set(L.x, L.y, L.z * sd); rig.add(hip);
      const t = L.t;
      const up = [[0, 0.12, t[0] * 0.8, t[0] * 0.7], [0, 0, t[0], t[0] * 0.8], [0, -L.up * 0.5, (t[0] + t[1]) / 2, (t[0] + t[1]) * 0.4], [0, -L.up, t[1], t[1] * 0.85]];
      const upG = HZ.loft(up.map(p => V(p[0], p[1], 0)), up.map(p => ({ a: p[2], b: p[3] })), { radial: 9, capStart: true, capEnd: true, vScale: 5, color: legCol(L, false) });
      mk(upG, fm, 'leg', hip);
      const knee = new THREE.Group(); knee.position.set(0, -L.up, 0); hip.add(knee);
      const lo = L.lo; let lp;
      if (L.foot === 'hoof') lp = [[0, 0.03, t[1] * 0.9, t[1] * 0.8], [0, -lo * 0.3, t[2], t[2] * 0.8], [0, -lo * 0.82, t[3], t[3] * 0.85], [0.008, -lo + 0.05, t[3] * 1.15, t[3] * 1.05], [0.02, -lo + 0.01, t[3] * 1.25, t[3] * 1.1], [0.025, -lo, 0.004, 0.004]];
      else if (L.foot === 'bearpaw') lp = [[0, 0.03, t[1] * 0.9, t[1] * 0.85], [0, -lo * 0.5, t[2], t[2] * 0.9], [0, -lo * 0.85, t[3], t[3] * 0.95], [0.05, -lo + 0.05, t[3] * 1.2, t[3] * 1.1], [0.12, -lo + 0.03, t[3] * 0.9, t[3] * 1.0], [0.15, -lo + 0.02, 0.01, 0.01]];
      else if (L.foot === 'longfoot') lp = [[0, 0.02, t[1] * 0.9, t[1] * 0.85], [0, -lo * 0.6, t[2], t[2]], [0.02, -lo + 0.015, t[3] * 1.2, t[3] * 1.3], [0.1, -lo + 0.012, t[3], t[3] * 1.2], [0.13, -lo + 0.01, 0.005, 0.005]];
      else lp = [[0, 0.03, t[1] * 0.9, t[1] * 0.85], [0, -lo * 0.4, t[2], t[2] * 0.9], [0, -lo * 0.85, t[3], t[3] * 0.9], [0.015, -lo + 0.025, t[3] * 1.3, t[3] * 1.3], [0.04, -lo + 0.015, t[3] * 1.1, t[3] * 1.2], [0.05, -lo + 0.01, 0.005, 0.005]];
      const loG = HZ.loft(lp.map(p => V(p[0], p[1], 0)), lp.map(p => ({ a: p[2], b: p[3] })), { radial: 8, capStart: true, capEnd: true, vScale: 5, color: legCol(L, true) });
      mk(loG, fm, 'leg', knee);
      legs.push({ hip, knee, front, sd, rest: L.rest, h: L.rest[0], k: L.rest[1] });
    };
    // ordem: LH, LF, RH, RF  (sd = -1 esquerda)
    buildLeg(sp.hind, false, -1); buildLeg(sp.front, true, -1); buildLeg(sp.hind, false, 1); buildLeg(sp.front, true, 1);
    return { root, fall, rig, body, neck, head, neckPivot, tailPivot, legs, meshes };
  }

  // ------------------------------------------------------------------ Animal
  const GAITS = {
    walk: { off: [0, 0.25, 0.5, 0.75], A: 0.32, K: 0.55, stride: 0.95 },
    trot: { off: [0, 0.5, 0.5, 0], A: 0.45, K: 0.8, stride: 1.55 },
    gallop: { off: [0, 0.55, 0.1, 0.65], A: 0.68, K: 1.05, stride: 3.1 },
    bound: { off: [0, 0.45, 0.04, 0.5], A: 0.8, K: 1.2, stride: 3.6 },
  };
  const _v = V(), _v2 = V(), _eye = V(), _dir = V();

  class Animal {
    constructor(type, mgr, x, z, rnd) {
      const sp = SPECIES[type];
      this.type = type; this.sp = sp; this.mgr = mgr;
      this.scale = 0.9 + rnd() * 0.22;
      Object.assign(this, buildBody(type, sp, rnd));
      this.root.scale.setScalar(this.scale);
      this.meshes.forEach(m => (m.userData.animal = this));
      this.x = x; this.z = z; this.y = HZ.heightAt(x, z);
      this.heading = rnd() * TAU; this.speed = 0; this.targetSpeed = 0;
      this.hp = sp.hp; this.maxHp = sp.hp; this.bleed = 0;
      this.state = 'idle'; this.stateT = 2 + rnd() * 4; this.aware = 0;
      this.phase = rnd(); this.target = null; this.steerT = 0; this.senseT = rnd() * 0.3; this.seen = false;
      this.attackCd = 0; this.attackT = 0; this.flankAng = (rnd() - 0.5) * 2.4; this.dripT = 0; this.lastDrip = V(x, 0, z);
      this.neckTarget = 0; this.neckYaw = 0; this.pitch = 0; this.hopY = 0; this.lostT = 0; this.soundT = 3 + rnd() * 10;
      this.dead = false; this.fallA = 0; this.fallW = 0; this.fallSide = 1; this.settled = false;
      this.radius = sp.radius * this.scale;
      this.len = (sp.body[sp.body.length - 1][0] - sp.body[0][0]) * this.scale;
      this.legLen = (sp.front.up + sp.front.lo) * this.scale;
      this.bodyB = Math.max(...sp.body.map(b => b[3])) * this.scale;
      this.bodyH = sp.body[4][1] * this.scale;
      this.root.position.set(x, this.y, z);
      this.root.rotation.y = this.heading;
    }

    get pos() { return this.root.position; }

    // -------------------------------------------------- dano
    takeHit(hit, baseDmg, dir) {
      if (this.dead) return null;
      const part = hit.object, zone = part.userData.zone;
      let mult = { head: 3.5, neck: 1.8, body: 1, leg: 0.55 }[zone] || 1;
      let vital = false;
      const local = part.worldToLocal(hit.point.clone());
      if (zone === 'body' && part === this.body) { const lx = local.x; if (lx > this.sp.vital[0] && lx < this.sp.vital[1]) { mult = 1.75; vital = true; } }
      if (zone === 'head' || zone === 'neck') vital = true;
      const dmg = baseDmg * mult;
      this.hp -= dmg;
      // ferida no ponto de impacto (acompanha o corpo)
      const n = hit.face ? hit.face.normal.clone() : V(0, 1, 0);
      this.mgr.effects.bodyBlood(part, local, n, 0.05 + Math.random() * 0.04);
      this.mgr.effects.bloodSpray(hit.point, V().copy(dir).multiplyScalar(0.6).add(V(0, 0.3, 0)), vital ? 1.4 : 1);
      this.mgr.effects.groundDecal(hit.point.x + dir.x * 0.8, hit.point.z + dir.z * 0.8, 0.25 + Math.random() * 0.25, 0, 1);
      this.bleed = Math.min(6, this.bleed + dmg * 0.045);
      if (this.hp <= 0) { this.die(dir, zone); return { killed: true, zone, vital, dmg }; }
      // reação
      this.stagger = 0.35;
      const a = this.mgr.audio, p = this.pos;
      if (this.type === 'wolf' || this.type === 'fox') a.yelp(p); else if (this.type === 'boar') a.squeal(p); else if (this.type === 'bear') a.roar(p); else if (this.type === 'deer') a.bark(p);
      if (this.sp.hostile === 'prey') this.setFlee(this.mgr.playerPos, 14);
      else { this.aggro(true); if (this.type === 'wolf') this.mgr.alertPack(this); }
      return { killed: false, zone, vital, dmg };
    }

    die(dir, zone) {
      this.dead = true; this.state = 'dead'; this.hp = 0; this.speed = 0; this.bleed = 0;
      // cai para o lado oposto ao tiro
      const right = _v.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      this.fallSide = dir && dir.x * right.x + dir.z * right.z < 0 ? -1 : 1;
      this.fall.position.z = this.fallSide * this.sp.front.z * 1.1;
      this.rig.position.z = -this.fallSide * this.sp.front.z * 1.1;
      this.fallW = 0.9 + Math.random() * 0.6; this.fallA = 0;
      this.deathZone = zone;
      this.relax = this.legs.map(L => ({ h: (L.front ? 0.35 : -0.45) + (Math.random() - 0.5) * 0.5, k: (L.front ? -0.5 : 0.6) * Math.random() }));
      this.mgr.onKill(this, zone);
    }

    // após tombar: manchas de sangue no lado de cima e poça no chão
    bloodyCorpse() {
      const fx = this.mgr.effects, sd = this.fallSide, B = this.sp.body;
      const n = V(0, 0, -sd);
      const count = 5 + (Math.random() * 4) | 0;
      for (let i = 0; i < count; i++) {
        const k = 2 + Math.floor(Math.random() * (B.length - 4));
        const s = B[k], y = s[1] + (Math.random() - 0.5) * s[2] * 0.9;
        const zz = s[3] * Math.sqrt(Math.max(0.05, 1 - ((y - s[1]) / s[2]) ** 2));
        const p = V(s[0] + (Math.random() - 0.5) * 0.1, y, -sd * zz * 0.98);
        const nn = V(0, (y - s[1]) / s[2] * 0.6, -sd).normalize();
        fx.bodyBlood(this.body, p, nn, (0.12 + Math.random() * 0.2) * (this.sp.big ? 1.6 : this.sp.radius < 0.35 ? 0.55 : 1));
      }
      // pescoço/cabeça sujos
      const np = this.sp.neck.pts[1];
      fx.bodyBlood(this.neck, V(np[0], np[1], -sd * np[3] * 0.95), n, 0.07 * (this.sp.big ? 1.5 : 1));
      if (this.deathZone === 'head') { const hp = this.sp.head.pts[3]; fx.bodyBlood(this.head, V(hp[0], hp[1], -sd * hp[3] * 0.9), n, 0.06); }
      // poça crescendo sob o corpo e perto da cabeça
      const bc = this.body.localToWorld(V((this.sp.vital[0] + this.sp.vital[1]) / 2, this.sp.body[4][1] - this.sp.body[4][2] * 0.3, sd * this.sp.body[4][3] * 1.1));
      const size = (0.7 + Math.random() * 0.5) * this.len;
      fx.groundDecal(bc.x, bc.z, size, size * 0.09, 0.85);
      const hc = this.head.localToWorld(V(this.sp.head.pts[4][0], this.sp.head.pts[4][1], 0));
      fx.groundDecal(hc.x, hc.z, size * 0.45, size * 0.05, 0.75);
    }

    setFlee(from, time) {
      this.state = 'flee'; this.stateT = time; this.fleeFrom = from.clone ? from.clone() : V(from.x, 0, from.z);
      this.aware = 1.5; this.target = null;
    }
    aggro(immediate) {
      if (this.dead) return;
      if (this.sp.hostile === 'territorial') { this.state = 'charge'; this.stateT = 22; }
      else if (this.type === 'bear' && !immediate && this.state !== 'chase' && this.state !== 'attack') { this.state = 'rear'; this.stateT = 1.9; this.mgr.audio.roar(this.pos); }
      else if (this.state !== 'attack') { this.state = 'chase'; this.stateT = 30; if (this.type === 'wolf' && Math.random() < 0.5) this.mgr.audio.growl(this.pos, false); }
      this.aware = 2; this.lostT = 0;
    }
    hearShot(p, d) {
      if (this.dead) return;
      if (this.sp.hostile === 'prey') { if (d < 130) this.setFlee(p, 10 + Math.random() * 6); }
      else if (this.sp.hostile === 'territorial') { if (d < 45) this.aggro(); else if (d < 110) this.setFlee(p, 8); }
      else if (d < 100 && this.state !== 'chase' && this.state !== 'attack') { this.state = 'investigate'; this.stateT = 25; this.target = V(p.x, 0, p.z); }
    }

    // -------------------------------------------------- percepção
    sense(G, d) {
      const sp = this.sp, pl = G.player;
      let canSee = false;
      const sightR = sp.sight * (pl.crouch ? 0.55 : 1) * (pl.moving ? 1 : 0.65) * (G.rain ? 0.75 : 1);
      if (d < sightR && pl.alive) {
        const fx = Math.cos(this.heading), fz = -Math.sin(this.heading);
        const dx = (pl.pos.x - this.x) / d, dz = (pl.pos.z - this.z) / d;
        const fov = sp.hostile === 'prey' ? -0.35 : 0.1;
        if (fx * dx + fz * dz > fov || d < 7) {
          _eye.set(this.x, this.y + this.bodyH + 0.3, this.z);
          _dir.set(pl.pos.x - _eye.x, pl.pos.y - _eye.y, pl.pos.z - _eye.z); const L = _dir.length(); _dir.divideScalar(L);
          const h = G.physics.raycast(_eye, _dir, L, false);
          canSee = !h || h.t > L - 0.8;
        }
      }
      const canHear = d < pl.noise * sp.hearing;
      this.seen = canSee;
      return { canSee, canHear, sightR };
    }

    // -------------------------------------------------- IA
    think(dt, G, d) {
      const sp = this.sp, pl = G.player;
      this.senseT -= dt;
      if (this.senseT <= 0) {
        this.senseT = 0.25 + Math.random() * 0.1;
        const s = this.sense(G, d);
        const gain = (s.canSee ? 1.4 * (1 - d / (s.sightR + 1)) + 0.25 : 0) + (s.canHear ? 0.8 : 0);
        this.aware = gain > 0 ? this.aware + gain * 0.3 * (pl.moving ? 1 : 0.5) : Math.max(0, this.aware - 0.06);
        this.lastSenseSee = s.canSee;
      }
      if (!pl.alive && sp.hostile !== 'prey' && (this.state === 'chase' || this.state === 'attack' || this.state === 'charge')) { this.state = 'idle'; this.stateT = 5; this.aware = 0; }
      this.stateT -= dt;
      switch (this.state) {
        case 'idle': case 'graze': case 'walk': {
          if (this.aware > 1) {
            if (sp.hostile === 'prey') { this.setFlee(pl.pos, 9 + Math.random() * 6); if (this.type === 'deer' && Math.random() < 0.6) this.mgr.audio.bark(this.pos); }
            else if (sp.hostile === 'territorial') { if (d < 22) this.aggro(); else this.setFlee(pl.pos, 6); }
            else { this.aggro(); if (this.type === 'wolf') this.mgr.alertPack(this); }
            break;
          }
          if (this.aware > 0.5 && sp.hostile === 'prey') { this.state = 'idle'; this.targetSpeed = 0; this.alertLook = true; this.stateT = Math.max(this.stateT, 1); break; }
          this.alertLook = false;
          if (this.stateT <= 0) {
            const r = Math.random();
            if (r < 0.45) {
              this.state = 'walk'; this.stateT = 5 + Math.random() * 10;
              let tx, tz;
              if (sp.hostile === 'predator' && G.huntPressure && Math.random() < 0.45) { tx = pl.pos.x + (Math.random() - 0.5) * 60; tz = pl.pos.z + (Math.random() - 0.5) * 60; }
              else { const a = Math.random() * TAU, R = 8 + Math.random() * 25; tx = this.x + Math.cos(a) * R; tz = this.z + Math.sin(a) * R; }
              this.target = V(HZ.clamp(tx, -185, 185), 0, HZ.clamp(tz, -185, 185));
            } else if (r < 0.8 && sp.grazes !== false) { this.state = 'graze'; this.stateT = 4 + Math.random() * 8; this.target = null; }
            else { this.state = 'idle'; this.stateT = 2 + Math.random() * 4; this.target = null; }
          }
          this.targetSpeed = this.state === 'walk' ? sp.walk : 0;
          if (this.state === 'walk' && this.target && Math.hypot(this.target.x - this.x, this.target.z - this.z) < 1.5) { this.state = 'idle'; this.stateT = 1 + Math.random() * 3; }
          break;
        }
        case 'flee': {
          const f = this.fleeFrom;
          const ax = this.x - f.x, az = this.z - f.z, al = Math.hypot(ax, az) || 1;
          if (!this.target || this.steerT <= 0) { const wig = Math.sin(G.time * 0.7 + this.phase * 10) * 0.6; const ang = Math.atan2(az, ax) + wig; this.target = V(this.x + Math.cos(ang) * 30, 0, this.z + Math.sin(ang) * 30); }
          this.targetSpeed = sp.run * (this.hp < this.maxHp ? 0.85 : 1);
          if (this.stateT <= 0 && (d > 60 || !this.lastSenseSee)) { this.state = 'walk'; this.stateT = 6; this.aware = 0.4; this.target = V(this.x + ax / al * 20, 0, this.z + az / al * 20); }
          break;
        }
        case 'investigate': {
          this.targetSpeed = sp.walk * 2.4;
          if (this.aware > 1) { this.aggro(); break; }
          if (!this.target || Math.hypot(this.target.x - this.x, this.target.z - this.z) < 3 || this.stateT <= 0) { this.state = 'walk'; this.stateT = 5; this.target = V(this.x + (Math.random() - 0.5) * 30, 0, this.z + (Math.random() - 0.5) * 30); }
          break;
        }
        case 'rear': { // urso se ergue e ruge antes de atacar
          this.targetSpeed = 0;
          if (this.stateT <= 0) { this.state = 'chase'; this.stateT = 30; }
          break;
        }
        case 'chase': case 'charge': {
          const charge = this.state === 'charge';
          let tx = pl.pos.x, tz = pl.pos.z;
          if (this.type === 'wolf' && d > 7) { const a = Math.atan2(this.z - pl.pos.z, this.x - pl.pos.x) + this.flankAng * Math.min(1, d / 25); const r = Math.min(d * 0.55, 10); tx = pl.pos.x + Math.cos(a) * r; tz = pl.pos.z + Math.sin(a) * r; }
          this.target = V(tx, 0, tz);
          this.targetSpeed = charge ? sp.run * 1.05 : sp.run * (d < 12 ? 0.95 : 1);
          // lobos: cercam a presa e mordem alternadamente (bate-e-recua)
          if (this.type === 'wolf' && d < 7 && (this.attackCd > 0 || this.mgr.attacking() >= 2)) {
            const a = Math.atan2(this.z - pl.pos.z, this.x - pl.pos.x) + (this.flankAng >= 0 ? 0.9 : -0.9);
            this.target = V(pl.pos.x + Math.cos(a) * 4.8, 0, pl.pos.z + Math.sin(a) * 4.8);
            this.targetSpeed = sp.run * 0.55;
          }
          if (this.lastSenseSee || d < 25) this.lostT = 0; else this.lostT += dt;
          if (d > 110 || this.lostT > 10) { this.state = 'walk'; this.stateT = 8; this.aware = 0.3; break; }
          this.attackCd -= dt;
          if (d < sp.reach + this.radius * 0.5 && this.attackCd <= 0 && (this.type !== 'wolf' || this.mgr.attacking() < 2)) { this.state = 'attack'; this.attackT = 0; this.hitDone = false; this.wasCharge = charge; }
          if (charge && this.stateT <= 0 && d > 30) { this.state = 'walk'; this.stateT = 6; this.aware = 0; }
          if (this.soundT <= 0) { this.soundT = 2 + Math.random() * 4; if (this.type === 'wolf') this.mgr.audio.snarl(this.pos, false); else if (this.type === 'bear') this.mgr.audio.growl(this.pos, true); else if (this.type === 'boar') this.mgr.audio.grunt(this.pos); }
          break;
        }
        case 'attack': {
          this.attackT += dt;
          const wind = this.type === 'bear' ? 0.45 : 0.28;
          this.targetSpeed = this.wasCharge ? sp.run * 0.8 : 0;
          if (!this.hitDone && this.attackT > wind) {
            this.hitDone = true;
            if (d < sp.reach + 0.7 && pl.alive) {
              const dmg = sp.dmg[0] + Math.random() * (sp.dmg[1] - sp.dmg[0]);
              G.damagePlayer(dmg, this, this.type === 'boar' ? 7 : this.type === 'bear' ? 6 : 2.5);
              if (this.type === 'wolf') this.mgr.audio.snarl(this.pos, false); else this.mgr.audio.snarl(this.pos, true);
            }
          }
          if (this.attackT > wind + 0.4) { this.attackCd = sp.cd * (0.85 + Math.random() * 0.3); this.state = this.wasCharge ? 'charge' : 'chase'; this.stateT = this.wasCharge ? 22 : 30; if (this.wasCharge) { this.overrun = 1.1; this.heading += (Math.random() < 0.5 ? 1 : -1) * 0.55; this.attackCd = Math.max(this.attackCd, 2.2); } }
          break;
        }
      }
      this.soundT -= dt;
      if (this.soundT <= 0 && (this.state === 'idle' || this.state === 'walk' || this.state === 'graze')) {
        this.soundT = 12 + Math.random() * 25;
        if (this.type === 'wolf' && Math.random() < 0.35) this.mgr.audio.howl(this.pos);
        else if (this.type === 'boar') this.mgr.audio.grunt(this.pos);
        else if (this.type === 'bear' && Math.random() < 0.3) this.mgr.audio.growl(this.pos, true);
      }
    }

    // -------------------------------------------------- locomoção
    steer(dt, G) {
      if (!this.target) return this.heading;
      let desired = Math.atan2(-(this.target.z - this.z), this.target.x - this.x);
      if (this.overrun > 0) desired = this.heading;
      this.steerT -= dt;
      if (this.steerT <= 0 || this.steerCache === undefined) {
        this.steerT = 0.12;
        const look = 1.2 + this.speed * 0.35 + this.radius;
        const offs = [0, 0.35, -0.35, 0.75, -0.75, 1.15, -1.15, 1.6, -1.6, 2.2, -2.2];
        let best = desired;
        for (const o of offs) {
          const a = desired + o, px = this.x + Math.cos(a) * look, pz = this.z - Math.sin(a) * look;
          const mx = this.x + Math.cos(a) * look * 0.5, mz = this.z - Math.sin(a) * look * 0.5;
          if (Math.abs(px) > 192 || Math.abs(pz) > 192) continue;
          if (HZ.isWater(px, pz, 0.15)) continue;
          const y = HZ.heightAt(px, pz);
          if (G.physics.isBlocked(px, pz, this.radius, y, 0.45) || G.physics.isBlocked(mx, mz, this.radius, HZ.heightAt(mx, mz), 0.45)) continue;
          best = a; break;
        }
        this.steerCache = best - desired;
      }
      return desired + this.steerCache;
    }

    update(dt, G) {
      const pl = G.player;
      const dx = pl.pos.x - this.x, dz = pl.pos.z - this.z, d = Math.hypot(dx, dz);
      this.distToPlayer = d;
      if (this.dead) { this.updateDeath(dt, G); return; }
      // LOD: animais distantes pensam menos
      this.lodAcc = (this.lodAcc || 0) + dt;
      const far = d > 140;
      if (far && this.lodAcc < 0.2) return;
      const ddt = far ? this.lodAcc : dt; this.lodAcc = 0;
      this.root.visible = d < 230;
      if (this.bleed > 0) {
        this.hp -= this.bleed * ddt;
        this.dripT -= ddt;
        if (this.dripT <= 0 && Math.hypot(this.x - this.lastDrip.x, this.z - this.lastDrip.z) > 0.9) { this.dripT = 0.25; this.lastDrip.set(this.x, 0, this.z); G.effects.groundDecal(this.x + (Math.random() - 0.5) * 0.3, this.z + (Math.random() - 0.5) * 0.3, 0.1 + Math.random() * 0.12, 0, 0.8); }
        if (this.hp <= 0) { this.die(null, 'body'); return; }
      }
      this.think(ddt, G, d);
      if (this.stagger > 0) this.stagger -= ddt;
      if (this.overrun > 0) this.overrun -= ddt;
      // direção
      let desired = this.heading;
      if (this.state === 'attack' || this.state === 'rear' || this.alertLook) desired = Math.atan2(-dz, dx);
      else if (this.target && this.targetSpeed > 0) desired = this.steer(ddt, G);
      const turnRate = this.sp.turn * (this.speed > this.sp.walk * 2 ? 1.3 : 1);
      const diff = HZ.angleDiff(this.heading, desired);
      this.heading += HZ.clamp(diff, -turnRate * ddt, turnRate * ddt);
      // velocidade (freia para virar)
      const tgt = this.targetSpeed * (Math.abs(diff) > 1.4 ? 0.4 : 1) * (this.stagger > 0 ? 0.3 : 1);
      const acc = tgt > this.speed ? 7 : 10;
      this.speed += HZ.clamp(tgt - this.speed, -acc * ddt, acc * ddt);
      if (this.speed > 0.01) {
        const p = { x: this.x, y: this.y, z: this.z };
        const r = G.physics.moveCircle(p, Math.cos(this.heading) * this.speed * ddt, -Math.sin(this.heading) * this.speed * ddt, this.radius, 0.45, 194);
        if (HZ.isWater(p.x, p.z, -0.1)) { p.x = this.x; p.z = this.z; }
        const moved = Math.hypot(p.x - this.x, p.z - this.z);
        if (moved < this.speed * ddt * 0.3 && (r.blockedX || r.blockedZ)) { this.stuck = (this.stuck || 0) + ddt; if (this.stuck > 0.6) { this.steerT = 0; this.heading += (Math.random() < 0.5 ? 1 : -1) * 1.3; this.stuck = 0; } }
        this.x = p.x; this.z = p.z; this.y = r.ground;
      } else this.y = G.physics.groundAt(this.x, this.z, this.radius * 0.5);
      // não atravessar o jogador
      if (d < this.radius + 0.45 && d > 0.01) { const push = this.radius + 0.45 - d; this.x -= (dx / d) * push; this.z -= (dz / d) * push; }
      this.animate(ddt, G);
    }

    animate(dt, G) {
      const sp = this.sp, spd = this.speed / this.scale;
      this.root.position.set(this.x, this.y, this.z);
      this.root.rotation.y = this.heading;
      // inclinação com o terreno
      const L = this.len * 0.45, cx = Math.cos(this.heading), cz = -Math.sin(this.heading);
      const hf = HZ.heightAt(this.x + cx * L, this.z + cz * L), hb = HZ.heightAt(this.x - cx * L, this.z - cz * L);
      this.pitch += (Math.atan2(hf - hb, 2 * L) - this.pitch) * Math.min(1, dt * 6);
      // marcha
      let gait;
      if (sp.hop && spd > 0.3) gait = GAITS.bound;
      else if (spd < sp.walk * 1.5) gait = GAITS.walk;
      else if (spd < sp.run * 0.55) gait = GAITS.trot;
      else gait = GAITS.gallop;
      const legLen = sp.front.up + sp.front.lo;
      const stride = gait.stride * legLen;
      this.phase = (this.phase + (spd / stride) * dt) % 1;
      const amp = Math.min(1, spd / (sp.walk * 0.8));
      const k = Math.min(1, dt * 14);
      let bob = 0, pitchOsc = 0, rear = 0;
      if (this.state === 'rear') rear = Math.min(1, (1.9 - this.stateT) * 2.5) * (this.stateT > 0.25 ? 1 : this.stateT / 0.25);
      this.legs.forEach((Lg, i) => {
        const th = TAU * (this.phase + gait.off[i]);
        const swing = Math.max(0, Math.cos(th));
        let h = Lg.rest[0] + gait.A * amp * Math.sin(th);
        let kk = Lg.rest[1] + (Lg.front ? -1 : 1) * gait.K * amp * swing * (Lg.front ? 1 : 0.7);
        if (rear) { if (Lg.front) { h = h * (1 - rear) + (0.2 + Math.sin(G.time * 5 + i) * 0.15) * rear; kk = kk * (1 - rear) - 0.9 * rear; } else { h -= 1.0 * rear; kk += 0.25 * rear; } }
        if (this.state === 'attack' && this.type === 'bear' && Lg.front && Lg.sd > 0) { const t = HZ.clamp(this.attackT / 0.45, 0, 1); h += Math.sin(t * Math.PI) * 1.3; kk -= Math.sin(t * Math.PI) * 0.6; }
        Lg.h += (h - Lg.h) * k; Lg.k += (kk - Lg.k) * k;
        Lg.hip.rotation.z = Lg.h; Lg.knee.rotation.z = Lg.k;
      });
      if (gait === GAITS.gallop || gait === GAITS.bound) { pitchOsc = Math.sin(TAU * this.phase) * 0.07 * amp; bob = Math.max(0, Math.sin(TAU * this.phase)) * 0.06 * amp * legLen; }
      else bob = Math.abs(Math.sin(TAU * this.phase * 2)) * 0.012 * amp * legLen;
      if (sp.hop && spd > 0.3) bob = Math.max(0, Math.sin(TAU * this.phase)) * 0.12 * Math.min(1, spd / 2);
      this.rig.rotation.z = this.pitch + pitchOsc + rear * 0.95;
      const hx = sp.hind.x;
      this.rig.position.set(rear ? hx - hx * Math.cos(rear * 0.95) : 0, bob + (rear ? -hx * Math.sin(rear * 0.95) : 0), 0);
      // cabeça
      let nt = 0, ny = 0;
      if (this.state === 'graze') nt = sp.graze + Math.sin(G.time * 1.3 + this.phase * 20) * 0.05;
      else if (this.state === 'flee' || this.state === 'chase' || this.state === 'charge') nt = this.type === 'deer' ? -0.15 : -0.3;
      else if (this.state === 'attack') { const t = this.attackT; nt = this.type === 'boar' ? -0.4 + Math.sin(Math.min(1, t / 0.4) * Math.PI) * 0.9 : -0.25 + Math.sin(Math.min(1, t / 0.35) * Math.PI) * 0.35; }
      else if (this.alertLook) { nt = 0.12; const dd = Math.atan2(-(G.player.pos.z - this.z), G.player.pos.x - this.x); ny = HZ.clamp(HZ.angleDiff(this.heading, dd), -0.9, 0.9); }
      else if (this.state === 'rear') nt = 0.35;
      if (gait === GAITS.gallop) nt += Math.sin(TAU * this.phase + 1) * 0.08 * amp;
      this.neckPivot.rotation.z += (nt - this.neckPivot.rotation.z) * Math.min(1, dt * 4);
      this.neckYaw += (ny - this.neckYaw) * Math.min(1, dt * 5);
      this.neckPivot.rotation.y = this.neckYaw;
      // cauda
      const tailUp = this.type === 'deer' && this.state === 'flee' ? 0.9 : this.type === 'wolf' && (this.state === 'chase' || this.state === 'attack') ? 0.35 : 0;
      this.tailPivot.rotation.z += (tailUp - this.tailPivot.rotation.z) * Math.min(1, dt * 5);
      this.tailPivot.rotation.x = Math.sin(G.time * (this.type === 'deer' ? 3 : 1.5) + this.phase * 9) * 0.15;
      // respiração
      const br = 1 + Math.sin(G.time * (this.speed > 3 ? 7 : 2) + this.phase * 5) * (this.speed > 3 ? 0.02 : 0.008);
      this.body.scale.set(1, br, br);
      if (this.stagger > 0) this.rig.rotation.x = Math.sin(this.stagger * 30) * 0.08;
      else this.rig.rotation.x *= 0.9;
    }

    // -------------------------------------------------- morte: tombar de lado
    updateDeath(dt, G) {
      if (this.settled) return;
      this.root.position.set(this.x, this.y, this.z);
      const target = Math.PI / 2;
      // pêndulo invertido: acelera ao cair, quica levemente ao tocar o chão
      this.fallW += (4.5 / Math.max(0.5, this.bodyH)) * Math.sin(this.fallA + 0.25) * dt;
      this.fallA += this.fallW * dt;
      if (this.fallA >= target) {
        this.fallA = target;
        if (Math.abs(this.fallW) > 0.8) { if (!this.thudDone) { this.thudDone = true; this.mgr.audio.thud(this.pos, this.sp.big); G.effects.impact('terrain', V(this.x, this.y, this.z), V(0, 1, 0)); } this.fallW = -this.fallW * 0.22; }
        else { this.fallW = 0; this.settleT = (this.settleT || 0) + dt; }
      }
      const a = this.fallA / target;
      this.fall.rotation.x = this.fallSide * this.fallA;
      const w = this.sp.front.z * 1.1;
      this.fall.position.y = a * Math.max(0.02, this.bodyB / this.scale - w + 0.03);
      this.rig.rotation.z += (this.pitch * 0.5 - this.rig.rotation.z) * Math.min(1, dt * 3);
      this.rig.position.y *= 0.9;
      const k = Math.min(1, dt * 3);
      this.legs.forEach((Lg, i) => { const R = this.relax[i]; Lg.h += (R.h - Lg.h) * k; Lg.k += (R.k - Lg.k) * k; Lg.hip.rotation.z = Lg.h; Lg.knee.rotation.z = Lg.k; Lg.hip.rotation.x = this.fallSide * 0.12 * a * (Lg.sd * this.fallSide > 0 ? -1 : 1); });
      // cabeça e pescoço pendem até o chão
      this.neckPivot.rotation.z += (-0.25 - this.neckPivot.rotation.z) * k;
      this.neckPivot.rotation.x = this.fallSide * 0.35 * a;
      this.neckPivot.rotation.y *= 0.95;
      this.tailPivot.rotation.z *= 0.95;
      this.body.scale.set(1, 1, 1);
      if (this.settleT > 0.6) {
        this.settled = true;
        this.fall.rotation.x = this.fallSide * target;
        this.root.updateMatrixWorld(true);
        this.bloodyCorpse();
      }
    }

    dispose(scene) { scene.remove(this.root); }
  }

  // ------------------------------------------------------------------ gerenciador
  class AnimalManager {
    constructor(scene, physics, effects, audio) {
      this.scene = scene; this.physics = physics; this.effects = effects; this.audio = audio;
      this.list = []; this.playerPos = V(); this.onKillCb = null;
      this.ray = new THREE.Raycaster();
    }
    spawnAll(avoid) {
      this.list.forEach(a => a.dispose(this.scene));
      this.list = [];
      const rnd = Math.random;
      const plan = [['deer', 12, 30], ['boar', 5, 55], ['fox', 5, 30], ['rabbit', 7, 22], ['wolf', 6, 85], ['bear', 2, 110]];
      let pack = 0;
      for (const [type, n, minD] of plan) {
        let packCenter = null;
        for (let i = 0; i < n; i++) {
          if (type === 'wolf' && i % 3 === 0) { packCenter = this.findSpot(avoid, minD, rnd); pack++; }
          let p;
          if (type === 'wolf') { for (let t = 0; t < 30; t++) { const a = rnd() * TAU, r = 2 + rnd() * 6, x = packCenter.x + Math.cos(a) * r, z = packCenter.z + Math.sin(a) * r; if (this.okSpot(x, z, 0.5)) { p = { x, z }; break; } } p = p || packCenter; }
          else p = this.findSpot(avoid, minD, rnd);
          const a = new Animal(type, this, p.x, p.z, rnd);
          if (type === 'wolf') a.pack = pack;
          this.scene.add(a.root); this.list.push(a);
        }
      }
    }
    okSpot(x, z, r) {
      if (Math.abs(x) > 185 || Math.abs(z) > 185) return false;
      if (HZ.isWater(x, z, 0.3)) return false;
      return !this.physics.isBlocked(x, z, r + 0.3, HZ.heightAt(x, z), 0.3);
    }
    findSpot(avoid, minD, rnd) {
      for (let t = 0; t < 200; t++) {
        const x = (rnd() - 0.5) * 360, z = (rnd() - 0.5) * 360;
        if (Math.hypot(x - avoid.x, z - avoid.z) < minD) continue;
        if (this.okSpot(x, z, 0.6)) return { x, z };
      }
      return { x: 100, z: 100 };
    }
    attacking() { let n = 0; for (const a of this.list) if (a.state === 'attack' && !a.dead) n++; return n; }
    alertPack(src) { for (const a of this.list) if (a !== src && a.pack === src.pack && !a.dead && a.pos.distanceTo(src.pos) < 70) a.aggro(true); }
    onKill(a, zone) { if (this.onKillCb) this.onKillCb(a, zone); }
    gunshot(p) { for (const a of this.list) { const d = Math.hypot(a.x - p.x, a.z - p.z); a.hearShot(p, d); } }
    get alive() { return this.list.filter(a => !a.dead); }
    get threats() { return this.list.filter(a => !a.dead && (a.state === 'chase' || a.state === 'attack' || a.state === 'charge' || a.state === 'rear')); }

    raycast(origin, dir, maxDist) {
      this.ray.set(origin, dir); this.ray.far = maxDist;
      const cand = [];
      for (const a of this.list) {
        if (!a.root.visible) continue;
        // pré-filtro por distância ao raio
        _v.set(a.x - origin.x, a.y + a.bodyH * 0.8 - origin.y, a.z - origin.z);
        const t = _v.dot(dir); if (t < 0 || t > maxDist + 3) continue;
        const dist2 = _v.lengthSq() - t * t; const R = a.len + 1.2;
        if (dist2 > R * R) continue;
        cand.push(...a.meshes);
      }
      if (!cand.length) return null;
      const hits = this.ray.intersectObjects(cand, false);
      return hits.length ? hits[0] : null;
    }

    update(dt, G) {
      this.playerPos.copy(G.player.pos);
      for (const a of this.list) a.update(dt, G);
      // separação entre animais vivos
      const L = this.list;
      for (let i = 0; i < L.length; i++) {
        const a = L[i]; if (a.dead) continue;
        for (let j = i + 1; j < L.length; j++) {
          const b = L[j]; if (b.dead) continue;
          const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, min = a.radius + b.radius;
          if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2), push = (min - d) * 0.5; a.x -= dx / d * push; a.z -= dz / d * push; b.x += dx / d * push; b.z += dz / d * push; }
        }
      }
    }
  }

  HZ.Animal = Animal;
  HZ.AnimalManager = AnimalManager;
})();
