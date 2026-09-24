/* HUNTERZ — mundo de colisão: árvores (cilindros), rochas (mapas de altura reais da malha),
   troncos caídos (cápsulas), tocos (cilindros baixos) e raycast balístico. */
(function () {
  'use strict';
  const HZ = window.HZ;
  const THREE = window.THREE;

  const CELL = 8;
  const key = (cx, cz) => (cx + 2048) * 4096 + (cz + 2048);

  class Physics {
    constructor(heightAt) {
      this.heightAt = heightAt;
      this.grid = new Map();
      this.stamp = 1;
      this.objects = [];
    }

    add(o) {
      o._stamp = 0;
      const r = o.br;
      const x0 = Math.floor((o.cx - r) / CELL), x1 = Math.floor((o.cx + r) / CELL);
      const z0 = Math.floor((o.cz - r) / CELL), z1 = Math.floor((o.cz + r) / CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = key(x, z); let c = this.grid.get(k); if (!c) { c = []; this.grid.set(k, c); } c.push(o);
      }
      this.objects.push(o);
      return o;
    }

    addTree(x, z, r, height) { return this.add({ type: 'tree', cx: x, cz: z, x, z, r, br: r + 0.1, y: this.heightAt(x, z) - 0.5, top: this.heightAt(x, z) + height }); }
    addStump(x, z, r, top) { return this.add({ type: 'cyl', cx: x, cz: z, x, z, r, br: r + 0.1, y: this.heightAt(x, z) - 0.3, top }); }
    addLog(ax, ay, az, bx, by, bz, r) {
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      return this.add({ type: 'log', cx, cz, ax, ay, az, bx, by, bz, r, br: Math.hypot(bx - ax, bz - az) / 2 + r + 0.1 });
    }
    // rocha: grade de alturas local (unidade), com rotação Y e escala
    addRock(x, y, z, rot, sxz, sy, hg) {
      return this.add({ type: 'rock', cx: x, cz: z, x, y, z, cos: Math.cos(rot), sin: Math.sin(rot), sxz, sy, hg, br: hg.ext * sxz * 1.02, top: y + hg.max * sy });
    }

    query(x, z, rad, cb) {
      const st = ++this.stamp;
      const x0 = Math.floor((x - rad) / CELL), x1 = Math.floor((x + rad) / CELL);
      const z0 = Math.floor((z - rad) / CELL), z1 = Math.floor((z + rad) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const c = this.grid.get(key(cx, cz)); if (!c) continue;
        for (let i = 0; i < c.length; i++) { const o = c[i]; if (o._stamp === st) continue; o._stamp = st; cb(o); }
      }
    }

    // altura da superfície de uma rocha num ponto (world), ou -Infinity
    rockHeight(o, x, z) {
      const dx = x - o.x, dz = z - o.z;
      // rotação inversa (Y)
      const lx = (dx * o.cos - dz * o.sin) / o.sxz;
      const lz = (dx * o.sin + dz * o.cos) / o.sxz;
      const hg = o.hg, n = hg.n;
      const gx = Math.round(((lx + hg.ext) / (2 * hg.ext)) * (n - 1));
      const gz = Math.round(((lz + hg.ext) / (2 * hg.ext)) * (n - 1));
      if (gx < 0 || gz < 0 || gx >= n || gz >= n) return -Infinity;
      const h = hg.data[gz * n + gx];
      return h <= -50 ? -Infinity : o.y + h * o.sy;
    }

    objTop(o, x, z, rad) {
      if (o.type === 'rock') {
        let m = this.rockHeight(o, x, z);
        if (rad > 0) {
          const rr = rad * 0.85;
          for (let i = 0; i < 8; i++) { const a = i * 0.785398; const h = this.rockHeight(o, x + Math.cos(a) * rr, z + Math.sin(a) * rr); if (h > m) m = h; }
        }
        return m;
      }
      if (o.type === 'log') {
        const vx = o.bx - o.ax, vz = o.bz - o.az, L2 = vx * vx + vz * vz;
        let t = ((x - o.ax) * vx + (z - o.az) * vz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = o.ax + vx * t, pz = o.az + vz * t, d = Math.hypot(x - px, z - pz);
        const e = Math.max(0, d - rad);
        if (e >= o.r) return -Infinity;
        return o.ay + (o.by - o.ay) * t + Math.sqrt(o.r * o.r - e * e);
      }
      if (o.type === 'cyl') { const d = Math.hypot(x - o.x, z - o.z); return d < o.r + rad ? o.top : -Infinity; }
      return -Infinity;
    }

    // topo máximo dos obstáculos "pisáveis" sob um círculo
    topAt(x, z, rad) {
      let m = -Infinity;
      this.query(x, z, rad + 0.5, o => { if (o.type !== 'tree') { const h = this.objTop(o, x, z, rad); if (h > m) m = h; } });
      return m;
    }

    groundAt(x, z, rad = 0) { return Math.max(this.heightAt(x, z), this.topAt(x, z, rad)); }

    // empurra um círculo para fora dos troncos de árvore
    resolveTrees(p, rad) {
      let hit = false;
      this.query(p.x, p.z, rad + 1, o => {
        if (o.type !== 'tree') return;
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), min = o.r + rad;
        if (d < min) { const k = d > 1e-5 ? 1 / d : 0; p.x = o.x + (k ? dx * k : 1) * min; p.z = o.z + (k ? dz * k : 0) * min; hit = true; }
      });
      return hit;
    }

    // Movimento de personagem com deslizamento. p = {x,y,z} (pés). Retorna info.
    moveCircle(p, dx, dz, rad, step, bounds) {
      const res = { blockedX: false, blockedZ: false, ground: 0 };
      const len = Math.hypot(dx, dz);
      const n = Math.max(1, Math.ceil(len / 0.2));
      const sx = dx / n, sz = dz / n;
      const tmp = { x: 0, z: 0 };
      for (let i = 0; i < n; i++) {
        const curBlockedTop = this.groundAt(p.x, p.z, rad);
        const tryPos = (nx, nz) => {
          if (bounds) { nx = HZ.clamp(nx, -bounds, bounds); nz = HZ.clamp(nz, -bounds, bounds); }
          tmp.x = nx; tmp.z = nz; this.resolveTrees(tmp, rad);
          const g = this.groundAt(tmp.x, tmp.z, rad);
          // bloqueado se o obstáculo for mais alto que o degrau (e mais alto do que onde já estamos, para escapar)
          if (g > p.y + step && g > curBlockedTop - 0.01) return false;
          p.x = tmp.x; p.z = tmp.z; return true;
        };
        if (tryPos(p.x + sx, p.z + sz)) continue;
        const okX = sx !== 0 && tryPos(p.x + sx, p.z);
        const okZ = sz !== 0 && tryPos(p.x, p.z + sz);
        if (!okX) res.blockedX = true;
        if (!okZ) res.blockedZ = true;
        if (!okX && !okZ) break;
      }
      res.ground = this.groundAt(p.x, p.z, rad);
      return res;
    }

    // teste rápido: caminho livre para animais (sem árvores/rochas altas)
    isBlocked(x, z, rad, y, step) {
      let blocked = false;
      this.query(x, z, rad + 1, o => {
        if (blocked) return;
        if (o.type === 'tree') { if (Math.hypot(x - o.x, z - o.z) < o.r + rad) blocked = true; }
        else if (this.objTop(o, x, z, rad) > y + step) blocked = true;
      });
      return blocked;
    }

    // ------------------------------------------------------------ Raycast
    // Retorna {t, point, normal, kind, obj} ou null
    raycast(origin, dir, maxDist, skipTerrain) {
      let best = null;
      const consider = (t, kind, obj, normal) => { if (t >= 0 && t < maxDist && (!best || t < best.t)) best = { t, kind, obj, normal }; };
      const st = ++this.stamp;
      const cand = [];
      const stepC = CELL * 0.5;
      const nS = Math.ceil(maxDist / stepC) + 1;
      for (let i = 0; i <= nS; i++) {
        const px = origin.x + dir.x * i * stepC, pz = origin.z + dir.z * i * stepC;
        const cx0 = Math.floor(px / CELL), cz0 = Math.floor(pz / CELL);
        for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
          const c = this.grid.get(key(cx0 + ox, cz0 + oz)); if (!c) continue;
          for (const o of c) { if (o._stamp === st) continue; o._stamp = st; cand.push(o); }
        }
      }
      const dxz = Math.hypot(dir.x, dir.z);
      for (const o of cand) {
        if (o.type === 'tree' || o.type === 'cyl') {
          // cilindro vertical
          const fx = origin.x - o.x, fz = origin.z - o.z;
          const a = dir.x * dir.x + dir.z * dir.z; if (a < 1e-8) continue;
          const b = 2 * (fx * dir.x + fz * dir.z), c = fx * fx + fz * fz - o.r * o.r;
          const disc = b * b - 4 * a * c; if (disc < 0) continue;
          const t = (-b - Math.sqrt(disc)) / (2 * a);
          if (t < 0) continue;
          const y = origin.y + dir.y * t;
          if (y < o.y || y > o.top) continue;
          const hx = origin.x + dir.x * t - o.x, hz = origin.z + dir.z * t - o.z, hl = Math.hypot(hx, hz) || 1;
          consider(t, o.type === 'tree' ? 'tree' : 'wood', o, new THREE.Vector3(hx / hl, 0, hz / hl));
        } else {
          // esfera envolvente + marcha
          const cy = o.type === 'rock' ? (o.y + o.top) / 2 : (o.ay + o.by) / 2;
          const R = o.type === 'rock' ? Math.max(o.br, (o.top - o.y) / 2 + 0.5) : o.br;
          const ocx = origin.x - o.cx, ocy = origin.y - cy, ocz = origin.z - o.cz;
          const b = ocx * dir.x + ocy * dir.y + ocz * dir.z, c = ocx * ocx + ocy * ocy + ocz * ocz - R * R;
          const disc = b * b - c; if (disc < 0) continue;
          const sq = Math.sqrt(disc); let t0 = Math.max(0, -b - sq); const t1 = -b + sq;
          if (t1 < 0 || (best && t0 > best.t)) continue;
          for (let t = t0; t <= t1; t += 0.06) {
            const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
            const top = this.objTop(o, x, z, 0);
            const bottom = o.type === 'rock' ? o.y - 0.8 : Math.min(o.ay, o.by) - o.r * 2;
            if (top > y && y > bottom) {
              let nrm;
              if (o.type === 'rock') nrm = new THREE.Vector3(x - o.x, (y - o.y) * 0.6, z - o.z).normalize();
              else nrm = new THREE.Vector3(-dir.x, 0.4, -dir.z).normalize();
              consider(t, o.type === 'rock' ? 'rock' : 'wood', o, nrm);
              break;
            }
          }
        }
      }
      if (!skipTerrain) {
        const lim = best ? best.t : maxDist;
        let prevT = 0, prevAbove = origin.y - this.heightAt(origin.x, origin.z) > 0;
        const step = 0.45;
        for (let t = step; t <= lim; t += step) {
          const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
          const above = y - this.heightAt(x, z) > 0;
          if (prevAbove && !above) {
            let lo = prevT, hi = t;
            for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2; const yy = origin.y + dir.y * m; if (yy - this.heightAt(origin.x + dir.x * m, origin.z + dir.z * m) > 0) lo = m; else hi = m; }
            const hx = origin.x + dir.x * hi, hz = origin.z + dir.z * hi;
            const e = 0.3;
            const nrm = new THREE.Vector3(this.heightAt(hx - e, hz) - this.heightAt(hx + e, hz), 2 * e, this.heightAt(hx, hz - e) - this.heightAt(hx, hz + e)).normalize();
            consider(hi, 'terrain', null, nrm);
            break;
          }
          prevAbove = above; prevT = t;
        }
      }
      if (best) best.point = new THREE.Vector3(origin.x + dir.x * best.t, origin.y + dir.y * best.t, origin.z + dir.z * best.t);
      void dxz;
      return best;
    }
  }

  // Constrói grade de alturas de uma geometria (espaço local) via raycast descendente
  Physics.heightGrid = function (geometry, n = 28) {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const ext = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z)) * 1.02;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.updateMatrixWorld(true);
    const rc = new THREE.Raycaster();
    const data = new Float32Array(n * n);
    let max = 0;
    const o = new THREE.Vector3(), d = new THREE.Vector3(0, -1, 0);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -ext + (i / (n - 1)) * 2 * ext, z = -ext + (j / (n - 1)) * 2 * ext;
      o.set(x, bb.max.y + 1, z); rc.set(o, d);
      const h = rc.intersectObject(mesh, false)[0];
      const v = h ? h.point.y : -99;
      data[j * n + i] = v; if (v > max) max = v;
    }
    return { n, ext, data, max };
  };

  HZ.Physics = Physics;
})();
