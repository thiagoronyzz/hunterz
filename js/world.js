/* HUNTERZ — construção do mundo: céu, luz, terreno, trilha, lago, floresta em camadas,
   sub-bosque, rochas/troncos com colisão e sistema de instâncias com LOD. */
(function () {
  'use strict';
  const HZ = window.HZ;
  const THREE = window.THREE;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  const WORLD = 420, HALF = 210, BOUND = 196;
  const POND = { x: -76, z: 62 };
  const SPAWN = { x: 0, z: 18 };

  HZ.QUALITY = {
    alta: { terrainSeg: 280, radial: 9, branchRadial: 5, leafCards: 56, treeNear: 120, far: 560, grassD: 3.0, grassR: 50, fern: 10000, fernR: 70, bush: 1800, sapling: 1200, flowers: 6000, twigs: 4000, stones: 4000, mushrooms: 1400, shadow: 4096, shadowR: 65, pixelRatio: 1.5, samples: 4, bloom: true, variants: 3, treeStep: 5.0 },
    media: { terrainSeg: 210, radial: 8, branchRadial: 4, leafCards: 46, treeNear: 95, far: 480, grassD: 2.0, grassR: 38, fern: 6000, fernR: 55, bush: 1200, sapling: 800, flowers: 3500, twigs: 2200, stones: 2200, mushrooms: 800, shadow: 2048, shadowR: 55, pixelRatio: 1.25, samples: 4, bloom: true, variants: 2, treeStep: 5.4 },
    baixa: { terrainSeg: 140, radial: 6, branchRadial: 4, leafCards: 36, treeNear: 70, far: 380, grassD: 1.2, grassR: 26, fern: 3000, fernR: 40, bush: 700, sapling: 400, flowers: 1500, twigs: 900, stones: 900, mushrooms: 400, shadow: 1024, shadowR: 42, pixelRatio: 1, samples: 0, bloom: false, variants: 2, treeStep: 6.2 },
  };

  // ================================================================= CAMPOS
  const TRAILS = [
    [[0, 40], [2, 18], [6, -6], [9, -30], [4, -55], [-10, -82], [-32, -104], [-62, -114], [-96, -100], [-122, -66], [-118, -26], [-100, 12], [-86, 42], [-78, 50]],
    [[9, -30], [30, -38], [58, -32], [86, -16], [112, 12], [128, 48], [124, 90], [100, 122], [66, 136]],
    [[2, 18], [-20, 30], [-44, 44], [-62, 56], [-70, 58]],
  ];
  const segs = [];
  TRAILS.forEach(t => { for (let i = 0; i < t.length - 1; i++) segs.push([t[i][0], t[i][1], t[i + 1][0], t[i + 1][1]]); });
  function trailDist(x, z) {
    let best = 1e9;
    for (const s of segs) {
      const vx = s[2] - s[0], vz = s[3] - s[1], L2 = vx * vx + vz * vz;
      let t = ((x - s[0]) * vx + (z - s[1]) * vz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - s[0] - vx * t, z - s[1] - vz * t); if (d < best) best = d;
    }
    return best + HZ.perlin(x * 0.15, z * 0.15, 404) * 0.6;
  }

  function rawHeight(x, z) {
    let h = HZ.fbm(x * 0.0055, z * 0.0055, 4, 7) * 10 + HZ.fbm(x * 0.024, z * 0.024, 3, 8) * 1.7 + HZ.perlin(x * 0.12, z * 0.12, 9) * 0.16;
    const r = Math.max(Math.abs(x), Math.abs(z));
    const rise = HZ.smooth(200, 520, r);
    h += rise * rise * (40 + HZ.fbm(x * 0.004, z * 0.004, 3, 10) * 35);
    // bacia do lago
    const dp = Math.hypot(x - POND.x, z - POND.z);
    if (dp < 30) { const W = HZ.WATER_Y; h = Math.min(h, HZ.lerp(W - 1.6 + Math.max(0, dp - 2) * 0.17, h, HZ.smooth(18, 30, dp))); }
    return h;
  }
  HZ.WATER_Y = 0;
  {
    // define o nível da água a partir do terreno natural no centro do lago
    const h0 = HZ.fbm(POND.x * 0.0055, POND.z * 0.0055, 4, 7) * 10 + HZ.fbm(POND.x * 0.024, POND.z * 0.024, 3, 8) * 1.7;
    HZ.WATER_Y = h0 - 0.35;
  }

  // água só existe na bacia do lago (disco de 19 m)
  HZ.POND = POND;
  HZ.isWater = (x, z, margin = 0) => Math.hypot(x - POND.x, z - POND.z) < 19 && HZ.heightAt(x, z) < HZ.WATER_Y + margin;

  // Grade de alturas com interpolação idêntica à triangulação da malha
  let HG = null, HN = 0, HS = 0;
  function buildHeightGrid(seg) {
    HN = seg + 1; HS = WORLD / seg;
    HG = new Float32Array(HN * HN);
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) HG[j * HN + i] = rawHeight(-HALF + i * HS, -HALF + j * HS);
  }
  function heightAt(x, z) {
    const fx = (x + HALF) / HS, fz = (z + HALF) / HS;
    if (fx < 0 || fz < 0 || fx >= HN - 1 || fz >= HN - 1) return rawHeight(x, z);
    const ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz;
    const i00 = iz * HN + ix;
    const h00 = HG[i00], h10 = HG[i00 + 1], h01 = HG[i00 + HN], h11 = HG[i00 + HN + 1];
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }
  HZ.heightAt = heightAt;
  HZ.groundNormal = function (x, z, out = V()) { const e = 0.5; return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize(); };

  // densidade de floresta (0 = clareira, 1 = mata fechada) e espécie
  let DG = null; const DN = 211, DS = 2;
  function forestRaw(x, z) {
    let d = HZ.smooth(-0.3, 0.3, HZ.fbm(x * 0.0105 + 50, z * 0.0105, 3, 301) + 0.12);
    d *= HZ.smooth(10, 24, Math.hypot(x - SPAWN.x, z - SPAWN.z)) * 0.8 + 0.2;
    d *= HZ.smooth(14, 26, Math.hypot(x - POND.x, z - POND.z));
    return d;
  }
  function buildForestGrid() { DG = new Float32Array(DN * DN); for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) DG[j * DN + i] = forestRaw(-HALF + i * DS, -HALF + j * DS); }
  function forest(x, z) {
    const fx = HZ.clamp((x + HALF) / DS, 0, DN - 1.001), fz = HZ.clamp((z + HALF) / DS, 0, DN - 1.001);
    const ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz, i = iz * DN + ix;
    return (DG[i] * (1 - u) + DG[i + 1] * u) * (1 - v) + (DG[i + DN] * (1 - u) + DG[i + DN + 1] * u) * v;
  }
  HZ.forestDensity = forest;
  const speciesField = (x, z) => HZ.fbm(x * 0.0075 + 20, z * 0.0075 - 40, 3, 302);

  // ============================================================== SCATTER / LOD
  const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
  class Scatter {
    constructor(geometry, material, o = {}) {
      this.geometry = geometry; this.material = material; this.o = o;
      this.cell = o.cell || 16; this.cells = new Map();
      this.cap = 1024; this.n = 0;
      this.m = new Float32Array(this.cap * 16);
      this.c = o.colors ? new Float32Array(this.cap * 3) : null;
      this.p = new Float32Array(this.cap * 3);
      this.last = { x: 1e9, z: 1e9, yaw: 1e9, pitch: 1e9 };
    }
    add(mat, color) {
      if (this.n >= this.cap) {
        this.cap *= 2;
        const m = new Float32Array(this.cap * 16); m.set(this.m); this.m = m;
        const p = new Float32Array(this.cap * 3); p.set(this.p); this.p = p;
        if (this.c) { const c = new Float32Array(this.cap * 3); c.set(this.c); this.c = c; }
      }
      const i = this.n++;
      mat.toArray(this.m, i * 16);
      const e = mat.elements; this.p[i * 3] = e[12]; this.p[i * 3 + 1] = e[13]; this.p[i * 3 + 2] = e[14];
      if (this.c) { const cc = color || [1, 1, 1]; this.c[i * 3] = cc[0] !== undefined ? cc[0] : cc.r; this.c[i * 3 + 1] = cc[1] !== undefined ? cc[1] : cc.g; this.c[i * 3 + 2] = cc[2] !== undefined ? cc[2] : cc.b; }
      const cx = Math.floor(e[12] / this.cell), cz = Math.floor(e[14] / this.cell), k = cx * 100000 + cz;
      let cell = this.cells.get(k);
      if (!cell) { cell = { cx, cz, idx: [], y: 0 }; this.cells.set(k, cell); }
      cell.idx.push(i); cell.y += (e[13] - cell.y) / cell.idx.length;
      return i;
    }
    build(scene) {
      const cap = Math.max(1, Math.min(this.n, this.o.maxVisible || this.n));
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (this.c) { mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      mesh.frustumCulled = false; mesh.count = 0;
      mesh.castShadow = !!this.o.castShadow; mesh.receiveShadow = this.o.receiveShadow !== false;
      if (this.o.depthMat) mesh.customDepthMaterial = this.o.depthMat;
      if (this.o.renderOrder) mesh.renderOrder = this.o.renderOrder;
      this.mesh = mesh; this.capVis = cap; this.cellList = [...this.cells.values()];
      scene.add(mesh);
      return mesh;
    }
    update(cam, force) {
      if (!this.mesh) return;
      const l = this.last, R = this.o.radius || 100;
      const moved = Math.hypot(cam.position.x - l.x, cam.position.z - l.z);
      const rot = Math.abs(HZ.angleDiff(l.yaw, cam.rotation.y)) + Math.abs(cam.rotation.x - l.pitch);
      if (!force && moved < Math.max(0.6, R * 0.02) && rot < 0.06) return;
      l.x = cam.position.x; l.z = cam.position.z; l.yaw = cam.rotation.y; l.pitch = cam.rotation.x;
      _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
      const R2 = R * R, Rmin = this.o.minRadius || 0, Rmin2 = Rmin * Rmin;
      const half = this.cell * 0.5, diag = this.cell * 0.7072;
      const margin = (this.o.margin || 0) + diag + (this.o.objRadius || 2);
      const px = cam.position.x, pz = cam.position.z;
      const dst = this.mesh.instanceMatrix.array, dc = this.c ? this.mesh.instanceColor.array : null;
      let k = 0;
      const cap = this.capVis;
      for (const cell of this.cellList) {
        const ccx = cell.cx * this.cell + half, ccz = cell.cz * this.cell + half;
        const dx = ccx - px, dz = ccz - pz, d = Math.hypot(dx, dz);
        if (d - diag > R || (Rmin && d + diag < Rmin)) continue;
        _sph.center.set(ccx, cell.y + (this.o.objHeight || 1) * 0.5, ccz); _sph.radius = margin + (this.o.objHeight || 1) * 0.5;
        if (d > diag * 1.5 && !_fr.intersectsSphere(_sph)) continue;
        const idx = cell.idx;
        for (let j = 0; j < idx.length; j++) {
          const i = idx[j];
          const ex = this.p[i * 3] - px, ez = this.p[i * 3 + 2] - pz, d2 = ex * ex + ez * ez;
          if (d2 > R2 || d2 < Rmin2) continue;
          if (k >= cap) break;
          dst.set(this.m.subarray(i * 16, i * 16 + 16), k * 16);
          if (dc) { dc[k * 3] = this.c[i * 3]; dc[k * 3 + 1] = this.c[i * 3 + 1]; dc[k * 3 + 2] = this.c[i * 3 + 2]; }
          k++;
        }
      }
      this.mesh.count = k;
      const im = this.mesh.instanceMatrix; im.clearUpdateRanges(); im.addUpdateRange(0, Math.max(16, k * 16)); im.needsUpdate = true;
      if (dc) { const ic = this.mesh.instanceColor; ic.clearUpdateRanges(); ic.addUpdateRange(0, Math.max(3, k * 3)); ic.needsUpdate = true; }
    }
  }
  HZ.Scatter = Scatter;

  // Instâncias geradas sob demanda ao redor do jogador (grama densa / flores)
  class DynamicScatter {
    constructor(geos, material, o) {
      this.geos = geos; this.material = material; this.o = o;
      this.cell = o.cell || 8; this.cells = new Map();
      this.last = { x: 1e9, z: 1e9, yaw: 1e9, pitch: 1e9 };
      this.dirty = true;
    }
    build(scene) {
      const cap = this.o.maxVisible;
      this.meshes = this.geos.map(g => {
        const m = new THREE.InstancedMesh(g, this.material, cap);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false; m.count = 0; m.receiveShadow = true; m.castShadow = false;
        scene.add(m); return m;
      });
    }
    genCell(cx, cz) {
      const nv = this.geos.length, cell = { cx, cz, m: [], c: [], n: [], y: 0 };
      for (let k = 0; k < nv; k++) { cell.m.push([]); cell.c.push([]); cell.n.push(0); }
      const r = HZ.rng((cx * 73856093) ^ (cz * 19349663) ^ this.o.seed);
      const x0 = cx * this.cell, z0 = cz * this.cell;
      const count = Math.round(this.cell * this.cell * this.o.density);
      const mat = new THREE.Matrix4(), qq = new THREE.Quaternion(), qy = new THREE.Quaternion(), pp = V(), ss = V(), nn = V(), up = V(0, 1, 0);
      let ysum = 0, yn = 0;
      for (let i = 0; i < count; i++) {
        const x = x0 + r() * this.cell, z = z0 + r() * this.cell;
        const g = this.o.gen(r, x, z);
        if (!g) continue;
        const y = heightAt(x, z);
        HZ.groundNormal(x, z, nn);
        qq.setFromUnitVectors(up, nn.set(nn.x * g.tilt, 1, nn.z * g.tilt).normalize());
        qq.multiply(qy.setFromAxisAngle(up, g.rot));
        mat.compose(pp.set(x, y, z), qq, ss.set(g.s, g.s * (g.sy || 1), g.s));
        const k = g.k % nv;
        cell.m[k].push(...mat.elements); cell.c[k].push(g.c[0], g.c[1], g.c[2]); cell.n[k]++;
        ysum += y; yn++;
      }
      cell.y = yn ? ysum / yn : 0;
      cell.m = cell.m.map(a => new Float32Array(a)); cell.c = cell.c.map(a => new Float32Array(a));
      return cell;
    }
    update(cam, force) {
      if (!this.meshes) return;
      const R = this.o.radius, C = this.cell, px = cam.position.x, pz = cam.position.z;
      const l = this.last;
      const moved = Math.hypot(px - l.x, pz - l.z);
      const rot = Math.abs(HZ.angleDiff(l.yaw, cam.rotation.y)) + Math.abs(cam.rotation.x - l.pitch);
      if (!force && moved < 0.8 && rot < 0.06) return;
      l.x = px; l.z = pz; l.yaw = cam.rotation.y; l.pitch = cam.rotation.x;
      const c0x = Math.floor((px - R) / C), c1x = Math.floor((px + R) / C), c0z = Math.floor((pz - R) / C), c1z = Math.floor((pz + R) / C);
      const keep = new Set();
      for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) {
        const d = Math.hypot(cx * C + C / 2 - px, cz * C + C / 2 - pz);
        if (d - C * 0.71 > R) continue;
        const k = cx * 100000 + cz; keep.add(k);
        if (!this.cells.has(k)) this.cells.set(k, this.genCell(cx, cz));
      }
      for (const k of this.cells.keys()) if (!keep.has(k)) this.cells.delete(k);
      _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
      const nv = this.geos.length, cnt = new Array(nv).fill(0), cap = this.o.maxVisible;
      for (const cell of this.cells.values()) {
        const ccx = cell.cx * C + C / 2, ccz = cell.cz * C + C / 2;
        const d = Math.hypot(ccx - px, ccz - pz);
        _sph.center.set(ccx, cell.y + 0.5, ccz); _sph.radius = C * 0.75 + 1.5;
        if (d > C * 1.2 && !_fr.intersectsSphere(_sph)) continue;
        for (let k = 0; k < nv; k++) {
          const n = cell.n[k]; if (!n) continue;
          const mesh = this.meshes[k]; if (cnt[k] + n > cap) continue;
          mesh.instanceMatrix.array.set(cell.m[k], cnt[k] * 16);
          mesh.instanceColor.array.set(cell.c[k], cnt[k] * 3);
          cnt[k] += n;
        }
      }
      for (let k = 0; k < nv; k++) {
        const m = this.meshes[k]; m.count = cnt[k];
        m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, Math.max(16, cnt[k] * 16)); m.instanceMatrix.needsUpdate = true;
        m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, Math.max(3, cnt[k] * 3)); m.instanceColor.needsUpdate = true;
      }
    }
  }

  // ================================================================ MATERIAIS
  const shared = { uFadeGrass: { value: new THREE.Vector2(30, 50) }, uSunView: { value: V(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 0.9, 0.75) } };
  HZ.sharedUniforms = shared;

  function foliageMaterial(map, alphaMap, o = {}) {
    const m = new THREE.MeshStandardMaterial({ map, alphaMap, alphaTest: o.alphaTest || 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: o.roughness || 0.82, metalness: 0, color: o.color || 0xffffff, envMapIntensity: o.env || 0.55 });
    if (HZ.q.samples > 0) m.alphaToCoverage = true;
    m.onBeforeCompile = shader => {
      shader.uniforms.uTime = HZ.windUniforms.uTime; shader.uniforms.uWind = HZ.windUniforms.uWind;
      shader.uniforms.uFade = o.fade || { value: new THREE.Vector2(1e5, 2e5) };
      shader.uniforms.uSunView = shared.uSunView; shader.uniforms.uSunColor = shared.uSunColor;
      shader.uniforms.uTrans = { value: o.trans !== undefined ? o.trans : 0.35 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + HZ.WIND_PARS + '\nuniform vec2 uFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + HZ.WIND_VERTEX + (o.fade ? `
          #ifdef USE_INSTANCING
            vec3 fwp = (modelMatrix * vec4(ipos, 1.0)).xyz;
            float fk = 1.0 - smoothstep(uFade.x, uFade.y, distance(fwp.xz, cameraPosition.xz));
            transformed *= fk;
          #endif` : ''));
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSunView; uniform vec3 uSunColor; uniform float uTrans;')
        .replace('#include <normal_fragment_begin>', 'float faceDirection = gl_FrontFacing ? 1.0 : -1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          float bl = pow(max(dot(normalize(-vViewPosition), uSunView), 0.0), 4.0);
          reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * (bl * uTrans + 0.06 * uTrans);`);
    };
    m.customProgramCacheKey = () => 'foliage' + (o.fade ? 'F' : '') + (o.key || '');
    return m;
  }
  function woodMaterial(map, normalMap, o = {}) {
    const m = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.93, color: o.color || 0xffffff, envMapIntensity: 0.5, vertexColors: !!o.vertexColors });
    HZ.applyWind(m, { key: 'wood' + (o.key || '') });
    return m;
  }
  function depthMaterial(alphaMap, fade) {
    const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap, alphaTest: 0.42, side: THREE.DoubleSide });
    d.onBeforeCompile = shader => {
      shader.uniforms.uTime = HZ.windUniforms.uTime; shader.uniforms.uWind = HZ.windUniforms.uWind;
      shader.uniforms.uFade = fade || { value: new THREE.Vector2(1e5, 2e5) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + HZ.WIND_PARS + '\nuniform vec2 uFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + HZ.WIND_VERTEX);
    };
    d.customProgramCacheKey = () => 'depthwind';
    return d;
  }
  HZ.foliageMaterial = foliageMaterial;

  // ================================================================== CÉU
  const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
  const SKY_FS = `
    uniform vec3 uSunDir; uniform float uRain; uniform float uTime; uniform vec3 uHorizon; uniform vec3 uZenith; uniform float uSunI; uniform float uFlash;
    varying vec3 vDir;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
    float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<6;i++){ s+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=.5;} return s; }
    void main(){
      vec3 d = normalize(vDir); float h = d.y;
      vec3 col = mix(uHorizon, uZenith, pow(clamp(h,0.,1.), 0.45));
      col = mix(col, uHorizon * 0.8, smoothstep(0.0, -0.25, h));
      float sd = max(dot(d, uSunDir), 0.0);
      vec3 sunCol = vec3(1.0, 0.85, 0.62);
      col += sunCol * (pow(sd, 5.0) * 0.28 + pow(sd, 60.0) * 0.7) * uSunI;
      col += sunCol * smoothstep(0.99955, 0.9998, sd) * 45.0 * uSunI;
      if (h > -0.02) {
        vec2 uv = d.xz / (max(h,0.0) + 0.1) * 1.3 + vec2(uTime * 0.0045, uTime * 0.0017);
        float c = fbm(uv);
        float cov = mix(0.5, 0.26, uRain);
        float den = smoothstep(cov, cov + 0.3, c) * smoothstep(-0.02, 0.2, h);
        float thick = smoothstep(cov, cov + 0.55, fbm(uv * 1.7 + 3.0));
        float lit = 0.72 + 0.5 * pow(sd, 3.0);
        vec3 cc = mix(vec3(1.02, 1.0, 0.98) * lit * 1.35, vec3(0.5, 0.53, 0.58), thick * 0.6);
        cc = mix(cc, vec3(0.34, 0.36, 0.39), uRain * 0.85);
        col = mix(col, cc, den * 0.95);
      }
      col += vec3(0.8, 0.85, 1.0) * uFlash;
      gl_FragColor = vec4(col, 1.0);
    }`;

  // ================================================================ CONSTRUÇÃO
  HZ.buildWorld = async function (renderer, scene, quality, onProgress) {
    const q = (HZ.q = HZ.QUALITY[quality] || HZ.QUALITY.alta);
    const tx = HZ.tx;
    const world = { scene, q, layers: [], trees: [], rocks: [], physics: null, BOUND, SPAWN, POND };
    const prog = (p, msg) => { if (onProgress) onProgress(p, msg); return new Promise(r => setTimeout(r, 16)); };

    buildHeightGrid(q.terrainSeg);
    buildForestGrid();
    const physics = (world.physics = new HZ.Physics(heightAt));

    // ------------------------------------------------ céu, névoa, luz
    const sunDir = V(-0.42, 0.56, -0.71).normalize();
    world.sunDir = sunDir;
    const skyU = { uSunDir: { value: sunDir }, uRain: { value: 0 }, uTime: { value: 0 }, uHorizon: { value: new THREE.Color().setRGB(0.62, 0.68, 0.66) }, uZenith: { value: new THREE.Color().setRGB(0.2, 0.36, 0.62) }, uSunI: { value: 1 }, uFlash: { value: 0 } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
    sky.renderOrder = -10; sky.frustumCulled = false;
    scene.add(sky); world.sky = sky; world.skyU = skyU;
    scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(0.5, 0.56, 0.53), 0.0052);

    // mapa de ambiente a partir do céu (iluminação indireta PBR)
    {
      const envScene = new THREE.Scene();
      const skyClone = new THREE.Mesh(sky.geometry, sky.material);
      envScene.add(skyClone);
      // "chão" verde escuro para o hemisfério inferior do ambiente
      const gnd = new THREE.Mesh(new THREE.CircleGeometry(900, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.07, 0.085, 0.05), side: THREE.DoubleSide }));
      gnd.rotation.x = -Math.PI / 2; gnd.position.y = -20; envScene.add(gnd);
      skyU.uSunI.value = 0.25;
      const pm = new THREE.PMREMGenerator(renderer);
      world.envRT = pm.fromScene(envScene, 0.03, 1, 3000);
      scene.environment = world.envRT.texture;
      skyU.uSunI.value = 1;
      pm.dispose();
    }

    const hemi = new THREE.HemisphereLight(new THREE.Color().setRGB(0.55, 0.62, 0.7), new THREE.Color().setRGB(0.16, 0.14, 0.09), 0.55);
    scene.add(hemi); world.hemi = hemi;
    const sun = new THREE.DirectionalLight(new THREE.Color().setRGB(1, 0.88, 0.72), 3.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    const sr = q.shadowR;
    Object.assign(sun.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr, near: 1, far: 320 });
    sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.035;
    scene.add(sun); scene.add(sun.target); world.sun = sun;
    shared.uSunColor.value.copy(sun.color).multiplyScalar(0.9);

    await prog(0.12, 'Esculpindo o relevo');

    // ------------------------------------------------ terreno
    const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, normalMap: tx.groundN, normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 0.45 });
    const wetU = { value: 0 };
    world.wetU = wetU;
    terrainMat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, { tGrass: { value: tx.grassGround }, tLitter: { value: tx.litter }, tDirt: { value: tx.dirt }, tRock: { value: tx.rock }, uWet: wetU });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 splat; varying vec4 vSplat; varying vec3 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass, tLitter, tDirt, tRock; uniform float uWet; varying vec4 vSplat; varying vec3 vWP;\nfloat lum(vec3 c){ return dot(c, vec3(0.3,0.59,0.11)); }')
        .replace('#include <map_fragment>', `
          vec2 wuv = vWP.xz;
          vec3 cg = mix(texture2D(tGrass, wuv * 0.23).rgb, texture2D(tGrass, wuv * 0.051 + 0.3).rgb, 0.4);
          vec3 cl = mix(texture2D(tLitter, wuv * 0.3).rgb, texture2D(tLitter, wuv * 0.067 + 0.7).rgb, 0.35);
          vec3 cd = mix(texture2D(tDirt, wuv * 0.28).rgb, texture2D(tDirt, wuv * 0.06).rgb, 0.4);
          vec3 cr = texture2D(tRock, wuv * 0.2).rgb;
          vec4 w = vSplat;
          w *= vec4(0.6 + lum(cg) * 3.0, 0.6 + lum(cl) * 3.0, 0.6 + lum(cd) * 2.0, 0.6 + lum(cr) * 2.0);
          w = pow(w, vec4(4.0)); w /= (w.x + w.y + w.z + w.w + 1e-5);
          vec3 tcol = cg * w.x + cl * w.y + cd * w.z + cr * w.w;
          float macro = texture2D(tGrass, wuv * 0.0071).g;
          tcol *= 0.8 + macro * 1.1;
          tcol *= 1.0 - uWet * 0.28;
          diffuseColor.rgb *= tcol;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.42, uWet * (0.4 + 0.6 * vSplat.z));');
    };
    terrainMat.customProgramCacheKey = () => 'terrain';
    world.terrainMat = terrainMat;

    // árvores são posicionadas antes do terreno para oclusão ambiental no solo
    await prog(0.2, 'Plantando a floresta');
    const rT = HZ.rng(777);
    const treeList = [];
    const pickSpecies = (x, z) => {
      const S = speciesField(x, z), r = rT();
      if (r < 0.035) return 'snag';
      if (S < -0.12) return r < 0.68 ? 'pine' : r < 0.95 ? 'spruce' : 'birch';
      if (S < 0.18) return r < 0.55 ? 'spruce' : r < 0.8 ? 'pine' : 'birch';
      return r < 0.55 ? 'oak' : r < 0.85 ? 'birch' : 'spruce';
    };
    {
      const st = q.treeStep;
      for (let gz = -HALF + 2; gz < HALF - 2; gz += st) for (let gx = -HALF + 2; gx < HALF - 2; gx += st) {
        const x = gx + (rT() - 0.5) * st * 0.95, z = gz + (rT() - 0.5) * st * 0.95;
        const D = forest(x, z);
        if (rT() > 0.06 + D * 0.88) continue;
        if (trailDist(x, z) < 3.2) continue;
        if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8) continue;
        if (Math.hypot(x - POND.x, z - POND.z) < 17) continue;
        treeList.push({ x, z, sp: pickSpecies(x, z), s: 0.78 + rT() * 0.45, rot: rT() * Math.PI * 2, v: (rT() * q.variants) | 0, outer: false });
      }
      // anel externo (apenas impostores) — camadas de floresta até o horizonte
      const st2 = st * 1.35;
      for (let gz = -440; gz < 440; gz += st2) for (let gx = -440; gx < 440; gx += st2) {
        if (Math.abs(gx) < HALF - 4 && Math.abs(gz) < HALF - 4) continue;
        const x = gx + (rT() - 0.5) * st2, z = gz + (rT() - 0.5) * st2;
        if (Math.abs(x) < HALF - 2 && Math.abs(z) < HALF - 2) continue;
        const D = HZ.smooth(-0.35, 0.25, HZ.fbm(x * 0.009, z * 0.009, 3, 303) + 0.15);
        if (rT() > 0.25 + D * 0.7) continue;
        treeList.push({ x, z, sp: pickSpecies(x, z) === 'snag' ? 'spruce' : pickSpecies(x, z), s: 0.85 + rT() * 0.45, rot: rT() * Math.PI * 2, v: (rT() * q.variants) | 0, outer: true });
      }
    }

    // ------------------------------------------------ malha do terreno interno
    await prog(0.3, 'Cobrindo o chão da floresta');
    {
      const seg = q.terrainSeg, n = seg + 1;
      const pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), splat = new Float32Array(n * n * 4), col = new Float32Array(n * n * 3);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, x = -HALF + i * HS, z = -HALF + j * HS, y = HG[k];
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        uv[k * 2] = x * 0.33; uv[k * 2 + 1] = z * 0.33;
        const D = forest(x, z), td = trailDist(x, z);
        const nrm = HZ.groundNormal(x, z);
        const slope = 1 - nrm.y;
        const pn = HZ.fbm(x * 0.06, z * 0.06, 3, 505);
        let grass = (1 - D) * 0.95 + 0.05 + pn * 0.25;
        let litter = D * 0.95 + 0.05 - pn * 0.2;
        let dirt = 1 - HZ.smooth(0.7, 2.1, td);
        let rock = HZ.smooth(0.12, 0.3, slope) + HZ.smooth(0.55, 0.75, HZ.fbm(x * 0.03, z * 0.03, 3, 506)) * 0.5;
        const dp = Math.hypot(x - POND.x, z - POND.z);
        if (dp < 17) { dirt = Math.max(dirt, HZ.smooth(17, 10, dp) * 0.9); grass *= HZ.smooth(10, 16, dp); }
        grass = Math.max(0, grass) * (1 - dirt); litter = Math.max(0, litter) * (1 - dirt); rock *= 1 - dirt;
        splat[k * 4] = grass; splat[k * 4 + 1] = litter; splat[k * 4 + 2] = dirt + 0.001; splat[k * 4 + 3] = rock;
        const ao = 1 - D * 0.28;
        col[k * 3] = ao; col[k * 3 + 1] = ao; col[k * 3 + 2] = ao;
      }
      // oclusão na base das árvores
      for (const t of treeList) {
        if (t.outer) continue;
        const R = 3.2 * t.s, i0 = Math.max(0, Math.floor((t.x - R + HALF) / HS)), i1 = Math.min(seg, Math.ceil((t.x + R + HALF) / HS));
        const j0 = Math.max(0, Math.floor((t.z - R + HALF) / HS)), j1 = Math.min(seg, Math.ceil((t.z + R + HALF) / HS));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * n + i, d = Math.hypot(-HALF + i * HS - t.x, -HALF + j * HS - t.z);
          if (d < R) { const f = 1 - 0.35 * (1 - d / R) * (1 - d / R); col[k * 3] *= f; col[k * 3 + 1] *= f; col[k * 3 + 2] *= f; splat[k * 4 + 1] += (1 - d / R) * 0.8; }
        }
      }
      const idx = new Uint32Array(seg * seg * 6);
      let o = 0;
      for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
        const a = j * n + i, b = (j + 1) * n + i, c = (j + 1) * n + i + 1, d = j * n + i + 1;
        idx[o++] = a; idx[o++] = b; idx[o++] = d; idx[o++] = b; idx[o++] = c; idx[o++] = d;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeVertexNormals();
      const terrain = new THREE.Mesh(g, terrainMat);
      terrain.receiveShadow = true;
      scene.add(terrain); world.terrain = terrain;
    }
    // terreno externo (colinas até o horizonte)
    {
      const size = 1800, seg = 150;
      const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position, n = p.count;
      const splat = new Float32Array(n * 4), col = new Float32Array(n * 3), uv = g.attributes.uv;
      for (let i = 0; i < n; i++) {
        const x = p.getX(i), z = p.getZ(i);
        let y = rawHeight(x, z);
        if (Math.abs(x) < HALF - 1 && Math.abs(z) < HALF - 1) y -= 3;
        p.setY(i, y);
        uv.setXY(i, x * 0.33, z * 0.33);
        const D = HZ.smooth(-0.35, 0.25, HZ.fbm(x * 0.009, z * 0.009, 3, 303) + 0.15);
        splat[i * 4] = 1 - D; splat[i * 4 + 1] = D; splat[i * 4 + 2] = 0.001; splat[i * 4 + 3] = 0.1;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.75 - D * 0.2;
      }
      g.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      const outer = new THREE.Mesh(g, terrainMat);
      outer.receiveShadow = false;
      scene.add(outer);
    }
    // cordilheira distante (silhuetas azuladas pela perspectiva atmosférica)
    {
      const layers = [[900, 110, 0.55], [1250, 190, 0.42]];
      for (const [R, Hm, mix] of layers) {
        const seg = 220, pos = [], idx = [], col = [];
        const haze = new THREE.Color().setRGB(0.56, 0.63, 0.66), dark = new THREE.Color().setRGB(0.16, 0.21, 0.2);
        const c = haze.clone().lerp(dark, mix);
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          const h = Hm * (0.35 + 0.65 * HZ.ridged(Math.cos(a) * 3 + R, Math.sin(a) * 3, 5, 611)) ;
          const x = Math.cos(a) * R, z = Math.sin(a) * R;
          pos.push(x, -40, z, x, h, z);
          col.push(c.r, c.g, c.b, c.r * 1.08, c.g * 1.08, c.b * 1.08);
          if (i < seg) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
        m.renderOrder = -5; m.frustumCulled = false;
        scene.add(m);
        (world.mountains = world.mountains || []).push(m);
      }
    }

    // ------------------------------------------------ água do lago
    {
      const wg = new THREE.CircleGeometry(19, 64); wg.rotateX(-Math.PI / 2);
      const waterN = tx.waterN; waterN.repeat.set(6, 6);
      const wm = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.035, 0.05, 0.04), roughness: 0.03, metalness: 0.1, normalMap: waterN, normalScale: new THREE.Vector2(0.18, 0.18), transparent: true, opacity: 0.9, envMapIntensity: 1.4 });
      const water = new THREE.Mesh(wg, wm);
      water.position.set(POND.x, HZ.WATER_Y, POND.z); water.receiveShadow = true;
      scene.add(water); world.water = water;
    }

    // ------------------------------------------------ materiais de árvores
    await prog(0.42, 'Crescendo pinheiros, abetos e carvalhos');
    const fadeGrass = shared.uFadeGrass; fadeGrass.value.set(q.grassR * 0.7, q.grassR);
    const barkMats = {
      pine: woodMaterial(tx.barkPine, tx.barkPineN, { key: 'p' }),
      spruce: woodMaterial(tx.barkSpruce, tx.barkSpruceN, { key: 's' }),
      oak: woodMaterial(tx.barkOak, tx.barkOakN, { key: 'o' }),
      birch: woodMaterial(tx.barkBirch, tx.barkBirchN, { key: 'b' }),
      snag: woodMaterial(tx.barkOak, tx.barkOakN, { key: 'n', color: 0xb8b0a4 }),
    };
    barkMats.birch.normalScale.set(0.6, 0.6);
    const leafMats = {
      pine: foliageMaterial(tx.pine, tx.pineA, { color: 0xc8d8b0, trans: 0.3, key: 'p' }),
      spruce: foliageMaterial(tx.spruce, tx.spruceA, { color: 0xb8ccb0, trans: 0.22, key: 's' }),
      oak: foliageMaterial(tx.leaves, tx.leavesA, { color: 0xe8f0d8, trans: 0.5, key: 'o' }),
      birch: foliageMaterial(tx.birchLeaves, tx.birchLeavesA, { color: 0xf0f4dc, trans: 0.55, key: 'b' }),
    };
    const depthMats = { pine: depthMaterial(tx.pineA), spruce: depthMaterial(tx.spruceA), oak: depthMaterial(tx.leavesA), birch: depthMaterial(tx.birchLeavesA) };
    const woodDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });

    const builders = { pine: HZ.veg.pine, spruce: r => HZ.veg.spruce(r, q), oak: r => HZ.veg.broadleaf(r, q, false), birch: r => HZ.veg.broadleaf(r, q, true), snag: HZ.veg.snag };
    const archetypes = {};
    const rA = HZ.rng(4242);
    for (const sp of Object.keys(builders)) {
      archetypes[sp] = [];
      for (let v = 0; v < q.variants; v++) {
        const a = sp === 'pine' ? HZ.veg.pine(rA, q) : sp === 'snag' ? HZ.veg.snag(rA, q) : builders[sp](rA);
        a.sp = sp;
        archetypes[sp].push(a);
      }
    }
    world.archetypes = archetypes;

    // impostores: renderiza cada arquétipo lateralmente numa textura
    await prog(0.55, 'Pintando as camadas distantes');
    const impScene = new THREE.Scene();
    impScene.environment = scene.environment;
    impScene.add(new THREE.HemisphereLight(hemi.color, hemi.groundColor, 0.7));
    const impSun = new THREE.DirectionalLight(sun.color, 2.4); impSun.position.set(-3, 6, 8); impScene.add(impSun);
    const impCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const IW = quality === 'baixa' ? 128 : 256;
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    for (const sp of Object.keys(archetypes)) for (const a of archetypes[sp]) {
      const tmp = [];
      const wm = new THREE.Mesh(a.wood, barkMats[sp]); tmp.push(wm);
      if (a.leaves) tmp.push(new THREE.Mesh(a.leaves, leafMats[sp]));
      a.wood.computeBoundingBox(); const bb = a.wood.boundingBox.clone();
      if (a.leaves) { a.leaves.computeBoundingBox(); bb.union(a.leaves.boundingBox); }
      const w = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z)) * 2 + 0.4;
      Object.assign(impCam, { left: -w / 2, right: w / 2, top: bb.max.y + 0.1, bottom: bb.min.y });
      impCam.position.set(0, 0, 60); impCam.lookAt(0, 0, 0); impCam.updateProjectionMatrix();
      tmp.forEach(m => impScene.add(m));
      const rt = new THREE.WebGLRenderTarget(IW, IW * 2, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      renderer.setRenderTarget(rt); renderer.setClearColor(new THREE.Color().setRGB(0.08, 0.1, 0.06), 0); renderer.clear();
      HZ.windUniforms.uWind.value = 0;
      renderer.render(impScene, impCam);
      HZ.windUniforms.uWind.value = 1;
      tmp.forEach(m => impScene.remove(m));
      a.impTex = rt.texture; a.impW = w; a.impBottom = bb.min.y; a.impTop = bb.max.y + 0.1;
    }
    renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevClear, prevAlpha);

    // scatters de árvores (perto: geometria completa; longe: impostores)
    const mTmp = new THREE.Matrix4(), qTmp = new THREE.Quaternion(), sTmp = V(), pTmp = V(), eTmp = new THREE.Euler();
    const tScat = {};
    for (const sp of Object.keys(archetypes)) {
      tScat[sp] = archetypes[sp].map(a => {
        const near = {
          wood: new Scatter(a.wood, barkMats[sp], { cell: 24, radius: q.treeNear, castShadow: true, objRadius: a.crown, objHeight: a.height, margin: 26, depthMat: woodDepth }),
          leaves: a.leaves ? new Scatter(a.leaves, leafMats[sp], { cell: 24, radius: q.treeNear, castShadow: true, objRadius: a.crown, objHeight: a.height, margin: 26, depthMat: depthMats[sp], colors: true }) : null,
        };
        // impostor: 3 planos cruzados
        const ig = new THREE.BufferGeometry(); const ipos = [], iuv = [], inor = [], iidx = [];
        for (let k = 0; k < 3; k++) {
          const ang = (k * Math.PI) / 3, cx = Math.cos(ang), cz = Math.sin(ang), b = ipos.length / 3;
          const hw = a.impW / 2;
          ipos.push(-cx * hw, a.impBottom, -cz * hw, cx * hw, a.impBottom, cz * hw, cx * hw, a.impTop, cz * hw, -cx * hw, a.impTop, -cz * hw);
          iuv.push(0, 0, 1, 0, 1, 1, 0, 1);
          for (let r = 0; r < 4; r++) inor.push(0, 1, 0);
          iidx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
        ig.setAttribute('position', new THREE.Float32BufferAttribute(ipos, 3)); ig.setAttribute('uv', new THREE.Float32BufferAttribute(iuv, 2)); ig.setAttribute('normal', new THREE.Float32BufferAttribute(inor, 3)); ig.setIndex(iidx);
        const im = new THREE.MeshBasicMaterial({ map: a.impTex, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color().setRGB(0.82, 0.86, 0.82) });
        if (q.samples > 0) im.alphaToCoverage = true;
        const far = new Scatter(ig, im, { cell: 48, radius: q.far, minRadius: q.treeNear - 4, objRadius: a.crown, objHeight: a.height, margin: 10, receiveShadow: false });
        return { near, far, a };
      });
    }
    for (const t of treeList) {
      const set = tScat[t.sp][t.v];
      const y = t.outer ? rawHeight(t.x, t.z) : heightAt(t.x, t.z);
      qTmp.setFromEuler(eTmp.set((rT() - 0.5) * 0.04, t.rot, (rT() - 0.5) * 0.04));
      sTmp.set(t.s, t.s * (0.9 + rT() * 0.2), t.s);
      mTmp.compose(pTmp.set(t.x, y, t.z), qTmp, sTmp);
      const tint = t.sp === 'birch' ? [1, 1, 1] : [0.85 + rT() * 0.3, 0.88 + rT() * 0.24, 0.8 + rT() * 0.25];
      if (!t.outer) {
        set.near.wood.add(mTmp);
        if (set.near.leaves) set.near.leaves.add(mTmp, tint);
        physics.addTree(t.x, t.z, set.a.trunkR * t.s * 1.05 + 0.04, set.a.height * t.s);
        world.trees.push(t);
      }
      set.far.add(mTmp);
    }
    for (const sp of Object.keys(tScat)) for (const s of tScat[sp]) {
      world.layers.push(s.near.wood, s.far); if (s.near.leaves) world.layers.push(s.near.leaves);
      s.near.wood.build(scene); s.far.build(scene); if (s.near.leaves) s.near.leaves.build(scene);
    }

    // ------------------------------------------------ rochas (colisão real)
    await prog(0.68, 'Posicionando rochas e troncos caídos');
    const rockMat = new THREE.MeshStandardMaterial({ map: tx.rock, normalMap: tx.rockN, normalScale: new THREE.Vector2(1.4, 1.4), vertexColors: true, roughness: 0.92, envMapIntensity: 0.5 });
    const rockArch = [];
    const rR = HZ.rng(9090);
    for (let a = 0; a < 6; a++) {
      const g = new THREE.IcosahedronGeometry(1, quality === 'baixa' ? 3 : 4);
      const p = g.attributes.position, n = p.count, seed = a * 13 + 1;
      const flat = 0.5 + rR() * 0.35, cut = -0.25 - rR() * 0.2;
      for (let i = 0; i < n; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 1 + HZ.perlin(x * 1.1 + seed, y * 1.1 + z * 0.7, seed) * 0.32 + HZ.perlin(x * 3.2 + z, y * 3.2 - seed, seed + 1) * 0.1 + HZ.perlin(x * 8 + seed, z * 8 + y, seed + 2) * 0.03;
        let nx = x * k, ny = y * k * flat, nz = z * k;
        // facetas planas (rocha fraturada)
        const f1 = nx * 0.7 + ny * 0.3 + nz * 0.5; if (f1 > 0.75) { const d = f1 - 0.75; nx -= 0.7 * d; ny -= 0.3 * d; nz -= 0.5 * d; }
        if (ny < cut) ny = cut + (ny - cut) * 0.2;
        p.setXYZ(i, nx, ny, nz);
      }
      g.computeVertexNormals();
      const nr = g.attributes.normal, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const y = p.getY(i), up = nr.getY(i), x = p.getX(i), z = p.getZ(i);
        const moss = HZ.smooth(0.45, 0.85, up + HZ.perlin(x * 2.5 + seed, z * 2.5, seed + 3) * 0.35) * 0.9;
        const ao = HZ.smooth(cut - 0.05, cut + 0.5, y);
        const base = 0.62 + HZ.perlin(x * 1.7, z * 1.7 + y, seed + 4) * 0.12;
        const r = HZ.lerp(base, 0.32, moss), gg = HZ.lerp(base * 0.98, 0.42, moss), b = HZ.lerp(base * 0.93, 0.16, moss);
        const s = 0.45 + 0.55 * ao;
        col[i * 3] = r * s; col[i * 3 + 1] = gg * s; col[i * 3 + 2] = b * s;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.translate(0, -cut - 0.12, 0); // base levemente enterrada
      const hg = HZ.Physics.heightGrid(g, 30);
      rockArch.push({ g, hg, scat: new Scatter(g, rockMat, { cell: 32, radius: q.treeNear * 1.1, castShadow: true, objRadius: 4, objHeight: 3, margin: 12 }) });
    }
    const placeRock = (x, z, s, arch) => {
      if (Math.abs(x) > BOUND + 8 || Math.abs(z) > BOUND + 8) return false;
      if (trailDist(x, z) < 2 + s) return false;
      if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6 + s) return false;
      if (Math.hypot(x - POND.x, z - POND.z) < 15) return false;
      let clash = false;
      physics.query(x, z, s * 1.2 + 0.5, o => { if (o.type === 'tree' && Math.hypot(o.x - x, o.z - z) < s * 1.1 + o.r) clash = true; });
      if (clash) return false;
      const ra = rockArch[arch];
      const rot = rR() * Math.PI * 2, sy = s * (0.75 + rR() * 0.5);
      // afunda de acordo com o declive
      const y = Math.min(heightAt(x - s * 0.6, z), heightAt(x + s * 0.6, z), heightAt(x, z - s * 0.6), heightAt(x, z + s * 0.6), heightAt(x, z)) - 0.05 * s;
      mTmp.compose(pTmp.set(x, y, z), qTmp.setFromEuler(eTmp.set(0, rot, 0)), sTmp.set(s, sy, s));
      ra.scat.add(mTmp);
      physics.addRock(x, y, z, rot, s, sy, ra.hg);
      world.rocks.push({ x, y, z, s });
      return true;
    };
    {
      let placed = 0, tries = 0;
      while (placed < 55 && tries < 2000) { // aglomerados de rochas
        tries++;
        const cx = (rR() - 0.5) * 2 * BOUND, cz = (rR() - 0.5) * 2 * BOUND;
        const n = 1 + ((rR() * 5) | 0);
        for (let i = 0; i < n; i++) {
          const s = i === 0 ? 1.1 + rR() * 1.9 : 0.35 + rR() * 1.0;
          if (placeRock(cx + (rR() - 0.5) * 7, cz + (rR() - 0.5) * 7, s, (rR() * 6) | 0)) placed += i === 0 ? 1 : 0;
        }
      }
      // rocha grande perto do início (para testar a colisão/escalada)
      placeRock(SPAWN.x + 7, SPAWN.z - 10, 1.6, 2);
      placeRock(SPAWN.x - 9, SPAWN.z - 6, 0.9, 4);
      for (let i = 0; i < 160; i++) placeRock((rR() - 0.5) * 2 * BOUND, (rR() - 0.5) * 2 * BOUND, 0.3 + rR() * 0.7, (rR() * 6) | 0);
    }
    rockArch.forEach(r => { r.scat.build(scene); world.layers.push(r.scat); });

    // ------------------------------------------------ troncos caídos e tocos
    {
      const logMat = new THREE.MeshStandardMaterial({ map: tx.barkPine, normalMap: tx.barkPineN, vertexColors: true, roughness: 0.95, envMapIntensity: 0.45 });
      const logs = [];
      const rL = HZ.rng(3131);
      const logGeo = (L, r) => {
        const pts = [], secs = [];
        for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V(-L / 2 + L * t, 0, (rL() - 0.5) * 0.08)); secs.push(r * (1 - 0.25 * t)); }
        const g = HZ.loft(pts, secs, {
          radial: 10, ref: V(0, 0, 1), capStart: true, capEnd: true, vScale: 1 / (Math.PI * 2 * r * 2),
          radiusFn: (ph, s) => 1 + 0.05 * Math.sin(ph * 7 + s * 9),
          color: (c, sn, s, p, nx, ny) => { const moss = HZ.smooth(0.3, 0.8, ny + HZ.perlin(p.x * 2, p.z * 3, 88) * 0.4); const b = 0.75; return [HZ.lerp(b, 0.38, moss), HZ.lerp(b, 0.5, moss), HZ.lerp(b, 0.2, moss)]; },
        });
        return g;
      };
      const logArch = [logGeo(6, 0.32), logGeo(9, 0.42), logGeo(4.5, 0.24)];
      const logScat = logArch.map(g => new Scatter(g, logMat, { cell: 32, radius: q.treeNear, castShadow: true, objRadius: 5, objHeight: 1, margin: 10 }));
      let n = 0, tries = 0;
      while (n < 70 && tries < 900) {
        tries++;
        const x = (rL() - 0.5) * 2 * BOUND, z = (rL() - 0.5) * 2 * BOUND;
        if (forest(x, z) < 0.35 || trailDist(x, z) < 6 || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 12 || Math.hypot(x - POND.x, z - POND.z) < 20) continue;
        const k = (rL() * 3) | 0, L = [6, 9, 4.5][k], r = [0.32, 0.42, 0.24][k], rot = rL() * Math.PI * 2;
        const ax = x - Math.cos(rot) * L / 2, az = z + Math.sin(rot) * L / 2, bx = x + Math.cos(rot) * L / 2, bz = z - Math.sin(rot) * L / 2;
        let clash = false;
        for (let s = 0; s <= 1; s += 0.2) physics.query(ax + (bx - ax) * s, az + (bz - az) * s, r + 0.6, o => { if (o.type === 'tree' || o.type === 'rock') clash = true; });
        if (clash) continue;
        const ya = heightAt(ax, az) + r * 0.72, yb = heightAt(bx, bz) + r * 0.72 * 0.75;
        const tilt = Math.atan2(yb - ya, L);
        mTmp.compose(pTmp.set(x, (ya + yb) / 2, z), qTmp.setFromEuler(eTmp.set(0, rot, tilt, 'YZX')), sTmp.set(1, 1, 1));
        logScat[k].add(mTmp);
        physics.addLog(ax, ya, az, bx, yb, bz, r * 0.95);
        logs.push({ ax, az, bx, bz });
        n++;
      }
      logScat.forEach(s => { s.build(scene); world.layers.push(s); });
      world.logs = logs;

      // tocos com anéis no topo
      const stumpG = new THREE.CylinderGeometry(0.34, 0.46, 0.7, 12, 1, false);
      stumpG.translate(0, 0.25, 0);
      const stumpMats = [new THREE.MeshStandardMaterial({ map: tx.barkOak, normalMap: tx.barkOakN, roughness: 0.95, envMapIntensity: 0.45 }), new THREE.MeshStandardMaterial({ map: tx.rings, roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tx.rings, roughness: 0.9 })];
      const stumpScat = new Scatter(stumpG, stumpMats, { cell: 32, radius: q.treeNear * 0.8, castShadow: true, objRadius: 1, objHeight: 1, margin: 6 });
      let sN = 0; tries = 0;
      while (sN < 80 && tries < 900) {
        tries++;
        const x = (rL() - 0.5) * 2 * BOUND, z = (rL() - 0.5) * 2 * BOUND;
        if (forest(x, z) < 0.25 || trailDist(x, z) < 3 || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 7) continue;
        let clash = false; physics.query(x, z, 1.2, o => { clash = true; }); if (clash) continue;
        const s = 0.7 + rL() * 0.7, y = heightAt(x, z), sy = s * (0.7 + rL() * 0.6);
        mTmp.compose(pTmp.set(x, y, z), qTmp.setFromEuler(eTmp.set((rL() - 0.5) * 0.08, rL() * 6, (rL() - 0.5) * 0.08)), sTmp.set(s, sy, s));
        stumpScat.add(mTmp);
        physics.addStump(x, z, 0.46 * s, y + 0.6 * sy);
        sN++;
      }
      stumpScat.build(scene); world.layers.push(stumpScat);
    }

    // ------------------------------------------------ sub-bosque em camadas
    await prog(0.8, 'Espalhando samambaias, arbustos e grama');
    const rU = HZ.rng(5151);
    const insideObstacle = (x, z, r = 0.3) => { let hit = false; physics.query(x, z, r + 0.5, o => { if (hit) return; if (o.type === 'tree') { if (Math.hypot(x - o.x, z - o.z) < o.r + r) hit = true; } else if (physics.objTop(o, x, z, r) > -Infinity) hit = true; }); return hit; };
    const inWater = (x, z) => heightAt(x, z) < HZ.WATER_Y + 0.05 && Math.hypot(x - POND.x, z - POND.z) < 20;
    const place = (scat, x, z, s, rotY, tilt, color) => {
      const y = heightAt(x, z);
      const nrm = HZ.groundNormal(x, z);
      qTmp.setFromUnitVectors(V(0, 1, 0), V(nrm.x * tilt, 1, nrm.z * tilt).normalize());
      const qy = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rotY);
      qTmp.multiply(qy);
      mTmp.compose(pTmp.set(x, y, z), qTmp, sTmp.set(s, s, s));
      scat.add(mTmp, color);
    };

    // grama densa gerada ao redor do jogador
    {
      const gm = foliageMaterial(tx.grass, tx.grassA, { fade: fadeGrass, color: 0xd8e0c0, trans: 0.4, alphaTest: 0.38, key: 'grass', env: 0.6 });
      const geos = [HZ.veg.grassClump(rU, 0.8, 0.5), HZ.veg.grassClump(rU, 0.7, 0.75), HZ.veg.grassClump(rU, 1.0, 0.42)];
      const maxVis = Math.round(Math.PI * q.grassR * q.grassR * q.grassD * 0.55);
      const grass = new DynamicScatter(geos, gm, {
        cell: 8, radius: q.grassR, density: q.grassD, seed: 1717, maxVisible: maxVis,
        gen: (r, x, z) => {
          if (Math.abs(x) > HALF - 1 || Math.abs(z) > HALF - 1) return null;
          const D = forest(x, z), td = trailDist(x, z);
          let p = (1 - D) * 0.92 + 0.06 + (td > 1.2 && td < 3.5 ? 0.4 : 0);
          p *= 0.5 + 0.5 * (HZ.perlin(x * 0.08, z * 0.08, 71) * 0.5 + 0.5);
          if (td < 1.0 || r() > p || inWater(x, z)) return null;
          const dry = HZ.clamp(HZ.perlin(x * 0.03, z * 0.03, 72) * 0.8 + 0.3, 0, 1);
          const c = [HZ.lerp(0.78, 1.15, dry) * (0.85 + r() * 0.3), HZ.lerp(0.92, 1.0, dry) * (0.88 + r() * 0.24), HZ.lerp(0.62, 0.66, dry)];
          const k = r() < 0.5 ? 0 : r() < 0.6 ? 1 : 2;
          return { k, s: (0.7 + r() * 0.7) * (1.15 - D * 0.35), rot: r() * 6.28, tilt: 0.6, c };
        },
      });
      grass.build(scene); world.layers.push(grass);
      // flores silvestres nas clareiras
      const flm = foliageMaterial(tx.flower, tx.flowerA, { fade: { value: new THREE.Vector2(20, 30) }, key: 'flower', trans: 0.3 });
      const tints = [[1, 1, 1], [1, 0.95, 0.5], [0.75, 0.6, 1], [1, 0.75, 0.85]];
      const flowers = new DynamicScatter([HZ.veg.flower(rU)], flm, {
        cell: 8, radius: 30, density: 0.5, seed: 2323, maxVisible: 2500,
        gen: (r, x, z) => {
          const D = forest(x, z), patch = HZ.perlin(x * 0.07, z * 0.07, 74);
          if (D > 0.45 || patch < 0.15 || r() > 0.8 || trailDist(x, z) < 1.3 || inWater(x, z)) return null;
          return { k: 0, s: 0.6 + r() * 0.7, rot: r() * 6.28, tilt: 0.5, c: tints[((patch * 13) | 0) % 4] };
        },
      });
      flowers.build(scene); world.layers.push(flowers);
    }
    // samambaias
    {
      const fm = foliageMaterial(tx.fern, tx.fernA, { color: 0xc8dcb0, trans: 0.45, key: 'fern', env: 0.55, fade: { value: new THREE.Vector2(q.fernR * 0.75, q.fernR) } });
      const geos = [HZ.veg.fern(rU), HZ.veg.fern(rU)];
      const scats = geos.map(g => new Scatter(g, fm, { cell: 16, radius: q.fernR, objRadius: 1.5, objHeight: 1, colors: true, castShadow: quality === 'alta', depthMat: quality === 'alta' ? depthMaterial(tx.fernA) : undefined }));
      let n = 0, tries = 0;
      while (n < q.fern && tries < q.fern * 8) {
        tries++;
        const x = (rU() - 0.5) * 2 * (BOUND + 8), z = (rU() - 0.5) * 2 * (BOUND + 8);
        const D = forest(x, z);
        const patch = HZ.perlin(x * 0.05, z * 0.05, 73) * 0.5 + 0.5;
        if (rU() > D * patch * 1.4 || trailDist(x, z) < 1.8 || inWater(x, z) || insideObstacle(x, z, 0.3)) continue;
        const c = [0.85 + rU() * 0.3, 0.9 + rU() * 0.2, 0.8 + rU() * 0.2];
        place(scats[n % 2], x, z, 0.75 + rU() * 0.75, rU() * 6.28, 0.5, c);
        n++;
      }
      scats.forEach(s => { s.build(scene); world.layers.push(s); });
    }
    // arbustos + mudas de abeto
    {
      const bm = foliageMaterial(tx.bushLeaves, tx.bushLeavesA, { color: 0xd8e4c8, trans: 0.45, key: 'bush' });
      const bwood = woodMaterial(tx.barkOak, tx.barkOakN, { key: 'bw' });
      const bushes = [HZ.veg.bush(rU), HZ.veg.bush(rU), HZ.veg.bush(rU)];
      const bs = bushes.map(b => ({ l: new Scatter(b.leaves, bm, { cell: 24, radius: q.treeNear * 0.9, castShadow: true, depthMat: depthMaterial(tx.bushLeavesA), objRadius: 2, objHeight: 1.5, colors: true, margin: 6 }), w: new Scatter(b.wood, bwood, { cell: 24, radius: 35, objRadius: 2, objHeight: 1.5 }) }));
      const saps = [HZ.veg.spruce(rU, q, 1.8), HZ.veg.spruce(rU, q, 2.8), HZ.veg.spruce(rU, q, 3.8)];
      const ss = saps.map(a => ({ l: new Scatter(a.leaves, leafMats.spruce, { cell: 24, radius: q.treeNear * 0.9, castShadow: true, depthMat: depthMats.spruce, objRadius: 1.5, objHeight: 4, colors: true, margin: 8 }), w: new Scatter(a.wood, barkMats.spruce, { cell: 24, radius: 50, objRadius: 1, objHeight: 4 }) }));
      let n = 0, tries = 0;
      while (n < q.bush && tries < q.bush * 10) {
        tries++;
        const x = (rU() - 0.5) * 2 * (BOUND + 8), z = (rU() - 0.5) * 2 * (BOUND + 8);
        const D = forest(x, z), edge = 1 - Math.abs(D - 0.45) * 2;
        if (rU() > 0.25 + edge * 0.6 || trailDist(x, z) < 2.2 || inWater(x, z) || insideObstacle(x, z, 0.6) || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 5) continue;
        const k = n % 3, s = 0.7 + rU() * 0.7, rot = rU() * 6.28;
        const c = [0.8 + rU() * 0.35, 0.85 + rU() * 0.25, 0.75 + rU() * 0.25];
        place(bs[k].l, x, z, s, rot, 0.2, c); place(bs[k].w, x, z, s, rot, 0.2);
        n++;
      }
      n = 0; tries = 0;
      while (n < q.sapling && tries < q.sapling * 10) {
        tries++;
        const x = (rU() - 0.5) * 2 * (BOUND + 8), z = (rU() - 0.5) * 2 * (BOUND + 8);
        const D = forest(x, z);
        if (rU() > D * 0.9 || trailDist(x, z) < 2.5 || inWater(x, z) || insideObstacle(x, z, 0.4) || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6) continue;
        const k = n % 3, s = 0.8 + rU() * 0.5, rot = rU() * 6.28;
        place(ss[k].l, x, z, s, rot, 0, [0.85 + rU() * 0.25, 0.9 + rU() * 0.2, 0.85]); place(ss[k].w, x, z, s, rot, 0);
        n++;
      }
      [...bs, ...ss].forEach(o => { o.l.build(scene); o.w.build(scene); world.layers.push(o.l, o.w); });
    }
    // flores, cogumelos, gravetos, pedrinhas, juncos
    {
      const plainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, envMapIntensity: 0.5 });
      const mushA = new Scatter(HZ.veg.mushroom([0.62, 0.42, 0.24], [0.9, 0.86, 0.78], rU), plainMat, { cell: 12, radius: 28 });
      const mushB = new Scatter(HZ.veg.mushroom([0.7, 0.08, 0.05], [0.95, 0.93, 0.88], rU), plainMat, { cell: 12, radius: 28 });
      const trees = world.trees;
      for (let i = 0; i < q.mushrooms; i++) {
        const t = trees[(rU() * trees.length) | 0]; if (!t) break;
        const a = rU() * 6.28, d = 0.6 + rU() * 1.6, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
        if (insideObstacle(x, z, 0.1)) continue;
        place(rU() < 0.8 ? mushA : mushB, x, z, 0.7 + rU() * 0.9, rU() * 6.28, 1);
      }
      mushA.build(scene); mushB.build(scene); world.layers.push(mushA, mushB);

      const twigMat = new THREE.MeshStandardMaterial({ map: tx.barkOak, vertexColors: true, roughness: 0.95 });
      const tw = [HZ.veg.twig(rU), HZ.veg.twig(rU), HZ.veg.twig(rU)].map(g => new Scatter(g, twigMat, { cell: 12, radius: 30 }));
      for (let i = 0; i < q.twigs; i++) {
        const x = (rU() - 0.5) * 2 * BOUND, z = (rU() - 0.5) * 2 * BOUND;
        if (rU() > forest(x, z) + 0.1 || inWater(x, z)) continue;
        place(tw[i % 3], x, z, 0.7 + rU() * 0.8, rU() * 6.28, 1);
      }
      tw.forEach(s => { s.build(scene); world.layers.push(s); });

      const stoneMat = new THREE.MeshStandardMaterial({ map: tx.rock, vertexColors: true, roughness: 0.9 });
      const stn = [HZ.veg.stone(rU), HZ.veg.stone(rU), HZ.veg.stone(rU)].map(g => new Scatter(g, stoneMat, { cell: 12, radius: 34, receiveShadow: true }));
      for (let i = 0; i < q.stones; i++) {
        const x = (rU() - 0.5) * 2 * BOUND, z = (rU() - 0.5) * 2 * BOUND;
        const td = trailDist(x, z);
        if (rU() > (td < 3 ? 0.9 : 0.3)) continue;
        place(stn[i % 3], x, z, 0.4 + rU() * 1.4, rU() * 6.28, 1);
      }
      stn.forEach(s => { s.build(scene); world.layers.push(s); });

      const reedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
      HZ.applyWind(reedMat, { key: 'reed' });
      const rs = new Scatter(HZ.veg.reeds(rU), reedMat, { cell: 16, radius: 80 });
      for (let i = 0; i < 260; i++) {
        const a = rU() * 6.28, d = 10 + rU() * 8, x = POND.x + Math.cos(a) * d, z = POND.z + Math.sin(a) * d;
        const h = heightAt(x, z);
        if (h < HZ.WATER_Y - 0.5 || h > HZ.WATER_Y + 0.8) continue;
        place(rs, x, z, 0.8 + rU() * 0.6, rU() * 6.28, 0.3);
      }
      rs.build(scene); world.layers.push(rs);
      // vitórias-régias
      const padG = new THREE.CircleGeometry(0.35, 12, 0.3, Math.PI * 2 - 0.6); padG.rotateX(-Math.PI / 2);
      const pads = new THREE.InstancedMesh(padG, new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.12, 0.22, 0.06), roughness: 0.4, side: THREE.DoubleSide }), 40);
      for (let i = 0; i < 40; i++) { const a = rU() * 6.28, d = rU() * 9; mTmp.compose(pTmp.set(POND.x + Math.cos(a) * d, HZ.WATER_Y + 0.02, POND.z + Math.sin(a) * d), qTmp.setFromEuler(eTmp.set(0, rU() * 6, 0)), sTmp.setScalar(0.6 + rU() * 0.9)); pads.setMatrixAt(i, mTmp); }
      pads.receiveShadow = true; scene.add(pads);
    }

    await prog(0.92, 'Ajustando a luz');
    world.update = function (cam, dt, t) {
      HZ.windUniforms.uTime.value = t;
      world.sky.position.copy(cam.position);
      world.skyU.uTime.value = t;
      if (world.mountains) world.mountains.forEach(m => { m.position.x = cam.position.x; m.position.z = cam.position.z; });
      // sombra acompanha o jogador, com "snap" para evitar cintilação
      const texel = (2 * q.shadowR) / q.shadow;
      const tx0 = Math.round(cam.position.x / texel) * texel, tz0 = Math.round(cam.position.z / texel) * texel;
      const ty = heightAt(cam.position.x, cam.position.z);
      sun.target.position.set(tx0, ty, tz0);
      sun.position.set(tx0 + sunDir.x * 150, ty + sunDir.y * 150, tz0 + sunDir.z * 150);
      shared.uSunView.value.copy(sunDir).transformDirection(cam.matrixWorldInverse);
      if (world.water) { world.water.material.normalMap.offset.set(t * 0.012, t * 0.007); }
      // atualização escalonada das camadas de instâncias
      const L = world.layers;
      world._frame = (world._frame || 0) + 1;
      for (let i = 0; i < L.length; i++) if ((i + world._frame) % 3 === 0 || world._force) L[i].update(cam, world._force);
      world._force = false;
    };
    world.forceUpdate = () => { world._force = true; };
    world.trailDist = trailDist;
    world.heightAt = heightAt;
    return world;
  };
})();
