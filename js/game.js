/* HUNTERZ — jogo: jogador (física, vida, estamina, ataduras), arma, HUD, clima, fluxo e ranking. */
(async function () {
  'use strict';
  const HZ = window.HZ;
  const THREE = window.THREE;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const $ = (id) => document.getElementById(id);
  const UI = {
    scene: $('scene'), topbar: $('topbar'), hud: $('hud'), weather: $('weatherChip'), weatherLabel: $('weatherLabel'), mission: $('missionText'),
    animalCount: $('animalCount'), killCount: $('killCount'), timer: $('timer'), ammo: $('ammoCount'), reserve: $('reserveCount'), dots: $('ammoDots'), reloadHint: $('reloadHint'),
    crosshair: $('crosshair'), hit: $('hitMarker'), toast: $('toast'), feed: $('killFeed'), hint: $('interactionHint'), hintBottom: $('hintBottom'),
    compL: $('compassLeft'), compM: $('compassMain'), compR: $('compassRight'), sound: $('soundLevel'), threat: $('threat'), dmgDir: $('dmgDir'),
    hpBar: $('hpBar'), hpFill: $('hpFill'), hpLag: $('hpLag'), hpText: $('hpText'), stFill: $('stFill'), bandages: $('bandages'), bandageCount: $('bandageCount'),
    scope: $('scope'), breath: $('breathHint'), blood: $('bloodOverlay'), flash: $('damageFlash'),
    start: $('startScreen'), startBtn: $('startButton'), rain: $('rainToggle'), quality: $('qualitySelect'), volume: $('volumeSlider'), startRanking: $('startRanking'),
    pause: $('pauseScreen'), resume: $('resumeButton'), rainPause: $('rainPauseButton'), restart: $('restartButton'),
    death: $('deathScreen'), deathCause: $('deathCause'), deathStats: $('deathStats'), retry: $('retryButton'),
    end: $('endScreen'), finalKills: $('finalKills'), finalAccuracy: $('finalAccuracy'), finalTime: $('finalTime'), rankingEntry: $('rankingEntry'), notQualified: $('notQualified'), playerName: $('playerName'), saveRank: $('saveRankButton'), rankMessage: $('rankMessage'), playAgain: $('playAgainButton'),
    loading: $('loadingScreen'), loadFill: $('loadFill'), loadMsg: $('loadMsg'), loadError: $('loadError'), loadErrorDetail: $('loadErrorDetail'), retryLow: $('retryLowButton'), unsupported: $('unsupported'),
  };
  let lowRetryBound = false;
  const retryAtLow = () => {
    try { localStorage.setItem('hunterz-quality', 'baixa'); } catch (_) {}
    const retryUrl = new URL(location.href);
    retryUrl.searchParams.set('q', 'baixa');
    location.replace(retryUrl.href);
  };
  const showLoadError = (error) => {
    console.error('Falha ao iniciar Hunterz:', error);
    UI.loading.classList.remove('hidden');
    UI.loadFill.style.width = '100%';
    UI.loadMsg.textContent = 'Não foi possível preparar a floresta nesta qualidade.';
    UI.loadErrorDetail.textContent = error && error.message ? error.message.slice(0, 180) : 'O dispositivo não conseguiu reservar recursos para esta configuração.';
    UI.loadError.classList.remove('hidden');
    if (!lowRetryBound) {
      UI.retryLow.addEventListener('click', retryAtLow, { once: true });
      lowRetryBound = true;
    }
  };

  try {
  const params = new URLSearchParams(location.search);
  const setLoading = (p, msg) => { UI.loadFill.style.width = Math.round(p * 100) + '%'; if (msg) UI.loadMsg.textContent = msg; };
  const tick = () => new Promise(r => setTimeout(r, 20));

  // ---------------------------------------------------------------- qualidade
  const QKEY = 'hunterz-quality';
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  let quality = params.get('q') || localStorage.getItem(QKEY) || (isMobile ? 'baixa' : 'media');
  if (!HZ.QUALITY[quality]) quality = 'media';
  UI.quality.value = quality;
  UI.quality.addEventListener('change', () => {
    try { localStorage.setItem(QKEY, UI.quality.value); } catch (_) {}
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set('q', UI.quality.value);
    location.assign(nextUrl.href);
  });

  const test = document.createElement('canvas');
  if (!test.getContext('webgl2')) { UI.loading.classList.add('hidden'); UI.unsupported.classList.remove('hidden'); return; }

  // ---------------------------------------------------------------- renderizador
  // Orçamentos por dispositivo: MSAA em um render target HDR de tela cheia pode
  // reservar centenas de MB em telas grandes; sombras também respeitam o limite da GPU.
  const q = { ...HZ.QUALITY[quality] };
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  const memoryGB = Number(navigator.deviceMemory) || 0;
  const cores = Number(navigator.hardwareConcurrency) || 0;
  const constrainedDevice = isMobile || (memoryGB > 0 && memoryGB <= 4) || (cores > 0 && cores <= 4);
  if (constrainedDevice && quality !== 'baixa') {
    const high = quality === 'alta';
    Object.assign(q, {
      variants: 2,
      treeStep: Math.max(q.treeStep, high ? 6.0 : 6.2),
      treeNear: Math.min(q.treeNear, high ? 100 : 85),
      grassD: Math.min(q.grassD, high ? 2.0 : 1.5),
      grassR: Math.min(q.grassR, high ? 40 : 34),
      fern: Math.min(q.fern, high ? 5000 : 3500),
      fernR: Math.min(q.fernR, high ? 55 : 45),
      bush: Math.min(q.bush, high ? 1100 : 850),
      sapling: Math.min(q.sapling, high ? 700 : 500),
      twigs: Math.min(q.twigs, high ? 1800 : 1400),
      stones: Math.min(q.stones, high ? 1800 : 1400),
      mushrooms: Math.min(q.mushrooms, high ? 650 : 500),
    });
  }
  const screenPixels = Math.max(1, window.innerWidth * window.innerHeight);
  const pixelBudget = constrainedDevice ? 2_600_000 : 8_000_000;
  const pixelRatio = Math.min(
    window.devicePixelRatio || 1,
    q.pixelRatio,
    Math.sqrt(pixelBudget / screenPixels),
  );
  q.pixelRatio = Math.max(0.5, pixelRatio);
  q.shadow = Math.min(q.shadow, renderer.capabilities.maxTextureSize || q.shadow);
  const targetPixels = screenPixels * q.pixelRatio * q.pixelRatio;
  const heavyFrame = targetPixels > 2_400_000 || constrainedDevice;
  if (targetPixels > 4_000_000 || constrainedDevice) q.shadow = Math.min(q.shadow, 2048);
  q.samples = heavyFrame ? 0 : Math.min(q.samples, renderer.capabilities.maxSamples || 0);
  if (heavyFrame) q.bloom = false;
  HZ.QUALITY[quality] = q;
  renderer.setPixelRatio(q.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  UI.scene.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showLoadError(new Error('O contexto WebGL foi interrompido; tente novamente em qualidade baixa.'));
  });
  HZ.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const adaptedQuality = constrainedDevice && quality !== 'baixa';
  const textureQuality = constrainedDevice && quality === 'alta' ? 'media' : quality;
  setLoading(0.03, adaptedQuality ? 'Otimizando a floresta para este dispositivo' : 'Gerando texturas da floresta');
  await tick();
  HZ.textures.build(textureQuality);
  HZ.textures.toThree();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2400);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const world = await HZ.buildWorld(renderer, scene, quality, (p, msg) => setLoading(0.08 + p * 0.8, msg));
  const physics = world.physics;
  setLoading(0.9, 'Soltando os animais');
  await tick();
  const effects = new HZ.Effects(scene, camera, world);
  const audio = new HZ.Audio();
  const animals = new HZ.AnimalManager(scene, physics, effects, audio);
  const rifle = new HZ.Rifle(scene.environment, world.sunDir);
  const post = new HZ.Post(renderer, q);
  const SPAWN = world.SPAWN;
  animals.spawnAll(SPAWN);
  const BASE = { sun: world.sun.intensity, hemi: world.hemi.intensity, fogD: scene.fog.density, fogC: scene.fog.color.clone(), hor: world.skyU.uHorizon.value.clone(), zen: world.skyU.uZenith.value.clone() };

  // ---------------------------------------------------------------- estado
  const MAG = 5, RESERVE = 45, BASE_DMG = 62;
  const RKEY = 'hunterz-ranking-v2';
  const P = {
    pos: V(SPAWN.x, HZ.heightAt(SPAWN.x, SPAWN.z), SPAWN.z), vel: V(), knock: V(), yaw: 0, pitch: 0, onGround: true, crouch: false, crouchT: 0, sprinting: false,
    hp: 100, hpLag: 100, stamina: 100, alive: true, lastHurt: -99, bandages: 3, bandaging: 0, bleeding: 0, noise: 0, moving: false, bobPhase: 0, moveAmt: 0,
    eyeY: 0, shake: 0, hurt: 0, deathT: 0, killer: null, lastStep: 0, holdBreath: false, sprintLock: 0, eye: 1.68,
  };
  const S = {
    mode: 'loading', rain: false, rainAmt: 0, startTime: 0, elapsed: 0, shots: 0, hits: 0, kills: 0, total: 0, ammo: MAG, reserve: RESERVE,
    aim: 0, aimHeld: false, fire: false, lookDX: 0, lookDY: 0, keys: {}, time: 0, flashT: 0, nextLightning: 20, recoilPitch: 0, recoilYaw: 0,
    lastHeart: 0, huntPressure: false, dmgDirT: 0, hintT: 0,
  };

  // ---------------------------------------------------------------- HUD helpers
  function toast(msg, ms = 2400) { UI.toast.textContent = msg; UI.toast.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => UI.toast.classList.remove('show'), ms); }
  function feed(html, bad) { const d = document.createElement('div'); d.innerHTML = html; if (bad) d.className = 'bad'; UI.feed.prepend(d); setTimeout(() => d.remove(), 5000); while (UI.feed.children.length > 5) UI.feed.lastChild.remove(); }
  function hitMarker(final) { UI.hit.classList.remove('show', 'final'); void UI.hit.offsetWidth; UI.hit.classList.add('show'); if (final) UI.hit.classList.add('final'); }
  function hintBottom(msg, s = 2) { UI.hintBottom.textContent = msg; UI.hintBottom.classList.add('show'); S.hintT = s; }
  const fmt = (t) => { const s = Math.max(0, Math.floor(t)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  function updateAmmoUI() {
    UI.ammo.textContent = S.ammo; UI.reserve.textContent = '/ ' + S.reserve;
    UI.dots.innerHTML = ''; for (let i = 0; i < MAG; i++) { const d = document.createElement('i'); if (i >= S.ammo) d.className = 'empty'; UI.dots.appendChild(d); }
    UI.reloadHint.textContent = S.ammo === 0 ? (S.reserve > 0 ? 'SEM MUNIÇÃO · R PARA RECARREGAR' : 'SEM MUNIÇÃO') : 'R PARA RECARREGAR';
  }
  function updateAnimalUI() {
    const alive = animals.list.filter(a => !a.dead).length;
    UI.animalCount.textContent = alive; UI.killCount.textContent = S.kills;
    UI.mission.textContent = S.kills >= S.total ? 'Missão concluída' : `Abata a fauna · ${S.kills}/${S.total}`;
  }
  // mancha de sangue na tela (gerada)
  (function makeBlood() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 288; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 288);
    for (let i = 0; i < 70; i++) {
      const edge = Math.random(), a = Math.random() * Math.PI * 2;
      const x = 256 + Math.cos(a) * (200 + Math.random() * 120), y = 144 + Math.sin(a) * (110 + Math.random() * 70);
      const r = 10 + Math.random() * 45 * (edge + 0.3);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(110,0,0,0.85)'); gr.addColorStop(0.7, 'rgba(150,10,5,0.5)'); gr.addColorStop(1, 'rgba(160,20,10,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    UI.blood.style.backgroundImage = `url(${c.toDataURL()})`;
  })();

  // ---------------------------------------------------------------- ranking
  function loadRankings() { try { const d = JSON.parse(localStorage.getItem(RKEY) || '[]'); return Array.isArray(d) ? d.filter(x => x && x.name && x.time).slice(0, 10) : []; } catch (_) { return []; } }
  function renderRanking() {
    const r = loadRankings(); UI.startRanking.innerHTML = '';
    if (!r.length) { const li = document.createElement('li'); li.className = 'empty-rank'; li.textContent = 'Nenhum recorde ainda'; UI.startRanking.appendChild(li); return; }
    r.forEach(it => { const li = document.createElement('li'); li.append(document.createTextNode(it.name)); const t = document.createElement('span'); t.textContent = fmt(it.time); li.appendChild(t); UI.startRanking.appendChild(li); });
  }
  const qualifies = (t) => { const r = loadRankings(); return r.length < 10 || t < r[r.length - 1].time; };
  UI.saveRank.addEventListener('click', () => {
    const name = (UI.playerName.value || '').trim().toUpperCase().slice(0, 16) || 'CAÇADOR';
    const r = loadRankings(); r.push({ name, time: Math.max(1, Math.round(S.elapsed)), date: Date.now() }); r.sort((a, b) => a.time - b.time);
    try { localStorage.setItem(RKEY, JSON.stringify(r.slice(0, 10))); UI.rankMessage.textContent = 'Recorde salvo no Top 10!'; UI.saveRank.disabled = true; UI.playerName.disabled = true; renderRanking(); } catch (_) { UI.rankMessage.textContent = 'Não foi possível salvar neste navegador.'; }
  });
  renderRanking();

  // ---------------------------------------------------------------- entrada
  const canvas = renderer.domElement;
  const lock = () => { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {} };
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (!locked && S.mode === 'playing') pauseGame();
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas || S.mode !== 'playing' || !P.alive) return;
    const sens = 0.0021 * (camera.fov / 72);
    P.yaw -= e.movementX * sens; P.pitch -= e.movementY * sens;
    P.pitch = HZ.clamp(P.pitch, -1.48, 1.48);
    S.lookDX += e.movementX; S.lookDY += e.movementY;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (S.mode !== 'playing') return;
    if (document.pointerLockElement !== canvas) { lock(); return; }
    if (e.button === 0) S.fire = true;
    if (e.button === 2) { S.aimHeld = true; audio.aim(true); }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 2) { S.aimHeld = false; } });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    S.keys[e.code] = true;
    if (S.mode !== 'playing') return;
    if (e.code === 'KeyR') reload();
    if (e.code === 'KeyC' || e.code === 'ControlLeft') { P.crouch = !P.crouch; e.preventDefault(); }
    if (e.code === 'KeyQ') useBandage();
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { S.keys[e.code] = false; });
  window.addEventListener('blur', () => { S.keys = {}; S.aimHeld = false; });

  // ---------------------------------------------------------------- fluxo
  function resetPlayer() {
    P.pos.set(SPAWN.x, HZ.heightAt(SPAWN.x, SPAWN.z), SPAWN.z); P.vel.set(0, 0, 0); P.knock.set(0, 0, 0);
    P.yaw = 0; P.pitch = 0; P.hp = 100; P.hpLag = 100; P.stamina = 100; P.alive = true; P.bandages = 3; P.bandaging = 0; P.bleeding = 0;
    P.crouch = false; P.deathT = 0; P.hurt = 0; P.shake = 0; P.lastHurt = -99; P.eyeY = P.pos.y + 1.68;
    S.ammo = MAG; S.reserve = RESERVE; S.shots = 0; S.hits = 0; S.kills = 0; S.aim = 0; S.aimHeld = false; S.fire = false;
    rifle.state = 'ready'; post.u.uDead.value = 0; camera.rotation.z = 0;
  }
  function startGame() {
    audio.init(); audio.setVolume(UI.volume.value / 100);
    resetPlayer();
    S.total = animals.list.length;
    S.mode = 'playing'; S.startTime = performance.now(); S.elapsed = 0; S.huntPressure = false;
    UI.start.classList.add('hidden'); UI.pause.classList.add('hidden'); UI.death.classList.add('hidden'); UI.end.classList.add('hidden');
    UI.hud.classList.remove('hidden'); UI.topbar.classList.remove('hidden');
    updateAmmoUI(); updateAnimalUI();
    world.forceUpdate();
    lock();
    toast('Cuidado: lobos, ursos e javalis podem atacar. Boa caçada.', 3500);
  }
  function restartGame() {
    effects.clear();
    animals.spawnAll(SPAWN);
    UI.rankingEntry.classList.add('hidden'); UI.notQualified.classList.add('hidden'); UI.rankMessage.textContent = ''; UI.playerName.value = ''; UI.playerName.disabled = false; UI.saveRank.disabled = false;
    startGame();
  }
  function pauseGame() { if (S.mode !== 'playing') return; S.mode = 'paused'; S.pauseAt = performance.now(); UI.pause.classList.remove('hidden'); S.keys = {}; S.aimHeld = false; }
  function resumeGame() { if (S.mode !== 'paused') return; S.startTime += performance.now() - S.pauseAt; S.mode = 'playing'; UI.pause.classList.add('hidden'); lock(); }
  function setRain(on) { S.rain = on; UI.rain.checked = on; UI.weather.classList.toggle('rain', on); UI.weatherLabel.textContent = on ? 'Chuva forte' : 'Céu limpo'; }
  UI.startBtn.addEventListener('click', startGame);
  UI.resume.addEventListener('click', resumeGame);
  UI.restart.addEventListener('click', restartGame);
  UI.retry.addEventListener('click', restartGame);
  UI.playAgain.addEventListener('click', restartGame);
  UI.rain.addEventListener('change', () => setRain(UI.rain.checked));
  UI.rainPause.addEventListener('click', () => setRain(!S.rain));
  UI.volume.addEventListener('input', () => audio.setVolume(UI.volume.value / 100));

  function finishSession() {
    if (S.mode !== 'playing') return;
    S.mode = 'ended'; document.exitPointerLock && document.exitPointerLock();
    const acc = S.shots ? Math.round((S.hits / S.shots) * 100) : 0;
    UI.finalKills.textContent = S.kills; UI.finalAccuracy.textContent = acc + '%'; UI.finalTime.textContent = fmt(S.elapsed);
    const ok = qualifies(S.elapsed); UI.rankingEntry.classList.toggle('hidden', !ok); UI.notQualified.classList.toggle('hidden', ok);
    UI.end.classList.remove('hidden'); UI.hud.classList.add('hidden');
  }

  // ---------------------------------------------------------------- dano ao jogador
  function damagePlayer(dmg, src, knock) {
    if (!P.alive || S.mode !== 'playing') return;
    P.hp -= dmg; P.lastHurt = S.time; P.hurt = Math.min(1, P.hurt + dmg / 30 + 0.35); P.shake = Math.min(1, P.shake + dmg / 25);
    if (dmg > 22) P.bleeding = Math.min(14, P.bleeding + 7);
    audio.hurt();
    if (src) {
      const dx = P.pos.x - src.x, dz = P.pos.z - src.z, d = Math.hypot(dx, dz) || 1;
      P.knock.set(dx / d * knock, 0, dz / d * knock);
      if (knock > 4 && P.onGround) P.vel.y = 3;
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
      const ang = Math.atan2(-(dx * rx + dz * rz), -(dx * fx + dz * fz));
      UI.dmgDir.style.transform = `rotate(${ang}rad)`; UI.dmgDir.style.opacity = 1; S.dmgDirT = 1.4;
      S.recoilPitch += 0.04; S.recoilYaw += (Math.random() - 0.5) * 0.08;
    }
    if (P.hp <= 0) killPlayer(src);
  }
  function killPlayer(src) {
    P.hp = 0; P.alive = false; P.deathT = 0; P.killer = src;
    S.aimHeld = false; S.aim = 0;
    const names = { wolf: 'UM LOBO', bear: 'UM URSO', boar: 'UM JAVALI' };
    UI.deathCause.textContent = src ? `ATACADO POR ${names[src.type] || 'UM ANIMAL'}` : 'VOCÊ SANGROU ATÉ A MORTE';
    audio.heartbeat(1.5);
  }

  // ---------------------------------------------------------------- arma
  function reload() {
    if (!P.alive || rifle.state !== 'ready' || S.ammo >= MAG || S.reserve <= 0 || P.bandaging > 0) return;
    const n = Math.min(MAG - S.ammo, S.reserve);
    rifle.startReload(n);
    S.aimHeld = false;
    audio.noiseBurst({ dur: 0.1, type: 'bandpass', f: 2200, Q: 3, gain: 0.3, t0: 0.15, verb: 0.05 });
    audio.noiseBurst({ dur: 0.14, type: 'bandpass', f: 1800, f1: 2600, Q: 2, gain: 0.25, t0: 0.3, verb: 0.05 });
  }
  function useBandage() {
    if (!P.alive || P.bandaging > 0) return;
    if (P.bandages <= 0) { hintBottom('SEM ATADURAS'); return; }
    if (P.hp >= 100 && P.bleeding <= 0) { hintBottom('VIDA CHEIA'); return; }
    P.bandaging = 2.6; P.bandages--; audio.bandage(); UI.bandages.classList.add('using'); hintBottom('APLICANDO ATADURA...', 2.6);
  }
  const _o = V(), _d = V(), _m = V(), _r = V(), _u = V();
  function shoot() {
    if (!P.alive || P.bandaging > 0) return;
    if (rifle.state !== 'ready') return;
    if (S.ammo <= 0) { audio.dry(); hintBottom(S.reserve > 0 ? 'SEM MUNIÇÃO · PRESSIONE R' : 'SEM MUNIÇÃO'); return; }
    S.ammo--; S.shots++;
    P.sprintLock = 0.35;
    rifle.fire(); audio.gunshot();
    camera.updateMatrixWorld();
    // dispersão: mínima com luneta; maior em movimento/no ar
    const scoped = S.aim > 0.85;
    let spread = scoped ? 0.0004 : 0.018 + P.moveAmt * 0.03 + (P.onGround ? 0 : 0.06);
    if (P.crouch) spread *= 0.7;
    camera.getWorldDirection(_d);
    _r.set(1, 0, 0).applyQuaternion(camera.quaternion); _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * spread;
    _d.addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize();
    _o.copy(camera.position);
    rifle.muzzleWorld(_m);
    effects.muzzleSmoke(scoped ? _o.clone().addScaledVector(_d, 1.0) : _m, _d);
    animals.gunshot(P.pos);
    S.recoilPitch += scoped ? 0.05 : 0.035; S.recoilYaw += (Math.random() - 0.5) * 0.02;
    P.noise = 1;
    const hw = physics.raycast(_o, _d, 700, false);
    const ha = animals.raycast(_o, _d, 700);
    if (ha && (!hw || ha.distance < hw.t)) {
      const an = ha.object.userData.animal;
      const res = an.takeHit(ha, BASE_DMG * (0.92 + Math.random() * 0.16), _d);
      if (res) {
        S.hits++;
        const dist = Math.round(ha.distance);
        setTimeout(() => audio.impact('flesh', ha.point), Math.min(900, ha.distance / 0.34));
        hitMarker(res.killed);
        const zone = { head: 'CABEÇA', neck: 'PESCOÇO', body: res.vital ? 'CORAÇÃO/PULMÃO' : 'CORPO', leg: 'PERNA' }[res.zone];
        if (!res.killed) feed(`${an.sp.name} ferido · ${zone} <b>${dist} m</b>`, true);
        if (!res.killed && an.sp.hostile === 'prey') hintBottom('ANIMAL FERIDO · SIGA O RASTRO DE SANGUE', 3);
      }
    } else if (hw) {
      effects.impact(hw.kind, hw.point, hw.normal);
      setTimeout(() => audio.impact(hw.kind, hw.point), Math.min(900, hw.t / 0.34));
    }
    updateAmmoUI();
    if (S.ammo === 0 && S.reserve > 0) setTimeout(() => { if (S.ammo === 0) hintBottom('PRESSIONE R PARA RECARREGAR', 2.5); }, 900);
  }
  animals.onKillCb = (a, zone) => {
    S.kills++;
    const zn = { head: 'tiro na cabeça', neck: 'tiro no pescoço', body: 'tiro no corpo', leg: 'tiro na perna' }[zone] || 'sangramento';
    const bonus = zone === 'head' ? 2 : zone === 'neck' ? 1.5 : 1;
    feed(`${a.sp.name} abatido · ${zn} <b>+${Math.round(a.sp.points * bonus)}</b>`);
    updateAnimalUI();
    if (S.kills >= S.total) setTimeout(finishSession, 1500);
  };

  // ---------------------------------------------------------------- jogador
  const BOUND = world.BOUND;
  function surfaceAt(x, z, y) {
    if (HZ.isWater(x, z, -0.05)) return 'water';
    if (y > HZ.heightAt(x, z) + 0.15) return 'rock';
    const td = world.trailDist(x, z); if (td < 1.2) return 'dirt';
    return HZ.forestDensity(x, z) > 0.5 ? 'leaves' : 'grass';
  }
  function updatePlayer(dt) {
    const k = S.keys;
    const alive = P.alive && S.mode === 'playing';
    let ix = 0, iz = 0;
    if (alive) { if (k.KeyW || k.ArrowUp) iz += 1; if (k.KeyS || k.ArrowDown) iz -= 1; if (k.KeyD || k.ArrowRight) ix += 1; if (k.KeyA || k.ArrowLeft) ix -= 1; }
    const il = Math.hypot(ix, iz); if (il > 0) { ix /= il; iz /= il; }
    const shift = k.ShiftLeft || k.ShiftRight;
    P.sprintLock = Math.max(0, P.sprintLock - dt);
    const wantSprint = shift && iz > 0.3 && !P.crouch && S.aim < 0.3 && P.stamina > 2 && P.bandaging <= 0 && rifle.state !== 'reloading' && P.sprintLock <= 0;
    P.sprinting = wantSprint && P.onGround ? true : P.sprinting && wantSprint;
    const water = HZ.isWater(P.pos.x, P.pos.z, -0.25);
    let speed = P.sprinting ? 6.3 : P.crouch ? 1.75 : 3.5;
    if (S.aim > 0.3) speed = Math.min(speed, 1.9);
    if (P.bandaging > 0) speed = Math.min(speed, 1.4);
    if (water) speed *= 0.55;
    if (P.hp < 25) speed *= 0.85;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const tx = (fx * iz + rx * ix) * speed, tz = (fz * iz + rz * ix) * speed;
    const acc = P.onGround ? 11 : 2;
    P.vel.x += (tx - P.vel.x) * Math.min(1, acc * dt); P.vel.z += (tz - P.vel.z) * Math.min(1, acc * dt);
    // pulo
    if (alive && k.Space && P.onGround && P.stamina > 8 && !P.crouch) { P.vel.y = 5.3; P.onGround = false; P.stamina -= 10; }
    if (alive && k.Space && P.crouch) P.crouch = false;
    P.vel.y -= 17 * dt;
    // empurrão por ataques
    P.knock.multiplyScalar(Math.exp(-6 * dt));
    const mx = (P.vel.x + P.knock.x) * dt, mz = (P.vel.z + P.knock.z) * dt;
    const p = { x: P.pos.x, y: P.pos.y, z: P.pos.z };
    const res = physics.moveCircle(p, mx, mz, 0.35, P.onGround ? 0.5 : 0.3, BOUND);
    P.pos.x = p.x; P.pos.z = p.z;
    const g = res.ground;
    const ny = P.pos.y + P.vel.y * dt;
    if (ny <= g) {
      if (!P.onGround && P.vel.y < -3) { audio.land(-P.vel.y); if (P.vel.y < -11) damagePlayer((-P.vel.y - 11) * 6, null, 0); P.shake = Math.min(1, P.shake + 0.2); }
      P.pos.y = g; P.vel.y = 0; P.onGround = true;
    } else if (P.onGround && P.vel.y <= 0 && P.pos.y - g < 0.55) { P.pos.y = g; P.vel.y = 0; }
    else { P.pos.y = ny; P.onGround = false; }
    // estamina
    if (P.sprinting && Math.hypot(P.vel.x, P.vel.z) > 3) { P.stamina -= 15 * dt; P.staminaT = 1; }
    else if (P.holdBreath) P.stamina -= 20 * dt;
    else { P.staminaT = (P.staminaT || 0) - dt; if (P.staminaT <= 0) P.stamina += 12 * dt; }
    P.stamina = HZ.clamp(P.stamina, 0, 100);
    // agachar suave
    P.crouchT += ((P.crouch ? 1 : 0) - P.crouchT) * Math.min(1, dt * 9);
    // passos e balanço
    const hs = Math.hypot(P.vel.x, P.vel.z);
    P.moving = hs > 0.4;
    P.moveAmt += ((P.onGround ? Math.min(1, hs / 3.5) : 0) - P.moveAmt) * Math.min(1, dt * 8);
    const stepLen = P.sprinting ? 1.05 : P.crouch ? 0.55 : 0.78;
    if (P.onGround && hs > 0.3) {
      P.bobPhase += (hs / stepLen) * Math.PI * dt;
      const st = Math.floor(P.bobPhase / Math.PI);
      if (st !== P.lastStep) { P.lastStep = st; audio.step(surfaceAt(P.pos.x, P.pos.z, P.pos.y), P.sprinting ? 1.4 : P.crouch ? 0.35 : 0.8); }
    }
    // ruído do jogador (percebido pelos animais)
    const nTarget = !P.moving ? 0.02 : P.sprinting ? 1 : P.crouch ? 0.12 : 0.42;
    P.noise += (nTarget - P.noise) * Math.min(1, dt * (nTarget > P.noise ? 6 : 1.2));
    // vida: sangramento, regeneração lenta até 50, ataduras
    if (P.alive) {
      if (P.bleeding > 0) { P.hp -= 1.1 * dt; P.bleeding -= dt; if (Math.random() < dt * 2) effects.groundDecal(P.pos.x + (Math.random() - 0.5) * 0.4, P.pos.z + (Math.random() - 0.5) * 0.4, 0.08 + Math.random() * 0.08, 0, 0.9); if (P.hp <= 0) killPlayer(null); }
      if (S.time - P.lastHurt > 9 && P.hp < 50 && P.bleeding <= 0) P.hp = Math.min(50, P.hp + 1.0 * dt);
      if (P.bandaging > 0) {
        P.bandaging -= dt;
        if (P.bandaging <= 0) { P.hp = Math.min(100, P.hp + 40); P.bleeding = 0; UI.bandages.classList.remove('using'); toast('Ferimentos enfaixados · +40 de vida'); }
      }
    }
    P.hpLag += (P.hp - P.hpLag) * Math.min(1, dt * 1.5);
  }

  // ---------------------------------------------------------------- câmera
  function updateCamera(dt) {
    const eyeH = HZ.lerp(1.68, 1.08, P.crouchT);
    const target = P.pos.y + eyeH;
    // suaviza degraus (subida de pedras/troncos) sem atrasar pulos
    if (Math.abs(target - P.eyeY) > 1.2) P.eyeY = target;
    P.eyeY += (target - P.eyeY) * Math.min(1, dt * (P.onGround ? 14 : 30));
    let cx = P.pos.x, cy = P.eyeY, cz = P.pos.z;
    const bob = P.moveAmt * (1 - S.aim * 0.8);
    cy += -Math.abs(Math.sin(P.bobPhase)) * 0.045 * bob * (P.sprinting ? 1.5 : 1) + 0.02 * bob;
    const side = Math.cos(P.bobPhase) * 0.025 * bob;
    cx += Math.cos(P.yaw) * side; cz += -Math.sin(P.yaw) * side;
    // recuo da câmera
    S.recoilPitch *= Math.exp(-9 * dt); S.recoilYaw *= Math.exp(-9 * dt);
    // oscilação da luneta (respiração, cansaço, movimento)
    let swx = 0, swy = 0;
    const scoped = S.aim > 0.85;
    const shift = S.keys.ShiftLeft || S.keys.ShiftRight;
    P.holdBreath = scoped && shift && P.stamina > 3;
    if (S.aim > 0.3) {
      const fat = 1 + (1 - P.stamina / 100) * 1.8 + P.moveAmt * 2.5 + (P.hp < 30 ? 1 : 0);
      const amp = 0.0042 * fat * (P.holdBreath ? 0.1 : 1) * (P.crouch ? 0.65 : 1) * S.aim;
      const t = S.time;
      swx = (Math.sin(t * 0.61) * 0.7 + Math.sin(t * 1.73 + 1) * 0.3) * amp;
      swy = (Math.sin(t * 1.22 + 2) * 0.6 + Math.sin(t * 0.37) * 0.4) * amp * 0.8;
    }
    // tremor ao receber dano
    P.shake *= Math.exp(-4 * dt);
    const sh = P.shake * 0.03;
    const shx = (Math.random() - 0.5) * sh, shy = (Math.random() - 0.5) * sh;
    // morte: queda ao chão
    let roll = 0, dp = 0;
    if (!P.alive) {
      P.deathT += dt; const a = Math.min(1, P.deathT / 1.1), e = a * a * (3 - 2 * a);
      cy = HZ.lerp(P.eyeY, P.pos.y + 0.28, e); roll = e * 1.25; dp = e * 0.35;
    }
    camera.position.set(cx, cy, cz);
    camera.rotation.set(P.pitch + S.recoilPitch + swy + shy + dp, P.yaw + S.recoilYaw + swx + shx, roll + Math.sin(P.bobPhase) * 0.004 * bob);
    // FOV / luneta
    let fov;
    if (S.aim < 0.85) fov = HZ.lerp(72, 56, S.aim / 0.85); else fov = 12;
    if (P.sprinting) fov += 4;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    UI.scope.classList.toggle('on', scoped);
    UI.crosshair.classList.toggle('hide', scoped || P.sprinting || !P.alive);
    UI.breath.style.opacity = scoped ? (P.holdBreath ? 0.25 : 0.7) : 0;
  }

  // ---------------------------------------------------------------- clima
  function updateWeather(dt) {
    S.rainAmt += ((S.rain ? 1 : 0) - S.rainAmt) * Math.min(1, dt * 0.5);
    const r = S.rainAmt;
    world.skyU.uRain.value = r; world.wetU.value = r;
    scene.fog.density = HZ.lerp(BASE.fogD, BASE.fogD * 2.3, r);
    scene.fog.color.copy(BASE.fogC).lerp(new THREE.Color().setRGB(0.3, 0.33, 0.34), r);
    world.sun.intensity = HZ.lerp(BASE.sun, BASE.sun * 0.12, r);
    world.hemi.intensity = HZ.lerp(BASE.hemi, BASE.hemi * 0.75, r);
    HZ.windUniforms.uWind.value = 1 + r * 1.2;
    rifle.sun.intensity = HZ.lerp(1.6, 0.3, r);
    if (S.rain) {
      S.nextLightning -= dt;
      if (S.nextLightning <= 0) { S.nextLightning = 12 + Math.random() * 25; S.flashT = 0.45; audio.thunder(); }
    }
    if (S.flashT > 0) {
      S.flashT -= dt; const f = S.flashT > 0.3 ? 1 : S.flashT > 0.2 ? 0.2 : S.flashT > 0.12 ? 0.8 : Math.max(0, S.flashT / 0.12) * 0.5;
      world.skyU.uFlash.value = f; world.hemi.intensity += f * 2.5;
    } else world.skyU.uFlash.value = 0;
  }

  // ---------------------------------------------------------------- HUD por quadro
  const DIRS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  function updateHUD(dt) {
    const hp = Math.max(0, P.hp);
    UI.hpFill.style.width = hp + '%'; UI.hpLag.style.width = Math.max(hp, P.hpLag) + '%'; UI.hpText.textContent = Math.ceil(hp);
    UI.hpBar.classList.toggle('low', hp < 30);
    UI.stFill.style.width = P.stamina + '%';
    UI.bandageCount.textContent = P.bandages;
    UI.sound.style.width = Math.round(P.noise * 100) + '%';
    const hdg = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360, i = Math.round(hdg / 45) % 8;
    UI.compM.textContent = DIRS[i]; UI.compL.textContent = DIRS[(i + 7) % 8]; UI.compR.textContent = DIRS[(i + 1) % 8];
    if (S.mode === 'playing') { S.elapsed = (performance.now() - S.startTime) / 1000; UI.timer.textContent = fmt(S.elapsed); }
    UI.threat.classList.toggle('show', animals.threats.length > 0 && P.alive);
    if (S.dmgDirT > 0) { S.dmgDirT -= dt; if (S.dmgDirT <= 0) UI.dmgDir.style.opacity = 0; }
    if (S.hintT > 0) { S.hintT -= dt; if (S.hintT <= 0) UI.hintBottom.classList.remove('show'); }
    P.hurt = Math.max(0, P.hurt - dt * 0.9);
    const low = HZ.clamp((35 - hp) / 35, 0, 1);
    UI.blood.style.opacity = Math.min(0.85, P.hurt * 0.8 + low * 0.55);
    post.u.uDamage.value = Math.min(1, P.hurt * 0.9 + low * (0.35 + 0.25 * Math.sin(S.time * 5)));
    post.u.uLow.value = low;
    post.u.uDead.value = P.alive ? 0 : Math.min(1, P.deathT / 1.5);
    // batimentos com pouca vida
    if (P.alive && hp < 30 && S.time - S.lastHeart > 0.95 - (30 - hp) / 60) { S.lastHeart = S.time; audio.heartbeat(0.6 + low * 0.6); }
    // dica ao olhar um animal abatido
    if (S.mode === 'playing' && P.alive) {
      let txt = '';
      for (const a of animals.list) {
        if (!a.dead) continue;
        const d = a.pos.distanceTo(P.pos); if (d > 4) continue;
        _d.set(a.x - camera.position.x, a.y + 0.3 - camera.position.y, a.z - camera.position.z).normalize();
        camera.getWorldDirection(_u);
        if (_u.dot(_d) > 0.85) { txt = `${a.sp.name.toUpperCase()} ABATIDO`; break; }
      }
      UI.hint.textContent = txt;
    }
  }

  // ---------------------------------------------------------------- redimensionar
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    post.setSize(Math.floor(w * pr), Math.floor(h * pr));
    camera.aspect = w / h; camera.updateProjectionMatrix();
    S.pointScale = (h * pr) / 2 / Math.tan((camera.fov * Math.PI) / 360);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- loop
  const G = {
    player: { pos: P.pos, crouch: false, moving: false, noise: 0, alive: true },
    physics, effects, rain: false, time: 0, huntPressure: false,
    damagePlayer,
  };
  const env = { sunDir: world.sunDir, rain: false, pointScale: 600 };
  let last = performance.now(), frames = 0, fpsT = 0;
  const _eyeP = V();
  const TEST = params.get('test') === '1';
  function frame(now) {
    if (!TEST) requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (S.mode === 'paused' || S.mode === 'loading') dt = 0;
    S.time += dt;
    const t = S.time;

    if (S.mode === 'menu') {
      // câmera cinematográfica lenta no menu
      const a = t * 0.035;
      camera.position.set(SPAWN.x + Math.sin(a) * 3, HZ.heightAt(SPAWN.x, SPAWN.z) + 1.9, SPAWN.z + Math.cos(a) * 3);
      camera.rotation.set(-0.02 + Math.sin(t * 0.1) * 0.02, a * 0.9 + 0.6, 0);
      if (camera.fov !== 72) { camera.fov = 72; camera.updateProjectionMatrix(); }
      camera.updateMatrixWorld();
    } else if (S.mode === 'playing' || S.mode === 'ended') {
      updatePlayer(dt);
      // mira com luneta
      const canAim = S.aimHeld && P.alive && rifle.state !== 'reloading' && P.bandaging <= 0 && !P.sprinting;
      S.aim = HZ.clamp(S.aim + (canAim ? 4.2 : -6) * dt, 0, 1);
      if (S.fire) { S.fire = false; if (P.sprinting) P.sprinting = false; shoot(); }
      updateCamera(dt);
      if (!P.alive && P.deathT > 2.2 && UI.death.classList.contains('hidden')) {
        UI.deathStats.textContent = `Abates: ${S.kills}/${S.total} · Tempo: ${fmt(S.elapsed)}`;
        UI.death.classList.remove('hidden'); UI.hud.classList.add('hidden');
        document.exitPointerLock && document.exitPointerLock();
        S.mode = 'dead';
      }
      if (S.elapsed > 75) S.huntPressure = true;
    } else if (S.mode === 'dead') {
      updateCamera(dt);
    }

    // animais
    G.player.crouch = P.crouch; G.player.moving = P.moving; G.player.noise = P.noise; G.player.alive = P.alive && S.mode === 'playing';
    G.rain = S.rain; G.time = t; G.huntPressure = S.huntPressure;
    if (dt > 0) animals.update(dt, G);

    // mundo e efeitos
    updateWeather(dt);
    world.update(camera, dt, t);
    env.rain = S.rainAmt > 0.5; env.pointScale = S.pointScale || 600;
    if (dt > 0) effects.update(dt, t, camera, env);
    // arma
    const showGun = S.mode === 'playing' && P.alive;
    rifle.root.visible = showGun;
    if (showGun) {
      rifle.update({ cam: camera, dt, t, aim: S.aim, sprint: P.sprinting ? 1 : 0, moveAmt: P.moveAmt, bobPhase: P.bobPhase, lookDX: S.lookDX, lookDY: S.lookDY, scoped: S.aim > 0.85 }, {
        eject: () => { rifle.ejectWorld(_eyeP); _r.set(1, 0, 0).applyQuaternion(camera.quaternion); _u.set(0, 1, 0).applyQuaternion(camera.quaternion); effects.ejectCasing(_eyeP, _r, _u); audio.boltCycle(); audio.casing(_eyeP, 0.5); },
        round: () => { if (S.reserve > 0 && S.ammo < MAG) { S.ammo++; S.reserve--; audio.roundIn(); updateAmmoUI(); } },
        reloaded: () => { audio.noiseBurst({ dur: 0.05, type: 'bandpass', f: 3600, Q: 3, gain: 0.4, verb: 0.05 }); updateAmmoUI(); },
      });
    }
    S.lookDX = 0; S.lookDY = 0;
    audio.updateListener(camera);
    audio.updateAmbience(dt, 0.5 + 0.5 * Math.sin(t * 0.13) + S.rainAmt, S.rainAmt > 0.5, animals.threats.length > 0);
    post.u.uTime.value = t;
    if (!S.noRender) post.render(scene, camera, showGun ? rifle.scene : null);
    if (S.mode !== 'loading') updateHUD(dt);
    frames++; fpsT += (now - (frame.prev || now)) / 1000; frame.prev = now;
    if (fpsT > 1) { HZ.fps = frames / fpsT; frames = 0; fpsT = 0; }
  }

  // pré-compila shaders para evitar travadas no primeiro disparo
  setLoading(0.95, 'Compilando shaders');
  await tick();
  try { renderer.compile(scene, camera); renderer.compile(rifle.scene, camera); } catch (_) {}
  setLoading(1, 'Pronto');
  UI.loading.classList.add('hidden');
  S.mode = 'menu';
  UI.start.classList.remove('hidden');
  if (!TEST) requestAnimationFrame(frame);
  let fakeNow = performance.now();
  const stepFrames = (n = 1, dt = 1 / 30, render = true) => { S.noRender = !render; for (let i = 0; i < n; i++) { fakeNow += dt * 1000; frame(fakeNow); } S.noRender = false; return true; };

  // modos de teste/preview via URL (?preview=animals|play)
  HZ.game = { stepFrames, P, S, animals, world, camera, startGame, damagePlayer, shoot, effects, rifle, scene, renderer, setRain };
  if (params.get('rain') === '1') setRain(true);
  } catch (error) {
    showLoadError(error);
  }
})();
