/* HUNTERZ — rifle de ferrolho .308 com luneta: modelo procedural e animação em primeira pessoa
   (balanço, respiração, recuo, ciclo do ferrolho, recarga, corrida e mira). */
(function () {
  'use strict';
  const HZ = window.HZ;
  const THREE = window.THREE;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const F0 = 0.3; // coordenada "f" (a partir da soleira) que fica na origem do modelo
  const fz = (f) => -(f - F0);

  class Rifle {
    constructor(envTex, sunDir) {
      this.scene = new THREE.Scene();
      this.scene.environment = envTex || null;
      const hemi = new THREE.HemisphereLight(0xc8d8ff, 0x3a3020, 0.9); this.scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff0dc, 1.6); sun.position.copy(sunDir || V(-0.4, 0.6, -0.7)).multiplyScalar(10); this.scene.add(sun);
      this.hemi = hemi; this.sun = sun;
      this.root = new THREE.Group(); this.scene.add(this.root);
      this.gun = new THREE.Group(); this.root.add(this.gun);
      this.build();
      this.state = 'ready';
      this.recoil = 0; this.recoilV = 0; this.boltT = -1; this.reloadT = -1;
      this.sway = new THREE.Vector2(); this.swayV = new THREE.Vector2();
      this.pose = { x: 0.13, y: -0.125, z: -0.3, rx: 0, ry: 0, rz: 0 };
      this.flashT = 0;
    }

    build() {
      const tx = HZ.tx;
      const wood = tx.walnut.clone(); wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(3, 3); wood.needsUpdate = true;
      const woodMat = new THREE.MeshPhysicalMaterial({ map: wood, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4, color: new THREE.Color().setRGB(0.62, 0.45, 0.34), envMapIntensity: 0.5 });
      const steel = new THREE.MeshPhysicalMaterial({ color: 0x17191b, metalness: 0.92, roughness: 0.3, clearcoat: 0.25 });
      const matte = new THREE.MeshStandardMaterial({ color: 0x0d0e0f, metalness: 0.55, roughness: 0.5 });
      const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1c26, metalness: 1, roughness: 0.03, envMapIntensity: 2.5 });
      const add = (g, m, parent = this.gun) => { const o = new THREE.Mesh(g, m); parent.add(o); return o; };

      // coronha (perfil extrudado)
      const s = new THREE.Shape();
      const P = [[0, -0.075], [0, 0.058], [0.05, 0.064], [0.27, 0.036], [0.35, 0.022], [0.42, 0.03], [0.76, 0.03], [0.785, 0.016], [0.785, -0.018], [0.52, -0.032], [0.44, -0.046], [0.395, -0.09], [0.345, -0.088], [0.315, -0.026], [0.13, -0.055], [0.02, -0.082]];
      s.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) s.lineTo(P[i][0], P[i][1]); s.closePath();
      const sg = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.013, bevelSize: 0.009, bevelSegments: 5, curveSegments: 4 });
      sg.translate(0, 0, -0.009); sg.computeVertexNormals(); sg.rotateY(Math.PI / 2); sg.translate(0, 0, F0);
      add(sg, woodMat);
      // soleira de borracha
      const pad = add(new THREE.BoxGeometry(0.052, 0.142, 0.018), matte); pad.position.set(0, -0.009, fz(-0.008));

      // caixa da culatra e cano
      const cyl = (r0, r1, f0, f1, y, m, seg = 20) => { const g = new THREE.CylinderGeometry(r1, r0, f1 - f0, seg); g.rotateX(-Math.PI / 2); const o = add(g, m); o.position.set(0, y, fz((f0 + f1) / 2)); return o; };
      cyl(0.017, 0.017, 0.4, 0.63, 0.046, steel);
      cyl(0.0112, 0.0088, 0.62, 1.2, 0.049, steel, 16);
      cyl(0.0098, 0.0098, 1.185, 1.205, 0.049, matte, 16);
      this.muzzleLocal = V(0, 0.049, fz(1.21));
      // ferrolho
      this.bolt = new THREE.Group(); this.bolt.position.set(0.0, 0.046, fz(0.47)); this.gun.add(this.bolt);
      const boltArm = new THREE.CylinderGeometry(0.0045, 0.0045, 0.055, 8); boltArm.rotateZ(Math.PI / 2); boltArm.translate(0.042, -0.008, 0);
      add(boltArm, steel, this.bolt);
      const knob = add(new THREE.SphereGeometry(0.0105, 12, 10), steel, this.bolt); knob.position.set(0.072, -0.014, 0.004);
      const boltBody = new THREE.CylinderGeometry(0.0085, 0.0085, 0.06, 12); boltBody.rotateX(Math.PI / 2); boltBody.translate(0, 0, 0.02);
      add(boltBody, steel, this.bolt);
      this.ejectLocal = V(0.03, 0.06, fz(0.53));
      // guarda-mato e gatilho
      const tg = new THREE.TorusGeometry(0.024, 0.0032, 6, 18, Math.PI); tg.rotateY(Math.PI / 2); tg.rotateX(Math.PI);
      const tgo = add(tg, steel); tgo.position.set(0, -0.028, fz(0.43));
      const trig = add(new THREE.BoxGeometry(0.004, 0.022, 0.006), steel); trig.position.set(0, -0.035, fz(0.428)); trig.rotation.x = 0.3;
      const plate = add(new THREE.BoxGeometry(0.03, 0.006, 0.09), steel); plate.position.set(0, -0.034, fz(0.51));

      // luneta
      const Y = 0.1;
      const lathe = (pts, f0, m, seg = 24) => { const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); g.rotateX(-Math.PI / 2); const o = add(g, m); o.position.set(0, Y, fz(f0)); return o; };
      // perfil (raio, avanço em f)
      lathe([[0.0, 0], [0.0175, 0], [0.0185, 0.005], [0.0185, 0.035], [0.0132, 0.06], [0.0127, 0.07]], 0.3, matte);
      cyl(0.0127, 0.0127, 0.36, 0.64, Y, matte, 24);
      lathe([[0.0127, 0], [0.0127, 0.01], [0.0235, 0.075], [0.0245, 0.085], [0.0245, 0.115], [0.0225, 0.12], [0.0, 0.12]], 0.64, matte);
      const t1 = add(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 16), matte); t1.position.set(0, Y + 0.02, fz(0.5));
      const t2g = new THREE.CylinderGeometry(0.011, 0.011, 0.02, 16); t2g.rotateZ(Math.PI / 2); const t2 = add(t2g, matte); t2.position.set(0.02, Y, fz(0.5));
      for (const f of [0.43, 0.58]) { const r = add(new THREE.BoxGeometry(0.022, 0.045, 0.016), matte); r.position.set(0, 0.075, fz(f)); const rr = add(new THREE.TorusGeometry(0.0138, 0.0028, 6, 20), matte); rr.position.set(0, Y, fz(f)); }
      const lensF = add(new THREE.CircleGeometry(0.0222, 24), glass); lensF.position.set(0, Y, fz(0.758));
      const lensR = add(new THREE.CircleGeometry(0.016, 24), glass); lensR.position.set(0, Y, fz(0.2995)); lensR.rotation.y = Math.PI;

      // clarão do disparo
      const fm = new THREE.MeshBasicMaterial({ map: tx.flash, color: new THREE.Color().setRGB(9, 6, 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      this.flash = new THREE.Group(); this.flash.position.copy(this.muzzleLocal); this.gun.add(this.flash);
      const fp = new THREE.PlaneGeometry(0.16, 0.16);
      const f1 = new THREE.Mesh(fp, fm); this.flash.add(f1);
      const sideG = new THREE.PlaneGeometry(0.1, 0.3); sideG.translate(0, 0.13, 0); sideG.rotateX(-Math.PI / 2);
      const f2 = new THREE.Mesh(sideG, fm); this.flash.add(f2); const f3 = f2.clone(); f3.rotation.z = Math.PI / 2; this.flash.add(f3);
      this.flash.visible = false;
      this.gun.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = 10; } });
    }

    fire() {
      this.recoilV += 7.5; this.flashT = 0.05;
      this.flash.visible = true; this.flash.rotation.z = Math.random() * 6.28; this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
      this.state = 'cycling'; this.boltT = -0.16;
    }
    startReload(rounds) { this.state = 'reloading'; this.reloadT = 0; this.reloadRounds = rounds; this.reloadDur = 0.7 + rounds * 0.48 + 0.55; }

    muzzleWorld(out) { return this.gun.localToWorld(out.copy(this.muzzleLocal)); }
    ejectWorld(out) { return this.gun.localToWorld(out.copy(this.ejectLocal)); }

    // ctx: {cam, dt, t, aim(0..1), sprint(0..1), moveAmt, bobPhase, lookDX, lookDY, crouch, onGround, scoped}
    update(c, events) {
      const dt = c.dt;
      this.root.position.copy(c.cam.position); this.root.quaternion.copy(c.cam.quaternion);
      // ciclo do ferrolho
      let boltRot = 0, boltBack = 0, tilt = 0;
      if (this.state === 'cycling') {
        this.boltT += dt / 0.72;
        const b = this.boltT;
        if (b > 0) {
          boltRot = b < 0.2 ? b / 0.2 : b < 0.8 ? 1 : 1 - (b - 0.8) / 0.2;
          boltBack = b < 0.2 ? 0 : b < 0.5 ? (b - 0.2) / 0.3 : b < 0.8 ? 1 - (b - 0.5) / 0.3 : 0;
          tilt = Math.sin(Math.min(1, b) * Math.PI);
          if (!this.ejected && b > 0.42) { this.ejected = true; events.eject && events.eject(); }
        }
        if (b >= 1) { this.state = 'ready'; this.ejected = false; }
      }
      let reloadPose = 0;
      if (this.state === 'reloading') {
        this.reloadT += dt;
        const r = this.reloadT, D = this.reloadDur;
        reloadPose = Math.min(1, r / 0.35, (D - r) / 0.35);
        if (r < 0.5) { boltRot = Math.min(1, r / 0.2); boltBack = HZ.clamp((r - 0.2) / 0.25, 0, 1); }
        else if (r < D - 0.55) {
          boltRot = 1; boltBack = 1;
          const k = Math.floor((r - 0.7) / 0.48);
          if (r > 0.7 && k >= (this.loadedCount || 0) && k < this.reloadRounds) { this.loadedCount = k + 1; events.round && events.round(); }
        } else { const e = (r - (D - 0.55)) / 0.4; boltBack = HZ.clamp(1 - e * 2, 0, 1); boltRot = HZ.clamp(1 - (e - 0.5) * 2, 0, 1); }
        if (r >= D) { this.state = 'ready'; this.loadedCount = 0; events.reloaded && events.reloaded(); }
      }
      this.bolt.rotation.z = boltRot * 1.25;
      this.bolt.position.z = fz(0.47) + boltBack * 0.075;

      // recuo (mola amortecida)
      this.recoilV += (-this.recoil * 160 - this.recoilV * 16) * dt;
      this.recoil += this.recoilV * dt;
      // balanço pelo movimento do mouse
      this.swayV.x += (-c.lookDX * 0.00055 - this.sway.x) * 12 * dt;
      this.swayV.y += (-c.lookDY * 0.00055 - this.sway.y) * 12 * dt;
      this.swayV.multiplyScalar(Math.exp(-10 * dt));
      this.sway.addScaledVector(this.swayV, dt * 8);
      this.sway.clampScalar(-0.06, 0.06);

      const a = c.aim, sp = c.sprint, bob = c.moveAmt;
      const hip = { x: 0.15, y: -0.155, z: -0.34 }, ads = { x: 0, y: -0.1, z: -0.2 };
      let x = HZ.lerp(hip.x, ads.x, a), y = HZ.lerp(hip.y, ads.y, a), z = HZ.lerp(hip.z, ads.z, a);
      let rx = 0, ry = 0, rz = 0;
      // corrida
      x += sp * -0.03; y += sp * -0.05; rx += sp * -0.25; ry += sp * 0.75; rz += sp * 0.3;
      // recarga
      y += reloadPose * -0.04; rz += reloadPose * 0.55; rx += reloadPose * 0.25; x += reloadPose * -0.03;
      // ferrolho
      rz += tilt * 0.12 * (1 - a * 0.7); y -= tilt * 0.01;
      // passos
      const bs = (1 - a * 0.85) * bob;
      x += Math.sin(c.bobPhase) * 0.011 * bs * (1 + sp); y += -Math.abs(Math.cos(c.bobPhase)) * 0.012 * bs * (1 + sp);
      rz += Math.sin(c.bobPhase) * 0.02 * bs;
      // respiração ociosa
      y += Math.sin(c.t * 1.6) * 0.0022 * (1 - a); x += Math.sin(c.t * 0.8) * 0.0012 * (1 - a);
      // recuo
      z += this.recoil * 0.022; rx += this.recoil * 0.05; y += this.recoil * 0.004;
      // atraso do mouse
      x += this.sway.x * (1 - a * 0.8); y += this.sway.y * (1 - a * 0.8); ry += this.sway.x * 1.5; rx += -this.sway.y * 1.5;
      const k = Math.min(1, dt * 14), P = this.pose;
      P.x += (x - P.x) * k; P.y += (y - P.y) * k; P.z += (z - P.z) * Math.min(1, dt * 25); P.rx += (rx - P.rx) * k; P.ry += (ry - P.ry) * k; P.rz += (rz - P.rz) * k;
      this.gun.position.set(P.x, P.y, P.z);
      this.gun.rotation.set(P.rx, P.ry, P.rz, 'YXZ');
      this.gun.visible = !c.scoped;
      if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
      this.root.updateMatrixWorld(true);
    }
  }
  HZ.Rifle = Rifle;
})();
