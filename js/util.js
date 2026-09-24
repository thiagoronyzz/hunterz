/* HUNTERZ — utilitários: RNG, ruído procedural, helpers de geometria e canvas. */
(function () {
  'use strict';
  const HZ = (window.HZ = window.HZ || {});
  const THREE = window.THREE;

  // ---------------------------------------------------------------- RNG
  HZ.rng = function (seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function hash2i(x, y, s) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return h >>> 0;
  }
  HZ.hash2 = function (x, y, s = 0) { return hash2i(x | 0, y | 0, s | 0) / 4294967296; };

  // ------------------------------------------------ Perlin 2D (tileável)
  const GX = new Float32Array(256), GY = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = (i / 256) * Math.PI * 2; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
  function perlin(x, y, seed = 0, period = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    let x0 = xi, y0 = yi, x1 = xi + 1, y1 = yi + 1;
    if (period) { x0 = ((x0 % period) + period) % period; x1 = ((x1 % period) + period) % period; y0 = ((y0 % period) + period) % period; y1 = ((y1 % period) + period) % period; }
    const h00 = hash2i(x0, y0, seed) & 255, h10 = hash2i(x1, y0, seed) & 255, h01 = hash2i(x0, y1, seed) & 255, h11 = hash2i(x1, y1, seed) & 255;
    const n00 = GX[h00] * xf + GY[h00] * yf;
    const n10 = GX[h10] * (xf - 1) + GY[h10] * yf;
    const n01 = GX[h01] * xf + GY[h01] * (yf - 1);
    const n11 = GX[h11] * (xf - 1) + GY[h11] * (yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const nx0 = n00 + (n10 - n00) * u, nx1 = n01 + (n11 - n01) * u;
    return (nx0 + (nx1 - nx0) * v) * 1.41; // ~[-1,1]
  }
  HZ.perlin = perlin;
  HZ.fbm = function (x, y, oct = 4, seed = 0, period = 0, lac = 2, gain = 0.5) {
    let a = 1, f = 1, sum = 0, norm = 0, p = period;
    for (let i = 0; i < oct; i++) {
      sum += a * perlin(x * f, y * f, seed + i * 17, p ? p * f : 0);
      norm += a; a *= gain; f *= lac;
    }
    return sum / norm;
  };
  HZ.ridged = function (x, y, oct = 4, seed = 0, period = 0) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      const n = 1 - Math.abs(perlin(x * f, y * f, seed + i * 31, period ? period * f : 0));
      sum += a * n * n; norm += a; a *= 0.5; f *= 2;
    }
    return sum / norm;
  };

  HZ.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  HZ.lerp = (a, b, t) => a + (b - a) * t;
  HZ.smooth = (a, b, v) => { const t = HZ.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  HZ.angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

  // --------------------------------------------------- Canvas & texturas
  HZ.canvas = function (w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  HZ.tex = function (canvas, opt = {}) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = opt.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.colorSpace = opt.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = HZ.maxAniso || 4;
    if (opt.repeat) t.repeat.set(opt.repeat[0], opt.repeat[1]);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };

  // Gera uma textura pixel a pixel. fn(u,v,x,y) -> [r,g,b,(a)] em 0..255
  HZ.pixelCanvas = function (w, h, fn) {
    const c = HZ.canvas(w, h), ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h), d = img.data;
    const out = [0, 0, 0, 255];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      out[3] = 255; fn(x / w, y / h, x, y, out);
      const i = (y * w + x) * 4; d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
    ctx.putImageData(img, 0, 0);
    return c;
  };

  // Normal map a partir da luminância de um canvas (tileável)
  HZ.normalFromCanvas = function (src, strength = 2, invert = false) {
    const w = src.width, h = src.height;
    const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
    const H = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) H[i] = (sd[i * 4] * 0.3 + sd[i * 4 + 1] * 0.59 + sd[i * 4 + 2] * 0.11) / 255 * (invert ? -1 : 1);
    const c = HZ.canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = H[y * w + ((x - 1 + w) % w)], r = H[y * w + ((x + 1) % w)];
      const u = H[((y - 1 + h) % h) * w + x], dn = H[((y + 1) % h) * w + x];
      let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  };

  // ------------------------------------------------ Geometria utilitária
  // Mescla BufferGeometries (indexadas ou não) com os mesmos atributos.
  HZ.merge = function (geos) {
    geos = geos.filter(Boolean);
    if (!geos.length) return new THREE.BufferGeometry();
    const list = geos.map(g => (g.index ? g : indexify(g)));
    const names = Object.keys(list[0].attributes);
    let vCount = 0, iCount = 0;
    list.forEach(g => { vCount += g.attributes.position.count; iCount += g.index.count; });
    const out = new THREE.BufferGeometry();
    for (const n of names) {
      const size = list[0].attributes[n].itemSize;
      const arr = new Float32Array(vCount * size);
      let off = 0;
      for (const g of list) {
        const a = g.attributes[n];
        if (!a) { off += g.attributes.position.count * size; continue; }
        for (let i = 0; i < a.count; i++) for (let k = 0; k < size; k++) arr[(off + i) * size + k] = getComp(a, i, k);
        off += a.count;
      }
      out.setAttribute(n, new THREE.BufferAttribute(arr, size));
    }
    const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
    let io = 0, vo = 0;
    for (const g of list) { const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx[io++] = ia[i] + vo; vo += g.attributes.position.count; }
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  };
  function getComp(a, i, k) { return k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : k === 2 ? a.getZ(i) : a.getW(i); }
  function indexify(g) { const n = g.attributes.position.count; const idx = []; for (let i = 0; i < n; i++) idx.push(i); g.setIndex(idx); return g; }

  // Garante que a geometria tenha todos os atributos pedidos (preenche com default)
  HZ.ensureAttrs = function (g, spec) {
    const n = g.attributes.position.count;
    for (const [name, size, def] of spec) {
      if (g.attributes[name]) continue;
      const arr = new Float32Array(n * size);
      for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = Array.isArray(def) ? def[k] : def;
      g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    return g;
  };

  // Tubo ao longo de um caminho 3D com seção elíptica (a = meia-altura, b = meia-largura).
  // opts: radial, ref (vetor lateral de referência), color(fn), wind(fn), capStart, capEnd, vScale, twist, radiusFn
  const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3();
  HZ.loft = function (path, sections, opts = {}) {
    const radial = opts.radial || 10;
    const ref = opts.ref || new THREE.Vector3(0, 0, 1);
    const N = path.length;
    const pos = [], nor = [], uv = [], col = [], wnd = [], idx = [];
    let len = 0;
    const lengths = [0];
    for (let i = 1; i < N; i++) { len += path[i].distanceTo(path[i - 1]); lengths.push(len); }
    const vScale = opts.vScale || 1;
    let prevB = null;
    for (let i = 0; i < N; i++) {
      const p = path[i];
      if (i === 0) _t.subVectors(path[1], path[0]); else if (i === N - 1) _t.subVectors(path[N - 1], path[N - 2]); else _t.subVectors(path[i + 1], path[i - 1]);
      _t.normalize();
      // frame: b = ref ortogonalizado; n = b x t
      if (prevB && opts.transport) { _b.copy(prevB).addScaledVector(_t, -_t.dot(prevB)); }
      else { _b.copy(ref).addScaledVector(_t, -_t.dot(ref)); }
      if (_b.lengthSq() < 1e-6) { _b.set(1, 0, 0).addScaledVector(_t, -_t.x); }
      _b.normalize();
      _n.crossVectors(_b, _t).normalize();
      prevB = _b.clone();
      const s = sections[i];
      const a = s.a !== undefined ? s.a : s, bb = s.b !== undefined ? s.b : s;
      const s01 = len > 0 ? lengths[i] / len : 0;
      for (let k = 0; k <= radial; k++) {
        const ph = (k / radial) * Math.PI * 2 + (opts.twist || 0) * s01;
        const c = Math.cos(ph), sn = Math.sin(ph);
        let ra = a, rb = bb;
        if (opts.radiusFn) { const m = opts.radiusFn(ph, s01, i); ra *= m; rb *= m; }
        _p.copy(p).addScaledVector(_n, c * ra).addScaledVector(_b, sn * rb);
        pos.push(_p.x, _p.y, _p.z);
        const nx = _n.x * c / Math.max(ra, 1e-4) + _b.x * sn / Math.max(rb, 1e-4);
        const ny = _n.y * c / Math.max(ra, 1e-4) + _b.y * sn / Math.max(rb, 1e-4);
        const nz = _n.z * c / Math.max(ra, 1e-4) + _b.z * sn / Math.max(rb, 1e-4);
        const nl = Math.hypot(nx, ny, nz) || 1;
        nor.push(nx / nl, ny / nl, nz / nl);
        uv.push(k / radial, (lengths[i] * vScale));
        if (opts.color) { const cc = opts.color(c, sn, s01, _p, nx / nl, ny / nl, nz / nl); col.push(cc[0], cc[1], cc[2]); }
        if (opts.wind) wnd.push(opts.wind(_p, s01));
      }
    }
    const row = radial + 1;
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < radial; k++) {
      const a = i * row + k, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    // tampas
    const cap = (i, flip) => {
      const center = path[i];
      const ci = pos.length / 3;
      pos.push(center.x, center.y, center.z);
      const dir = new THREE.Vector3().subVectors(path[flip ? N - 1 : 0], path[flip ? N - 2 : 1]).normalize();
      nor.push(dir.x, dir.y, dir.z); uv.push(0.5, lengths[i] * vScale);
      if (opts.color) { const cc = opts.color(0, 0, flip ? 1 : 0, center, dir.x, dir.y, dir.z); col.push(cc[0], cc[1], cc[2]); }
      if (opts.wind) wnd.push(opts.wind(center, flip ? 1 : 0));
      for (let k = 0; k < radial; k++) { const a = i * row + k, b = a + 1; if (flip) idx.push(a, b, ci); else idx.push(b, a, ci); }
    };
    if (opts.capStart) cap(0, false);
    if (opts.capEnd) cap(N - 1, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (opts.color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (opts.wind) g.setAttribute('wind', new THREE.Float32BufferAttribute(wnd, 1));
    g.setIndex(idx);
    return g;
  };

  // Aplica uma Matrix4 e (opcionalmente) atributos constantes
  HZ.xform = function (g, m) { g.applyMatrix4(m); return g; };

  HZ.colorArr = function (hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  HZ.mixArr = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // Shader chunk compartilhado de vento
  HZ.windUniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
  HZ.WIND_PARS = `
    uniform float uTime; uniform float uWind;
    attribute float wind;
  `;
  HZ.WIND_VERTEX = `
    #ifdef USE_INSTANCING
      vec3 ipos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    #else
      vec3 ipos = vec3(0.0);
    #endif
    float wph = ipos.x * 0.071 + ipos.z * 0.053;
    float gust = 0.65 + 0.35 * sin(uTime * 0.31 + ipos.x * 0.011);
    float ww = wind * uWind * gust;
    transformed.x += (sin(uTime * 1.25 + wph) * 0.62 + sin(uTime * 3.1 + wph * 2.3 + position.y * 0.45) * 0.22) * ww;
    transformed.z += (cos(uTime * 1.05 + wph * 1.4) * 0.48 + sin(uTime * 3.9 + position.x * 0.9) * 0.2) * ww;
    transformed.y += sin(uTime * 4.2 + position.x * 1.3 + position.z) * 0.06 * ww;
  `;
  HZ.applyWind = function (material, extra) {
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = function (shader, r) {
      shader.uniforms.uTime = HZ.windUniforms.uTime;
      shader.uniforms.uWind = HZ.windUniforms.uWind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + HZ.WIND_PARS)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + HZ.WIND_VERTEX + (extra && extra.vertex ? extra.vertex : ''));
      if (extra && extra.fragment) extra.fragment(shader);
      if (prev) prev.call(this, shader, r);
    };
    material.customProgramCacheKey = () => 'wind' + (extra && extra.key ? extra.key : '');
    return material;
  };
})();
