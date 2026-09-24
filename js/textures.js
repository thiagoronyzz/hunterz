/* HUNTERZ — texturas procedurais de alta resolução (sem assets externos). */
(function () {
  'use strict';
  const HZ = window.HZ;
  const { fbm, ridged, perlin, rng, canvas, pixelCanvas, normalFromCanvas, tex } = HZ;
  const T = (HZ.textures = {});

  const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);
  const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

  // desenha com "wrap" para textura tileável
  function wrap(ctx, w, h, x, y, r, fn) {
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const px = x + ox * w, py = y + oy * h;
      if (px + r < 0 || px - r > w || py + r < 0 || py - r > h) continue;
      fn(px, py);
    }
  }

  // Canvas de cor + canvas de alfa com os mesmos traços
  function dual(w, h, bg, seed, draw) {
    const color = canvas(w, h), alpha = canvas(w, h);
    const cc = color.getContext('2d'), ac = alpha.getContext('2d');
    cc.fillStyle = bg; cc.fillRect(0, 0, w, h);
    ac.fillStyle = '#000'; ac.fillRect(0, 0, w, h);
    draw(cc, rng(seed), c => c);
    draw(ac, rng(seed), () => '#fff');
    return { color, alpha };
  }

  function leafPath(ctx, x, y, len, wid, ang, tipSharp = 0.5) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.25, -wid, len * (1 - tipSharp * 0.4), -wid * 0.8, len, 0);
    ctx.bezierCurveTo(len * (1 - tipSharp * 0.4), wid * 0.8, len * 0.25, wid, 0, 0);
    ctx.closePath(); ctx.restore();
  }

  // ---------------------------------------------------------------- SOLO
  T.build = function (quality) {
    const S = quality === 'baixa' ? 256 : 512;
    const t0 = performance.now();

    // Grama rasteira / musgo
    {
      const c = pixelCanvas(S, S, (u, v, x, y, o) => {
        const n = fbm(u * 6, v * 6, 4, 11, 6), m = fbm(u * 24, v * 24, 3, 12, 24), d = perlin(u * 3, v * 3, 13, 3);
        const dry = HZ.smooth(0.25, 0.7, d);
        o[0] = clamp255(52 + n * 16 + m * 10 + dry * 38);
        o[1] = clamp255(66 + n * 18 + m * 12 + dry * 22);
        o[2] = clamp255(30 + n * 8 + m * 6 + dry * 8);
      });
      const ctx = c.getContext('2d'), r = rng(21);
      for (let i = 0; i < S * 18; i++) {
        const x = r() * S, y = r() * S, l = (3 + r() * 9) * S / 512, a = r() * Math.PI * 2;
        const g = 60 + r() * 70, dry = r() < 0.12;
        ctx.strokeStyle = dry ? rgb(130 + r() * 50, 118 + r() * 40, 64, 0.55) : rgb(g * 0.62, g, g * 0.38, 0.35 + r() * 0.4);
        ctx.lineWidth = 0.6 + r() * 1.1;
        wrap(ctx, S, S, x, y, l, (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); ctx.stroke(); });
      }
      T.grassGround = c;
    }

    // Serrapilheira (folhas secas + acículas + galhos)
    {
      const c = pixelCanvas(S, S, (u, v, x, y, o) => {
        const n = fbm(u * 8, v * 8, 4, 31, 8);
        o[0] = clamp255(52 + n * 18); o[1] = clamp255(39 + n * 14); o[2] = clamp255(26 + n * 9);
      });
      const ctx = c.getContext('2d'), r = rng(33), k = S / 512;
      const pal = [[122, 78, 40], [150, 96, 44], [96, 60, 34], [168, 120, 60], [84, 52, 30], [132, 98, 52], [110, 88, 50], [70, 44, 26]];
      for (let i = 0; i < 2600 * k * k; i++) {
        const x = r() * S, y = r() * S, len = (8 + r() * 18) * k, wid = len * (0.25 + r() * 0.2), a = r() * Math.PI * 2;
        const p = pal[(r() * pal.length) | 0], sh = 0.7 + r() * 0.5;
        wrap(ctx, S, S, x, y, len, (px, py) => {
          ctx.fillStyle = rgb(p[0] * sh * 0.45, p[1] * sh * 0.45, p[2] * sh * 0.45, 0.35);
          leafPath(ctx, px + 1.5, py + 1.5, len, wid, a); ctx.fill();
          ctx.fillStyle = rgb(p[0] * sh, p[1] * sh, p[2] * sh, 0.95);
          leafPath(ctx, px, py, len, wid, a); ctx.fill();
          ctx.strokeStyle = rgb(p[0] * 0.55, p[1] * 0.55, p[2] * 0.55, 0.6); ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); ctx.stroke();
        });
      }
      for (let i = 0; i < 2200 * k * k; i++) {
        const x = r() * S, y = r() * S, l = (8 + r() * 16) * k, a = r() * Math.PI * 2;
        ctx.strokeStyle = rgb(120 + r() * 50, 70 + r() * 30, 36, 0.8); ctx.lineWidth = 0.8 * k + 0.2;
        wrap(ctx, S, S, x, y, l, (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); ctx.stroke(); });
      }
      for (let i = 0; i < 70 * k; i++) {
        const x = r() * S, y = r() * S, l = (30 + r() * 60) * k, a = r() * Math.PI * 2;
        ctx.strokeStyle = rgb(58 + r() * 20, 44, 32, 0.95); ctx.lineWidth = (1.5 + r() * 2.5) * k;
        wrap(ctx, S, S, x, y, l, (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + Math.cos(a + 0.3) * l * 0.5, py + Math.sin(a + 0.3) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l); ctx.stroke(); });
      }
      T.litter = c;
    }

    // Terra / trilha
    {
      const c = pixelCanvas(S, S, (u, v, x, y, o) => {
        const n = fbm(u * 5, v * 5, 5, 41, 5), m = fbm(u * 30, v * 30, 2, 42, 30);
        o[0] = clamp255(92 + n * 26 + m * 10); o[1] = clamp255(72 + n * 20 + m * 8); o[2] = clamp255(52 + n * 14 + m * 6);
      });
      const ctx = c.getContext('2d'), r = rng(43), k = S / 512;
      for (let i = 0; i < 900 * k * k; i++) {
        const x = r() * S, y = r() * S, rad = (1 + r() * 3.5) * k, g = 90 + r() * 70;
        wrap(ctx, S, S, x, y, rad, (px, py) => {
          ctx.fillStyle = rgb(30, 24, 18, 0.45); ctx.beginPath(); ctx.ellipse(px + 1, py + 1, rad, rad * 0.8, 0, 0, 7); ctx.fill();
          ctx.fillStyle = rgb(g, g * 0.94, g * 0.86, 1); ctx.beginPath(); ctx.ellipse(px, py, rad, rad * 0.8, r() * 3, 0, 7); ctx.fill();
        });
      }
      T.dirt = c;
    }

    // Rocha com fissuras e líquen
    {
      const c = pixelCanvas(S, S, (u, v, x, y, o) => {
        const n = fbm(u * 4, v * 4, 5, 51, 4), cr = ridged(u * 5, v * 5, 4, 52, 5), sp = fbm(u * 18, v * 18, 3, 53, 18);
        const lich = HZ.smooth(0.35, 0.6, fbm(u * 9, v * 9, 3, 54, 9));
        let g = 112 + n * 30 + sp * 14 - Math.pow(cr, 6) * 70;
        o[0] = clamp255(g * (1 - lich * 0.25) + lich * 150 * 0.25);
        o[1] = clamp255(g * 0.99 * (1 - lich * 0.25) + lich * 155 * 0.25);
        o[2] = clamp255(g * 0.93 * (1 - lich * 0.35) + lich * 110 * 0.35);
      });
      T.rock = c;
    }

    // Cascas de árvore
    const barkSize = quality === 'baixa' ? [128, 256] : [256, 512];
    T.barkPine = pixelCanvas(barkSize[0], barkSize[1], (u, v, x, y, o) => {
      const plates = ridged(u * 5, v * 2, 3, 61, 5), n = fbm(u * 12, v * 5, 3, 62, 12), flake = HZ.smooth(0.3, 0.7, fbm(u * 3, v * 3, 2, 63, 3));
      const fiss = Math.pow(plates, 4);
      const base = [96 + flake * 50, 62 + flake * 18, 42 + flake * 4];
      const k = 0.35 + (1 - fiss) * 0.75 + n * 0.12;
      o[0] = clamp255(base[0] * k); o[1] = clamp255(base[1] * k); o[2] = clamp255(base[2] * k);
    });
    T.barkSpruce = pixelCanvas(barkSize[0], barkSize[1], (u, v, x, y, o) => {
      const sc = ridged(u * 10, v * 8, 3, 71, 10), n = fbm(u * 6, v * 6, 3, 72, 6);
      const k = 0.45 + (1 - Math.pow(sc, 3)) * 0.6 + n * 0.15;
      o[0] = clamp255(86 * k); o[1] = clamp255(70 * k); o[2] = clamp255(58 * k);
    });
    T.barkOak = pixelCanvas(barkSize[0], barkSize[1], (u, v, x, y, o) => {
      const r1 = ridged(u * 7, v * 1.5 + perlin(u * 4, v * 4, 81, 4) * 0.2, 4, 82, 7), n = fbm(u * 10, v * 10, 3, 83, 10), moss = HZ.smooth(0.45, 0.8, fbm(u * 3, v * 2, 3, 84, 3));
      const k = 0.35 + (1 - Math.pow(r1, 3)) * 0.7 + n * 0.1;
      o[0] = clamp255((92 - moss * 30) * k); o[1] = clamp255((84 + moss * 8) * k); o[2] = clamp255((74 - moss * 30) * k);
    });
    T.barkBirch = pixelCanvas(barkSize[0], barkSize[1], (u, v, x, y, o) => {
      const n = fbm(u * 6, v * 6, 4, 91, 6);
      const len = perlin(u * 3, v * 60, 92, 3) > 0.55 ? 1 : 0;
      const patch = HZ.smooth(0.5, 0.62, fbm(u * 3, v * 5, 4, 93, 3));
      let g = 214 + n * 20;
      g *= 1 - len * 0.7; g *= 1 - patch * 0.85;
      o[0] = clamp255(g); o[1] = clamp255(g * 0.98); o[2] = clamp255(g * 0.92);
    });

    // --------------------------------------------------- FOLHAGEM (cor + alfa)
    const F = quality === 'baixa' ? 256 : 512, kf = F / 512;

    // Tufo de pinheiro (acículas longas)
    T.pine = dual(F, F, '#34431f', 101, (ctx, r, C) => {
      for (let t = 0; t < 7; t++) {
        const bx = F * (0.3 + r() * 0.4), by = F * (0.72 + r() * 0.2), ang = -Math.PI / 2 + (r() - 0.5) * 1.6, L = F * (0.35 + r() * 0.25);
        ctx.strokeStyle = C(rgb(80, 58, 38)); ctx.lineWidth = 3 * kf;
        const ex = bx + Math.cos(ang) * L, ey = by + Math.sin(ang) * L;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
        for (let i = 0; i < 70; i++) {
          const s = 0.15 + r() * 0.85, px = bx + (ex - bx) * s, py = by + (ey - by) * s;
          for (const side of [-1, 1]) {
            const na = ang + side * (0.35 + r() * 0.6), nl = (34 + r() * 40) * kf * (1.1 - s * 0.3);
            const g = 60 + r() * 55;
            ctx.strokeStyle = C(rgb(g * 0.55, g, g * 0.42)); ctx.lineWidth = (1.3 + r()) * kf;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); ctx.stroke();
          }
        }
      }
    });

    // Ramo de abeto (vista superior, "espinha de peixe")
    T.spruce = dual(F, F / 2, '#1f3219', 111, (ctx, r, C) => {
      const H = F / 2, cy = H * 0.5;
      ctx.strokeStyle = C(rgb(70, 52, 36)); ctx.lineWidth = 4 * kf;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(F * 0.97, cy); ctx.stroke();
      for (let i = 0; i < 26; i++) {
        const s = i / 26, x0 = F * (0.04 + s * 0.9);
        for (const side of [-1, 1]) {
          const len = H * (0.45 - s * 0.28) * (0.8 + r() * 0.4), ang = side * (0.75 + r() * 0.3);
          const ex = x0 + Math.cos(ang) * len, ey = cy + Math.sin(ang) * len;
          ctx.strokeStyle = C(rgb(60, 46, 32)); ctx.lineWidth = 1.6 * kf;
          ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(ex, ey); ctx.stroke();
          for (let j = 0; j < 22; j++) {
            const t = j / 22, px = x0 + (ex - x0) * t, py = cy + (ey - cy) * t;
            for (const sd of [-1, 1]) {
              const na = ang + sd * (0.9 + r() * 0.5), nl = (7 + r() * 7) * kf;
              const g = 42 + r() * 45;
              ctx.strokeStyle = C(rgb(g * 0.52, g, g * 0.5)); ctx.lineWidth = (1.4 + r() * 0.8) * kf;
              ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); ctx.stroke();
            }
          }
        }
      }
      // acículas ao longo do eixo principal
      for (let i = 0; i < 200; i++) {
        const px = r() * F * 0.95, na = (r() - 0.5) * 3, nl = (8 + r() * 8) * kf, g = 40 + r() * 40;
        ctx.strokeStyle = C(rgb(g * 0.5, g, g * 0.5)); ctx.lineWidth = 1.5 * kf;
        ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px + Math.cos(na) * nl, cy + Math.sin(na) * nl); ctx.stroke();
      }
    });

    // Cacho de folhas largas (carvalho/faia)
    const leafCluster = (seed, base, spread, leafLen, count) => dual(F, F, rgb(base[0] * 0.8, base[1] * 0.8, base[2] * 0.8), seed, (ctx, r, C) => {
      const cx = F / 2, cy = F / 2;
      ctx.strokeStyle = C(rgb(70, 54, 38)); ctx.lineWidth = 3 * kf;
      const tips = [];
      for (let t = 0; t < 6; t++) {
        const a = r() * Math.PI * 2, L = F * (0.25 + r() * 0.2);
        const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L; tips.push([ex, ey, a]);
        ctx.beginPath(); ctx.moveTo(cx + (r() - 0.5) * 20, F * 0.98); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
      }
      for (let i = 0; i < count; i++) {
        const tp = tips[(r() * tips.length) | 0];
        const s = Math.sqrt(r()), a0 = r() * Math.PI * 2, rr = F * spread * s;
        const x = tp[0] * 0.55 + cx * 0.45 + Math.cos(a0) * rr, y = tp[1] * 0.55 + cy * 0.45 + Math.sin(a0) * rr;
        if (Math.hypot(x - cx, y - cy) > F * 0.48) continue;
        const len = leafLen * kf * (0.7 + r() * 0.6), wid = len * (0.32 + r() * 0.12), ang = r() * Math.PI * 2;
        const sh = 0.6 + r() * 0.7, yel = r() < 0.08 ? 1 : 0;
        ctx.fillStyle = C(rgb(base[0] * sh + yel * 60, base[1] * sh + yel * 30, base[2] * sh));
        leafPath(ctx, x, y, len, wid, ang); ctx.fill();
        ctx.fillStyle = C(rgb(base[0] * sh * 1.25 + 12, base[1] * sh * 1.2 + 12, base[2] * sh * 1.1, 0.55));
        leafPath(ctx, x, y, len * 0.9, wid * 0.45, ang); ctx.fill();
        ctx.strokeStyle = C(rgb(base[0] * 0.5, base[1] * 0.55, base[2] * 0.4, 0.8)); ctx.lineWidth = 0.9 * kf;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len * 0.9, y + Math.sin(ang) * len * 0.9); ctx.stroke();
      }
    });
    T.leaves = leafCluster(121, [72, 102, 44], 0.3, 46, 420);
    T.birchLeaves = leafCluster(131, [104, 136, 58], 0.32, 30, 520);
    T.bushLeaves = leafCluster(141, [58, 86, 38], 0.34, 34, 480);

    // Tufo de grama (cartão)
    const G = quality === 'baixa' ? 128 : 256;
    T.grass = dual(G, G, '#4b5e2c', 151, (ctx, r, C) => {
      for (let i = 0; i < 46; i++) {
        const bx = G * (0.08 + r() * 0.84), h = G * (0.45 + r() * 0.53), bend = (r() - 0.5) * G * 0.35, w = G * (0.012 + r() * 0.014);
        const dry = r() < 0.15, g = 70 + r() * 70;
        const grad = ctx.createLinearGradient(0, G, 0, G - h);
        if (dry) { grad.addColorStop(0, C(rgb(90, 80, 44))); grad.addColorStop(1, C(rgb(176, 160, 96))); }
        else { grad.addColorStop(0, C(rgb(g * 0.35, g * 0.55, g * 0.22))); grad.addColorStop(1, C(rgb(g * 0.72, g * 1.05, g * 0.42))); }
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.moveTo(bx - w, G); ctx.quadraticCurveTo(bx - w * 0.5 + bend * 0.3, G - h * 0.55, bx + bend, G - h);
        ctx.quadraticCurveTo(bx + w * 0.5 + bend * 0.3, G - h * 0.55, bx + w, G); ctx.closePath(); ctx.fill();
      }
      // poucas espigas finas (discretas)
      for (let i = 0; i < 2; i++) {
        const bx = G * (0.25 + r() * 0.5), h = G * (0.78 + r() * 0.18), k = G / 256, ex = bx + (r() - 0.5) * 10 * k;
        ctx.strokeStyle = C(rgb(96, 100, 58)); ctx.lineWidth = 0.9 * k;
        ctx.beginPath(); ctx.moveTo(bx, G); ctx.quadraticCurveTo(bx, G - h * 0.6, ex, G - h); ctx.stroke();
        ctx.fillStyle = C(rgb(118, 110, 70)); ctx.beginPath(); ctx.ellipse(ex, G - h + 4 * k, 1.3 * k, 6 * k, 0, 0, 7); ctx.fill();
      }
    });

    // Fronde de samambaia
    T.fern = dual(G / 2, G * 2, '#3c5a26', 161, (ctx, r, C) => {
      const W = G / 2, H = G * 2, cx = W / 2;
      ctx.strokeStyle = C(rgb(70, 88, 40)); ctx.lineWidth = 2.2 * (G / 256);
      ctx.beginPath(); ctx.moveTo(cx, H); ctx.lineTo(cx, H * 0.02); ctx.stroke();
      for (let i = 0; i < 30; i++) {
        const s = i / 30, y = H * (0.95 - s * 0.92), len = W * 0.47 * Math.sin(Math.PI * (0.12 + s * 0.88)) * (1 - s * 0.35);
        for (const side of [-1, 1]) {
          const g = 80 + r() * 50;
          ctx.fillStyle = C(rgb(g * 0.55, g, g * 0.35));
          ctx.save(); ctx.translate(cx, y + side * 2); ctx.rotate(side > 0 ? -0.35 : Math.PI + 0.35);
          ctx.beginPath(); ctx.moveTo(0, 0);
          const lobes = 6;
          for (let k = 0; k <= lobes; k++) { const t = k / lobes; ctx.lineTo(len * t, -(H * 0.012) * (1 - t) - (k % 2) * 2); }
          for (let k = lobes; k >= 0; k--) { const t = k / lobes; ctx.lineTo(len * t, (H * 0.012) * (1 - t) + (k % 2) * 2); }
          ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }
    });

    // Flores (brancas) — tingidas por instância
    T.flower = dual(128, 128, '#6a7a44', 171, (ctx, r, C) => {
      for (let i = 0; i < 5; i++) {
        const x = 20 + r() * 88, y = 18 + r() * 50;
        ctx.strokeStyle = C(rgb(70, 100, 40)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 8, 128); ctx.stroke();
        for (let p = 0; p < 7; p++) { const a = p / 7 * Math.PI * 2; ctx.fillStyle = C(rgb(240, 238, 230)); ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 5, 2.4, a, 0, 7); ctx.fill(); }
        ctx.fillStyle = C(rgb(235, 190, 60)); ctx.beginPath(); ctx.arc(x, y, 2.8, 0, 7); ctx.fill();
      }
    });

    // Pelagem (detalhe em cinza — multiplicado pela cor do vértice)
    T.fur = (() => {
      const c = pixelCanvas(256, 256, (u, v, x, y, o) => { const n = fbm(u * 16, v * 4, 3, 181, 16); const g = 200 + n * 30; o[0] = o[1] = o[2] = clamp255(g); });
      const ctx = c.getContext('2d'), r = rng(182);
      for (let i = 0; i < 9000; i++) {
        const x = r() * 256, y = r() * 256, l = 3 + r() * 7, a = Math.PI / 2 + (r() - 0.5) * 0.5, g = 150 + r() * 105;
        ctx.strokeStyle = rgb(g, g, g, 0.5); ctx.lineWidth = 0.7;
        wrap(ctx, 256, 256, x, y, l, (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); ctx.stroke(); });
      }
      return c;
    })();

    // Sangue (cor + alfa)
    T.blood = (() => {
      const size = 256;
      const color = pixelCanvas(size, size, (u, v, x, y, o) => { const n = fbm(u * 6, v * 6, 3, 191); o[0] = clamp255(92 + n * 40); o[1] = clamp255(6 + n * 6); o[2] = clamp255(8 + n * 6); });
      const alpha = pixelCanvas(size, size, (u, v, x, y, o) => {
        const dx = u - 0.5, dy = v - 0.5, d = Math.hypot(dx, dy) * 2, a = Math.atan2(dy, dx);
        const edge = 0.55 + perlin(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5, 192) * 0.28 + fbm(u * 10, v * 10, 2, 193) * 0.1;
        const g = d < edge ? 255 : 0; o[0] = o[1] = o[2] = g;
      });
      const actx = alpha.getContext('2d'), r = rng(194);
      actx.fillStyle = '#fff';
      for (let i = 0; i < 36; i++) { const a = r() * 7, d = 0.3 + r() * 0.18, rr = 1 + r() * 7; actx.beginPath(); actx.arc(size / 2 + Math.cos(a) * d * size, size / 2 + Math.sin(a) * d * size, rr, 0, 7); actx.fill(); }
      return { color, alpha };
    })();

    // Sprite suave (poeira, fumaça, gotas)
    T.soft = (() => { const c = canvas(64), ctx = c.getContext('2d'); const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); return c; })();
    T.smoke = pixelCanvas(128, 128, (u, v, x, y, o) => { const d = Math.hypot(u - 0.5, v - 0.5) * 2; const n = fbm(u * 5, v * 5, 4, 201) * 0.5 + 0.5; const a = HZ.clamp((1 - d) * 1.6 * n, 0, 1); o[0] = o[1] = o[2] = 255; o[3] = a * 255; });
    T.flash = (() => { const c = canvas(128), ctx = c.getContext('2d'); const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.2, 'rgba(255,200,110,.9)'); g.addColorStop(0.5, 'rgba(255,140,40,.35)'); g.addColorStop(1, 'rgba(255,120,20,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); ctx.globalCompositeOperation = 'lighter'; const r = rng(211); for (let i = 0; i < 9; i++) { const a = r() * 7; ctx.strokeStyle = 'rgba(255,220,150,.6)'; ctx.lineWidth = 3 + r() * 4; ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); ctx.stroke(); } return c; })();

    // Folha isolada (partículas de folhas caindo)
    T.leaf = dual(64, 64, '#8a6a30', 221, (ctx, r, C) => { ctx.fillStyle = C(rgb(170, 120, 50)); leafPath(ctx, 6, 32, 52, 14, 0); ctx.fill(); ctx.strokeStyle = C(rgb(110, 70, 30)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(6, 32); ctx.lineTo(58, 32); ctx.stroke(); });

    // Anéis de tronco cortado
    T.rings = pixelCanvas(256, 256, (u, v, x, y, o) => {
      const d = Math.hypot(u - 0.5, v - 0.5) * 2, n = perlin(u * 6, v * 6, 231) * 0.05;
      const ring = 0.5 + 0.5 * Math.sin((d + n) * 90), bark = d > 0.9 ? 1 : 0;
      const g = 150 + ring * 40 - d * 30;
      o[0] = clamp255(bark ? 70 : g); o[1] = clamp255(bark ? 50 : g * 0.78); o[2] = clamp255(bark ? 36 : g * 0.55);
    });

    // Madeira de nogueira (coronha)
    T.walnut = pixelCanvas(256, 512, (u, v, x, y, o) => {
      const w = perlin(u * 3, v * 1, 241) * 2, g = 0.5 + 0.5 * Math.sin((u * 30 + w * 6 + fbm(u * 4, v * 8, 3, 242) * 3));
      const k = 0.7 + g * 0.35;
      o[0] = clamp255(96 * k); o[1] = clamp255(58 * k); o[2] = clamp255(34 * k);
    });

    // Água: normal map animado
    T.waterN = normalFromCanvas(pixelCanvas(256, 256, (u, v, x, y, o) => { const n = fbm(u * 8, v * 8, 4, 251, 8) * 0.5 + 0.5; o[0] = o[1] = o[2] = n * 255; }), 3.5);

    // Normais derivadas
    T.groundN = normalFromCanvas(T.litter, 2.2);
    T.rockN = normalFromCanvas(T.rock, 3.0);
    T.barkPineN = normalFromCanvas(T.barkPine, 3.5);
    T.barkOakN = normalFromCanvas(T.barkOak, 3.5);
    T.barkSpruceN = normalFromCanvas(T.barkSpruce, 3.0);
    T.barkBirchN = normalFromCanvas(T.barkBirch, 1.5);
    T.furN = normalFromCanvas(T.fur, 1.4);

    T.buildTime = performance.now() - t0;
    return T;
  };

  // Cria THREE.Textures a partir dos canvases (após o renderer existir)
  T.toThree = function () {
    const out = {};
    const color = ['grassGround', 'litter', 'dirt', 'rock', 'barkPine', 'barkSpruce', 'barkOak', 'barkBirch', 'fur', 'rings', 'walnut'];
    const lin = ['groundN', 'rockN', 'barkPineN', 'barkOakN', 'barkSpruceN', 'barkBirchN', 'furN', 'waterN'];
    color.forEach(k => (out[k] = tex(T[k])));
    lin.forEach(k => (out[k] = tex(T[k], { linear: true })));
    ['pine', 'spruce', 'leaves', 'birchLeaves', 'bushLeaves', 'grass', 'fern', 'flower', 'blood', 'leaf'].forEach(k => {
      out[k] = tex(T[k].color, { clamp: true });
      out[k + 'A'] = tex(T[k].alpha, { clamp: true, linear: true });
    });
    out.soft = tex(T.soft, { clamp: true });
    out.smoke = tex(T.smoke, { clamp: true });
    out.flash = tex(T.flash, { clamp: true });
    HZ.tx = out;
    return out;
  };
})();
