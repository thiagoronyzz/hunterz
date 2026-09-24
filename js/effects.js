/* HUNTERZ — efeitos: partículas, decalques de sangue, marcas de impacto, cápsulas,
   raios de sol volumétricos, poeira no ar, folhas caindo, pássaros, chuva e pós-processamento. */
(function () {
  'use strict';
  const HZ = window.HZ;
  const THREE = window.THREE;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // ================================================================ PARTÍCULAS
  const PVS = `
    attribute vec4 aColor; attribute float aSize; varying vec4 vColor; varying float vDepth; uniform float uScale;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; vColor = aColor; }`;
  const PFS = `
    uniform sampler2D uMap; uniform vec3 uFogC; uniform float uFogD; varying vec4 vColor; varying float vDepth;
    void main(){ vec4 t = texture2D(uMap, gl_PointCoord); float a = vColor.a * t.a; if (a < 0.01) discard;
      float f = 1.0 - exp(-uFogD * uFogD * vDepth * vDepth); gl_FragColor = vec4(mix(vColor.rgb, uFogC, f), a); }`;

  class Particles {
    constructor(scene, map, N, blending) {
      this.N = N; this.i = 0;
      this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 4); this.size = new Float32Array(N);
      this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.max = new Float32Array(N);
      this.grav = new Float32Array(N); this.drag = new Float32Array(N); this.grow = new Float32Array(N); this.a0 = new Float32Array(N); this.kind = new Uint8Array(N);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
      this.uniforms = { uMap: { value: map }, uScale: { value: 600 }, uFogC: { value: new THREE.Color() }, uFogD: { value: 0.005 } };
      const m = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false, blending: blending || THREE.NormalBlending });
      this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.renderOrder = 5;
      scene.add(this.points);
      this.onLand = null;
    }
    emit(p, v, color, size, life, o = {}) {
      const i = this.i; this.i = (this.i + 1) % this.N;
      this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
      this.col.set([color[0], color[1], color[2], color[3]], i * 4); this.a0[i] = color[3];
      this.size[i] = size; this.life[i] = life; this.max[i] = life;
      this.grav[i] = o.grav !== undefined ? o.grav : 9.8; this.drag[i] = o.drag || 0; this.grow[i] = o.grow || 0; this.kind[i] = o.kind || 0;
    }
    update(dt) {
      const P = this.pos, Vv = this.vel;
      for (let i = 0; i < this.N; i++) {
        if (this.life[i] <= 0) { if (this.size[i]) this.size[i] = 0; continue; }
        this.life[i] -= dt;
        const k = i * 3;
        Vv[k + 1] -= this.grav[i] * dt;
        const dr = Math.max(0, 1 - this.drag[i] * dt);
        Vv[k] *= dr; Vv[k + 1] *= dr; Vv[k + 2] *= dr;
        P[k] += Vv[k] * dt; P[k + 1] += Vv[k + 1] * dt; P[k + 2] += Vv[k + 2] * dt;
        this.size[i] += this.grow[i] * dt;
        const t = this.life[i] / this.max[i];
        this.col[i * 4 + 3] = this.a0[i] * Math.min(1, t * 2.5);
        if (this.grav[i] > 0) {
          const g = HZ.heightAt(P[k], P[k + 2]);
          if (P[k + 1] < g + 0.02) {
            if (this.kind[i] === 1 && this.onLand) this.onLand(P[k], P[k + 2]);
            this.life[i] = 0; this.size[i] = 0;
          }
        }
        if (this.life[i] <= 0) this.size[i] = 0;
      }
      const g = this.points.geometry;
      g.attributes.position.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
    }
  }

  // ================================================================ EFEITOS
  class Effects {
    constructor(scene, camera, world) {
      this.scene = scene; this.camera = camera; this.world = world;
      const tx = HZ.tx;
      this.parts = new Particles(scene, tx.soft, 1400);
      this.smoke = new Particles(scene, tx.smoke, 220);
      this.parts.onLand = (x, z) => { if (Math.random() < 0.35) this.groundDecal(x, z, 0.08 + Math.random() * 0.14, 0, 0.9); };

      // decalques de sangue no chão
      const bloodMat = new THREE.MeshStandardMaterial({ map: tx.blood, alphaMap: tx.bloodA, alphaTest: 0.45, roughness: 0.3, metalness: 0.0, color: new THREE.Color().setRGB(2.4, 1.0, 1.0), polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, envMapIntensity: 0.3 });
      this.bloodMat = bloodMat;
      const dg = new THREE.PlaneGeometry(1, 1); dg.rotateX(-Math.PI / 2);
      this.decalN = 420; this.decalI = 0;
      this.decals = new THREE.InstancedMesh(dg, bloodMat, this.decalN);
      this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.decals.count = 0; this.decals.frustumCulled = false; this.decals.receiveShadow = true;
      scene.add(this.decals);
      this.growing = [];
      this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._s = V(); this._p = V(); this._n = V();

      // marcas de bala em árvores/rochas
      const hm = new THREE.MeshBasicMaterial({ map: tx.soft, color: 0x000000, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      this.holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), hm, 120);
      this.holes.count = 0; this.holes.frustumCulled = false; this.holeI = 0;
      scene.add(this.holes);

      // sangue no corpo dos animais
      this.bodyBloodGeo = new THREE.CircleGeometry(0.5, 14);
      this.bodyBloodMat = new THREE.MeshStandardMaterial({ map: tx.blood, alphaMap: tx.bloodA, alphaTest: 0.4, roughness: 0.45, color: new THREE.Color().setRGB(1.8, 0.8, 0.8), envMapIntensity: 0.15, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, side: THREE.DoubleSide });

      // cápsulas
      const brass = new THREE.MeshStandardMaterial({ color: 0xc9a55a, metalness: 0.9, roughness: 0.28 });
      const cg = new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8); cg.rotateZ(Math.PI / 2);
      this.casings = [];
      for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(cg, brass); m.visible = false; m.castShadow = false; scene.add(m); this.casings.push({ m, v: V(), w: V(), life: 0, rest: false }); }
      this.casingI = 0;

      this.buildShafts();
      this.buildDust();
      this.buildLeaves();
      this.buildBirds();
      this.buildRain();
      this.flashLight = new THREE.PointLight(0xffc27a, 0, 14, 2); scene.add(this.flashLight);
    }

    // ------------------------------------------------ sangue / impactos
    bloodSpray(p, dir, amount = 1) {
      for (let i = 0; i < 26 * amount; i++) {
        const v = V(dir.x + (Math.random() - 0.5) * 0.9, dir.y + Math.random() * 0.7, dir.z + (Math.random() - 0.5) * 0.9).normalize().multiplyScalar(1.5 + Math.random() * 4.5);
        const c = 0.18 + Math.random() * 0.2;
        this.parts.emit(p, v, [c, 0.004, 0.004, 0.95], 0.025 + Math.random() * 0.05, 0.9 + Math.random() * 0.6, { grav: 9.8, drag: 0.6, kind: 1 });
      }
      for (let i = 0; i < 6 * amount; i++) {
        const v = V(dir.x + (Math.random() - 0.5), dir.y + Math.random() * 0.4, dir.z + (Math.random() - 0.5)).multiplyScalar(0.6);
        this.parts.emit(p, v, [0.25, 0.01, 0.01, 0.35], 0.12, 0.5, { grav: 0.5, drag: 2, grow: 0.5 });
      }
    }
    impact(kind, p, n) {
      if (kind === 'terrain') {
        for (let i = 0; i < 14; i++) { const v = V(n.x + (Math.random() - 0.5), n.y * 1.5 + Math.random(), n.z + (Math.random() - 0.5)).multiplyScalar(1 + Math.random() * 3); this.parts.emit(p, v, [0.14, 0.11, 0.08, 0.9], 0.02 + Math.random() * 0.04, 0.8, { grav: 9.8, drag: 0.5 }); }
        for (let i = 0; i < 5; i++) this.smoke.emit(p, V((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6), [0.3, 0.26, 0.2, 0.45], 0.25, 1.6, { grav: -0.05, drag: 1.2, grow: 0.9 });
      } else if (kind === 'rock') {
        for (let i = 0; i < 10; i++) { const v = V(n.x + (Math.random() - 0.5), n.y + Math.random(), n.z + (Math.random() - 0.5)).multiplyScalar(2 + Math.random() * 5); this.parts.emit(p, v, [0.35, 0.34, 0.32, 1], 0.015 + Math.random() * 0.03, 0.6, { grav: 9.8 }); }
        for (let i = 0; i < 3; i++) this.parts.emit(p, V().copy(n).multiplyScalar(2 + Math.random() * 3), [2.5, 1.7, 0.8, 1], 0.02, 0.12, { grav: 3 });
        for (let i = 0; i < 4; i++) this.smoke.emit(p, V((Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4).addScaledVector(n, 0.5), [0.45, 0.44, 0.42, 0.4], 0.2, 1.3, { grav: -0.05, drag: 1.2, grow: 0.7 });
        this.hole(p, n, 0.05);
      } else if (kind === 'tree' || kind === 'wood') {
        for (let i = 0; i < 12; i++) { const v = V(n.x + (Math.random() - 0.5) * 0.8, n.y + Math.random() * 0.8, n.z + (Math.random() - 0.5) * 0.8).multiplyScalar(2 + Math.random() * 3); this.parts.emit(p, v, [0.32, 0.22, 0.13, 1], 0.02 + Math.random() * 0.03, 0.9, { grav: 9.8, drag: 0.4 }); }
        this.smoke.emit(p, V().copy(n).multiplyScalar(0.3), [0.4, 0.35, 0.3, 0.35], 0.18, 1, { grav: -0.05, drag: 1.5, grow: 0.5 });
        this.hole(p, n, 0.045);
      }
    }
    hole(p, n, s) {
      const i = this.holeI; this.holeI = (this.holeI + 1) % 120;
      this._q.setFromUnitVectors(V(0, 0, 1), n);
      this._m.compose(this._p.copy(p).addScaledVector(n, 0.01), this._q, this._s.set(s, s, s));
      this.holes.setMatrixAt(i, this._m); this.holes.count = Math.max(this.holes.count, i + 1); this.holes.instanceMatrix.needsUpdate = true;
    }
    muzzleSmoke(p, dir) {
      for (let i = 0; i < 7; i++) this.smoke.emit(V().copy(p).addScaledVector(dir, i * 0.08), V().copy(dir).multiplyScalar(1.2 + Math.random()).add(V((Math.random() - 0.5) * 0.3, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3)), [0.62, 0.62, 0.6, 0.22], 0.12 + i * 0.03, 2 + Math.random(), { grav: -0.08, drag: 1.6, grow: 0.8 });
      this.flashLight.position.copy(p); this.flashLight.intensity = 40; this.flashT = 0.06;
    }

    // decalque no chão; grow>0 faz a poça crescer até "size"
    groundDecal(x, z, size, grow = 0, dark = 1) {
      const i = this.decalI; this.decalI = (this.decalI + 1) % this.decalN;
      const y = HZ.heightAt(x, z) + 0.015;
      HZ.groundNormal(x, z, this._n);
      this._q.setFromUnitVectors(V(0, 1, 0), this._n).multiply(this._q2.setFromAxisAngle(V(0, 1, 0), Math.random() * 6.28));
      const s0 = grow ? size * 0.12 : size;
      this._m.compose(this._p.set(x, y, z), this._q, this._s.set(s0, 1, s0));
      this.decals.setMatrixAt(i, this._m);
      if (this.decals.instanceColor === null) { this.decals.setColorAt(0, new THREE.Color(1, 1, 1)); for (let k = 1; k < this.decalN; k++) this.decals.setColorAt(k, new THREE.Color(1, 1, 1)); }
      this.decals.setColorAt(i, new THREE.Color().setRGB(dark, dark, dark));
      this.decals.instanceColor.needsUpdate = true;
      this.decals.count = Math.max(this.decals.count, i + 1);
      this.decals.instanceMatrix.needsUpdate = true;
      this.growing = this.growing.filter(g => g.i !== i);
      if (grow) this.growing.push({ i, x, y, z, q: this._q.clone(), s: s0, target: size, rate: grow });
    }

    // mancha de sangue presa a uma parte do corpo (segue a animação)
    bodyBlood(mesh, localPoint, localNormal, size) {
      const d = new THREE.Mesh(this.bodyBloodGeo, this.bodyBloodMat);
      d.position.copy(localPoint).addScaledVector(localNormal, 0.006);
      d.quaternion.setFromUnitVectors(V(0, 0, 1), localNormal);
      d.rotateZ(Math.random() * 6.28);
      d.scale.set(size, size * (0.7 + Math.random() * 0.6), size);
      d.userData.decal = true;
      mesh.add(d);
      return d;
    }

    ejectCasing(p, right, up) {
      const c = this.casings[this.casingI]; this.casingI = (this.casingI + 1) % this.casings.length;
      c.m.position.copy(p); c.m.visible = true; c.life = 25; c.rest = false;
      c.v.copy(right).multiplyScalar(2.2 + Math.random()).addScaledVector(up, 1.8 + Math.random());
      c.w.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    }

    // ------------------------------------------------ raios de sol
    buildShafts() {
      const g = new THREE.BufferGeometry(); const pos = [], uv = [], idx = [];
      for (let k = 0; k < 2; k++) {
        const a = (k * Math.PI) / 2, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = pos.length / 3;
        pos.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz); uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      this.shaftU = { uI: { value: 0.07 }, uTime: { value: 0 }, uColor: { value: new THREE.Color().setRGB(1, 0.86, 0.6) } };
      const m = new THREE.ShaderMaterial({
        uniforms: this.shaftU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: `varying vec2 vUv; varying float vFade; void main(){ vUv = uv; vec4 wp = modelMatrix * instanceMatrix * vec4(position,1.0); float d = distance(wp.xyz, cameraPosition); vFade = smoothstep(2.5, 9.0, d) * (1.0 - smoothstep(45.0, 75.0, d)); gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: `uniform float uI; uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying float vFade;
          void main(){ float edge = sin(vUv.x * 3.14159); edge = pow(edge, 2.2); float len = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.8, 1.0, vUv.y));
            float flick = 0.75 + 0.25 * sin(uTime * 0.7 + vUv.y * 6.0 + vUv.x * 3.0);
            gl_FragColor = vec4(uColor * uI * edge * len * vFade * flick, 1.0); }`,
      });
      this.shafts = new THREE.InstancedMesh(g, m, 26); this.shafts.count = 0; this.shafts.frustumCulled = false; this.shafts.renderOrder = 6;
      this.scene.add(this.shafts);
      this.shaftTimer = 0;
    }
    updateShafts(cam, sunDir, on) {
      this.shafts.visible = on;
      if (!on) return;
      const C = 11, px = cam.position.x, pz = cam.position.z;
      const cx0 = Math.floor(px / C), cz0 = Math.floor(pz / C);
      let k = 0;
      const q = this._q.setFromUnitVectors(V(0, 1, 0), sunDir);
      for (let dx = -5; dx <= 5 && k < 26; dx++) for (let dz = -5; dz <= 5 && k < 26; dz++) {
        const cx = cx0 + dx, cz = cz0 + dz;
        const h = HZ.hash2(cx, cz, 99);
        const x = cx * C + HZ.hash2(cx, cz, 98) * C, z = cz * C + HZ.hash2(cx, cz, 97) * C;
        const D = HZ.forestDensity(x, z);
        if (h > 0.2 + D * 0.25 || D < 0.35) continue;
        const L = 26 + h * 10, w = 1 + HZ.hash2(cx, cz, 96) * 2.4;
        this._m.compose(this._p.set(x, HZ.heightAt(x, z) - 0.5, z), q, this._s.set(w, L, w));
        this.shafts.setMatrixAt(k++, this._m);
      }
      this.shafts.count = k; this.shafts.instanceMatrix.needsUpdate = true;
    }

    // ------------------------------------------------ poeira / pólen
    buildDust() {
      const N = 420; this.dustN = N;
      const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N);
      for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 24; pos[i * 3 + 1] = Math.random() * 8; pos[i * 3 + 2] = (Math.random() - 0.5) * 24; col.set([1.4, 1.25, 0.9, 0.35 + Math.random() * 0.35], i * 4); size[i] = 0.018 + Math.random() * 0.025; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 4)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      this.dustU = { uMap: { value: HZ.tx.soft }, uScale: { value: 600 }, uFogC: { value: new THREE.Color() }, uFogD: { value: 0.005 } };
      this.dust = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.dustU, vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.dust.frustumCulled = false; this.scene.add(this.dust);
      this.dustPhase = new Float32Array(N).map(() => Math.random() * 100);
    }
    updateDust(dt, t, cam) {
      const p = this.dust.geometry.attributes.position.array, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
      for (let i = 0; i < this.dustN; i++) {
        const k = i * 3, ph = this.dustPhase[i];
        p[k] += (Math.sin(t * 0.3 + ph) * 0.12 + 0.08) * dt; p[k + 1] += Math.sin(t * 0.5 + ph * 2) * 0.05 * dt; p[k + 2] += Math.cos(t * 0.25 + ph) * 0.1 * dt;
        if (p[k] < cx - 12) p[k] += 24; else if (p[k] > cx + 12) p[k] -= 24;
        if (p[k + 2] < cz - 12) p[k + 2] += 24; else if (p[k + 2] > cz + 12) p[k + 2] -= 24;
        if (p[k + 1] < cy - 2.5) p[k + 1] += 7; else if (p[k + 1] > cy + 4.5) p[k + 1] -= 7;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }

    // ------------------------------------------------ folhas caindo
    buildLeaves() {
      const N = 50; this.leafN = N;
      const m = new THREE.MeshStandardMaterial({ map: HZ.tx.leaf, alphaMap: HZ.tx.leafA, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
      this.leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.09), m, N); this.leaves.frustumCulled = false;
      this.leafData = [];
      for (let i = 0; i < N; i++) this.leafData.push({ p: V((Math.random() - 0.5) * 30, Math.random() * 14, (Math.random() - 0.5) * 30), ph: Math.random() * 10, spd: 0.5 + Math.random() * 0.6, init: false });
      this.scene.add(this.leaves);
    }
    updateLeaves(dt, t, cam) {
      for (let i = 0; i < this.leafN; i++) {
        const L = this.leafData[i];
        if (!L.init) { L.p.x += cam.position.x; L.p.z += cam.position.z; L.p.y += HZ.heightAt(L.p.x, L.p.z); L.init = true; }
        L.p.y -= L.spd * dt; L.p.x += (Math.sin(t * 1.3 + L.ph) * 0.6 + 0.25) * dt; L.p.z += Math.cos(t * 1.1 + L.ph) * 0.5 * dt;
        const g = HZ.heightAt(L.p.x, L.p.z);
        if (L.p.y < g || Math.abs(L.p.x - cam.position.x) > 16 || Math.abs(L.p.z - cam.position.z) > 16) {
          L.p.set(cam.position.x + (Math.random() - 0.5) * 30, 0, cam.position.z + (Math.random() - 0.5) * 30);
          L.p.y = HZ.heightAt(L.p.x, L.p.z) + 8 + Math.random() * 8;
        }
        this._q.setFromEuler(new THREE.Euler(t * 2 + L.ph, t * 1.3 + L.ph * 2, Math.sin(t * 3 + L.ph)));
        this._m.compose(L.p, this._q, this._s.set(1, 1, 1));
        this.leaves.setMatrixAt(i, this._m);
      }
      this.leaves.instanceMatrix.needsUpdate = true;
    }

    // ------------------------------------------------ pássaros
    buildBirds() {
      const wing = new THREE.BufferGeometry();
      wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0, 0, 0.12, 0.55, 0.02, 0], 3));
      wing.computeVertexNormals();
      const body = new THREE.CapsuleGeometry(0.06, 0.25, 3, 6); body.rotateX(Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0x0c0c0c, side: THREE.DoubleSide });
      this.birds = [];
      for (let f = 0; f < 2; f++) {
        const c = V((Math.random() - 0.5) * 200, 45 + Math.random() * 20, (Math.random() - 0.5) * 200);
        for (let i = 0; i < 5; i++) {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(body, mat));
          const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat); r.scale.x = -1; g.add(l, r);
          g.scale.setScalar(1.6);
          this.scene.add(g);
          this.birds.push({ g, l, r, c, rad: 40 + Math.random() * 50, ang: Math.random() * 6.28, spd: 0.12 + Math.random() * 0.06, h: Math.random() * 8, ph: Math.random() * 6 });
        }
      }
    }
    updateBirds(dt, t) {
      for (const b of this.birds) {
        b.ang += b.spd * dt;
        const x = b.c.x + Math.cos(b.ang) * b.rad, z = b.c.z + Math.sin(b.ang) * b.rad;
        b.g.position.set(x, b.c.y + b.h + Math.sin(t * 0.5 + b.ph) * 3, z);
        b.g.rotation.y = -b.ang;
        const flap = Math.sin(t * 9 + b.ph) * 0.6 * (Math.sin(t * 0.4 + b.ph) > -0.3 ? 1 : 0.1);
        b.l.rotation.z = flap; b.r.rotation.z = -flap;
      }
    }

    // ------------------------------------------------ chuva
    buildRain() {
      const N = 5000; this.rainN = N;
      this.rainPos = new Float32Array(N * 6);
      for (let i = 0; i < N; i++) this.resetDrop(i, true);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color().setRGB(0.55, 0.6, 0.65), transparent: true, opacity: 0.32, depthWrite: false }));
      this.rain.visible = false; this.rain.frustumCulled = false; this.scene.add(this.rain);
    }
    resetDrop(i, initial) {
      const c = this.camera.position, a = i * 6;
      const x = c.x + (Math.random() - 0.5) * 50, z = c.z + (Math.random() - 0.5) * 50, y = c.y + (initial ? Math.random() * 30 - 5 : 22 + Math.random() * 8), L = 0.5 + Math.random() * 0.7;
      this.rainPos.set([x, y, z, x + 0.06, y - L, z + 0.02], a);
    }
    updateRain(dt, on) {
      this.rain.visible = on; if (!on) return;
      const p = this.rainPos;
      for (let i = 0; i < this.rainN; i++) {
        const a = i * 6, f = dt * (24 + (i % 9));
        p[a] -= dt * 1.8; p[a + 1] -= f; p[a + 2] += dt * 0.5; p[a + 3] -= dt * 1.8; p[a + 4] -= f; p[a + 5] += dt * 0.5;
        if (p[a + 4] < HZ.heightAt(p[a], p[a + 2])) {
          if (i % 7 === 0) this.parts.emit(V(p[a], p[a + 4] + 0.02, p[a + 2]), V((Math.random() - 0.5) * 0.8, 1 + Math.random(), (Math.random() - 0.5) * 0.8), [0.6, 0.65, 0.7, 0.35], 0.02, 0.25, { grav: 9.8 });
          this.resetDrop(i, false);
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // ------------------------------------------------ atualização
    update(dt, t, cam, env) {
      const fog = this.scene.fog;
      for (const u of [this.parts.uniforms, this.smoke.uniforms, this.dustU]) { u.uFogC.value.copy(fog.color); u.uFogD.value = fog.density; u.uScale.value = env.pointScale; }
      this.parts.update(dt); this.smoke.update(dt);
      // poças crescendo
      if (this.growing.length) {
        for (const g of this.growing) { g.s = Math.min(g.target, g.s + g.rate * dt * (1 - g.s / g.target * 0.7)); this._m.compose(this._p.set(g.x, g.y, g.z), g.q, this._s.set(g.s, 1, g.s)); this.decals.setMatrixAt(g.i, this._m); }
        this.growing = this.growing.filter(g => g.s < g.target - 0.005);
        this.decals.instanceMatrix.needsUpdate = true;
      }
      // cápsulas com física simples
      for (const c of this.casings) {
        if (!c.m.visible) continue;
        c.life -= dt; if (c.life <= 0) { c.m.visible = false; continue; }
        if (c.rest) continue;
        c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt);
        c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt;
        const g = HZ.heightAt(c.m.position.x, c.m.position.z) + 0.006;
        if (c.m.position.y < g) { c.m.position.y = g; c.v.y = -c.v.y * 0.3; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.5); if (Math.abs(c.v.y) < 0.4) { c.rest = true; c.m.rotation.x = 0; c.m.rotation.z = 0; } }
      }
      if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; }
      this.shaftTimer -= dt;
      if (this.shaftTimer <= 0) { this.shaftTimer = 0.5; this.updateShafts(cam, env.sunDir, !env.rain); }
      this.shaftU.uTime.value = t;
      this.dust.visible = !env.rain;
      if (!env.rain) this.updateDust(dt, t, cam);
      this.updateLeaves(dt, t, cam);
      this.updateBirds(dt, t);
      this.updateRain(dt, env.rain);
    }

    clear() {
      this.decals.count = 0; this.decalI = 0; this.growing = [];
      this.holes.count = 0; this.holeI = 0;
      this.casings.forEach(c => (c.m.visible = false));
      for (let i = 0; i < this.parts.N; i++) this.parts.life[i] = 0;
    }
  }
  HZ.Effects = Effects;

  // ================================================================ PÓS-PROCESSAMENTO
  const QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const BRIGHT_FS = `uniform sampler2D tDiffuse; uniform float uTh; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uTh, uTh * 2.2, l), 1.0); }`;
  const BLUR_FS = `uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
    void main(){ vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227;
      s += texture2D(tDiffuse, vUv + uDir * 1.385).rgb * 0.316; s += texture2D(tDiffuse, vUv - uDir * 1.385).rgb * 0.316;
      s += texture2D(tDiffuse, vUv + uDir * 3.231).rgb * 0.07; s += texture2D(tDiffuse, vUv - uDir * 3.231).rgb * 0.07;
      gl_FragColor = vec4(s, 1.0); }`;
  const FINAL_FS = `
    uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uExposure; uniform float uTime; uniform vec2 uRes;
    uniform float uDamage; uniform float uLow; uniform float uSat; uniform float uDead; uniform float uWet;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c = IN * c; c = RRTAndODTFit(c); c = OUT * c; return clamp(c, 0.0, 1.0); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 dc = vUv - 0.5; float r2 = dot(dc, dc);
      vec2 off = dc * r2 * 0.0035;
      vec3 col = vec3(texture2D(tScene, vUv - off).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv + off).b);
      col += texture2D(tBloom, vUv).rgb * uBloom;
      col *= uExposure / 0.6;
      col = aces(col);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat * (1.0 - uLow * 0.55) * (1.0 - uDead));
      // leve curva de cor cinematográfica (sombras frias, altas luzes quentes)
      col = mix(col, col * vec3(0.94, 1.0, 1.04), (1.0 - l) * 0.35);
      col = mix(col, col * vec3(1.05, 1.0, 0.93), l * 0.3);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);
      float vig = smoothstep(0.35, 1.05, length(dc) * 1.35);
      col *= 1.0 - vig * (0.42 + uLow * 0.25);
      float edge = smoothstep(0.15, 0.85, length(dc) * 1.4);
      col = mix(col, vec3(0.32, 0.0, 0.0), clamp(uDamage * edge * 1.1 + uDead * 0.55, 0.0, 0.95));
      col = toSRGB(col);
      col += (hash(vUv * uRes + fract(uTime) * 91.7) - 0.5) * 0.028;
      gl_FragColor = vec4(col, 1.0);
    }`;

  class Post {
    constructor(renderer, q) {
      this.r = renderer; this.q = q;
      const opt = { type: THREE.HalfFloatType, depthBuffer: true, samples: q.samples };
      this.rt = new THREE.WebGLRenderTarget(4, 4, opt);
      this.a = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
      this.b = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
      this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false;
      this.qs = new THREE.Scene(); this.qs.add(this.quad);
      this.bright = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uTh: { value: 1.1 } }, vertexShader: QUAD_VS, fragmentShader: BRIGHT_FS, depthTest: false, depthWrite: false });
      this.blur = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: QUAD_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false });
      this.final = new THREE.ShaderMaterial({ uniforms: { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: q.bloom ? 0.32 : 0 }, uExposure: { value: 0.62 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2() }, uDamage: { value: 0 }, uLow: { value: 0 }, uSat: { value: 1.08 }, uDead: { value: 0 }, uWet: { value: 0 } }, vertexShader: QUAD_VS, fragmentShader: FINAL_FS, depthTest: false, depthWrite: false });
      this.u = this.final.uniforms;
    }
    setSize(w, h) {
      this.rt.setSize(w, h);
      const bw = Math.max(1, (w / 4) | 0), bh = Math.max(1, (h / 4) | 0);
      this.a.setSize(bw, bh); this.b.setSize(bw, bh);
      this.u.uRes.value.set(w, h); this.bw = bw; this.bh = bh;
    }
    pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qs, this.cam); }
    render(scene, camera, overlayScene) {
      const r = this.r;
      r.setRenderTarget(this.rt); r.clear(); r.render(scene, camera);
      if (overlayScene) { r.autoClear = false; r.clearDepth(); r.render(overlayScene, camera); r.autoClear = true; }
      if (this.q.bloom) {
        this.bright.uniforms.tDiffuse.value = this.rt.texture; this.pass(this.bright, this.a);
        for (let i = 0; i < 2; i++) {
          this.blur.uniforms.tDiffuse.value = this.a.texture; this.blur.uniforms.uDir.value.set((1 + i) / this.bw, 0); this.pass(this.blur, this.b);
          this.blur.uniforms.tDiffuse.value = this.b.texture; this.blur.uniforms.uDir.value.set(0, (1 + i) / this.bh); this.pass(this.blur, this.a);
        }
      }
      this.u.tScene.value = this.rt.texture; this.u.tBloom.value = this.a.texture;
      this.pass(this.final, null);
    }
  }
  HZ.Post = Post;
})();
