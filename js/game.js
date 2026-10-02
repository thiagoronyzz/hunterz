/* HUNTERZ — game: player (physics, health, stamina, bandages), weapon, HUD, weather, flow and leaderboard. */
(async function () {
  'use strict';
  const HZ = window.HZ;
  const THREE = window.THREE;
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const $ = (id) => document.getElementById(id);
  const UI = {
    scene: $('scene'), topbar: $('topbar'), hud: $('hud'), weather: $('weatherChip'), weatherLabel: $('weatherLabel'), mission: $('missionText'),
    animalCount: $('animalCount'), killCount: $('killCount'), timer: $('timer'), ammo: $('ammoCount'), reserve: $('reserveCount'), dots: $('ammoDots'), reloadHint: $('reloadHint'),
    score: $('scoreValue'), remainingLabel: $('remainingLabel'), contracts: $('contracts'), contractList: $('contractList'), contractCount: $('contractCount'),
    modeSelect: $('modeSelect'), endOverline: $('endOverline'), scoreBreakdown: $('scoreBreakdown'), finalScore: $('finalScore'),
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
    try { localStorage.setItem('hunterz-quality', 'low'); } catch (_) {}
    const retryUrl = new URL(location.href);
    retryUrl.searchParams.set('q', 'low');
    location.replace(retryUrl.href);
  };
  const showLoadError = (error) => {
    console.error('Failed to start Hunterz:', error);
    UI.loading.classList.remove('hidden');
    UI.loadFill.style.width = '100%';
    UI.loadMsg.textContent = 'Could not prepare the forest at this quality.';
    UI.loadErrorDetail.textContent = error && error.message ? error.message.slice(0, 180) : 'The device could not allocate resources for this configuration.';
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

  // ---------------------------------------------------------------- quality
  const QKEY = 'hunterz-quality';
  // accepts legacy Portuguese quality ids saved in old localStorage/URLs
  const QUALITY_ALIASES = { baixa: 'low', media: 'medium', alta: 'high' };
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  let quality = params.get('q') || localStorage.getItem(QKEY) || (isMobile ? 'low' : 'medium');
  quality = QUALITY_ALIASES[quality] || quality;
  if (!HZ.QUALITY[quality]) quality = 'medium';
  UI.quality.value = quality;
  UI.quality.addEventListener('change', () => {
    try { localStorage.setItem(QKEY, UI.quality.value); } catch (_) {}
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set('q', UI.quality.value);
    location.assign(nextUrl.href);
  });

  // ---------------------------------------------------------------- hunt mode
  // 'contracts' (default): the hunt ends when the three rolled contracts are done;
  // 'free': the classic "take down every animal" session.
  const MKEY = 'hunterz-mode';
  let huntMode = params.get('mode') || localStorage.getItem(MKEY) || 'contracts';
  if (huntMode !== 'free' && huntMode !== 'contracts') huntMode = 'contracts';
  UI.modeSelect.value = huntMode;
  UI.modeSelect.addEventListener('change', () => {
    huntMode = UI.modeSelect.value === 'free' ? 'free' : 'contracts';
    try { localStorage.setItem(MKEY, huntMode); } catch (_) {}
  });

  const test = document.createElement('canvas');
  if (!test.getContext('webgl2')) { UI.loading.classList.add('hidden'); UI.unsupported.classList.remove('hidden'); return; }

  // ---------------------------------------------------------------- renderer
  // Per-device budgets: MSAA HDR + 4K shadows stutter; high stays at 2K/MSAA 2x.
  const q = { ...HZ.QUALITY[quality] };
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, alpha: false });
  const memoryGB = Number(navigator.deviceMemory) || 0;
  const cores = Number(navigator.hardwareConcurrency) || 0;
  const constrainedDevice = isMobile || (memoryGB > 0 && memoryGB <= 4) || (cores > 0 && cores <= 4);
  if (constrainedDevice && quality !== 'low') {
    const high = quality === 'high';
    Object.assign(q, {
      variants: 2,
      treeStep: Math.max(q.treeStep, high ? 6.0 : 6.2),
      treeNear: Math.min(q.treeNear, high ? 90 : 80),
      grassD: Math.min(q.grassD, high ? 1.8 : 1.4),
      grassR: Math.min(q.grassR, high ? 36 : 30),
      fern: Math.min(q.fern, high ? 4200 : 3000),
      fernR: Math.min(q.fernR, high ? 48 : 40),
      bush: Math.min(q.bush, high ? 900 : 700),
      sapling: Math.min(q.sapling, high ? 550 : 400),
      twigs: Math.min(q.twigs, high ? 1400 : 1000),
      stones: Math.min(q.stones, high ? 1400 : 1000),
      mushrooms: Math.min(q.mushrooms, high ? 500 : 400),
      shadow: Math.min(q.shadow, 1024),
      shadowR: Math.min(q.shadowR, high ? 48 : 42),
      samples: 0,
      bloom: false,
      ao: false,
      pixelRatio: Math.min(q.pixelRatio, 1.1),
    });
  }
  const screenPixels = Math.max(1, window.innerWidth * window.innerHeight);
  // More conservative budget on high: avoids stutter on 1440p/4K monitors
  const pixelBudget = constrainedDevice ? 2_200_000 : (quality === 'high' ? 5_500_000 : 7_000_000);
  const pixelRatio = Math.min(
    window.devicePixelRatio || 1,
    q.pixelRatio,
    Math.sqrt(pixelBudget / screenPixels),
  );
  q.pixelRatio = Math.max(0.5, Math.round(pixelRatio * 100) / 100);
  const maxTex = renderer.capabilities.maxTextureSize || 4096;
  // powers of two up to 2048 (4K shadows stutter and cause hitches)
  const shadowCaps = [512, 1024, 2048];
  const pickShadow = (want) => {
    let best = 512;
    for (const s of shadowCaps) if (s <= want && s <= maxTex) best = s;
    return best;
  };
  q.shadow = pickShadow(q.shadow);
  const targetPixels = screenPixels * q.pixelRatio * q.pixelRatio;
  const heavyFrame = targetPixels > 2_200_000 || constrainedDevice || quality === 'low';
  if (targetPixels > 3_500_000 || constrainedDevice) q.shadow = pickShadow(Math.min(q.shadow, 1024));
  const maxSamples = renderer.capabilities.maxSamples || 0;
  q.samples = heavyFrame ? 0 : Math.min(q.samples || 0, maxSamples, 2);
  if (heavyFrame && quality !== 'high') q.bloom = false;
  // On high with a heavy frame, keep light bloom but turn MSAA off
  if (quality === 'high' && heavyFrame) { q.samples = 0; q.bloom = true; }
  HZ.QUALITY[quality] = q;
  renderer.setPixelRatio(q.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  // Soft, penumbra-like shadows read far more natural; low keeps cheap hard PCF
  renderer.shadowMap.type = quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = true;
  UI.scene.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showLoadError(new Error('The WebGL context was lost; try again in low quality.'));
  });
  // full anisotropy keeps bark/ground textures crisp at grazing angles
  HZ.maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());

  const adaptedQuality = constrainedDevice && quality !== 'low';
  const textureQuality = constrainedDevice && quality === 'high' ? 'medium' : quality;
  setLoading(0.03, adaptedQuality ? 'Optimizing the forest for this device' : 'Generating forest textures');
  await tick();
  HZ.textures.build(textureQuality);
  HZ.textures.toThree();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2400);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const world = await HZ.buildWorld(renderer, scene, quality, (p, msg) => setLoading(0.08 + p * 0.8, msg));
  const physics = world.physics;
  setLoading(0.9, 'Releasing the animals');
  await tick();
  const effects = new HZ.Effects(scene, camera, world);
  const audio = new HZ.Audio();
  const animals = new HZ.AnimalManager(scene, physics, effects, audio);
  const rifle = new HZ.Rifle(scene.environment, world.sunDir);
  const post = new HZ.Post(renderer, q);
  const SPAWN = world.SPAWN;
  animals.spawnAll(SPAWN);
  const BASE = { sun: world.sun.intensity, hemi: world.hemi.intensity, fogD: scene.fog.density, fogC: scene.fog.color.clone(), hor: world.skyU.uHorizon.value.clone(), zen: world.skyU.uZenith.value.clone() };

  // ---------------------------------------------------------------- state
  const MAG = 5, RESERVE = 45, BASE_DMG = 62;
  const RKEY = 'hunterz-ranking-v3'; // v3: records carry a score, not just a time
  const P = {
    pos: V(SPAWN.x, HZ.heightAt(SPAWN.x, SPAWN.z), SPAWN.z), vel: V(), knock: V(), yaw: 0, pitch: 0, yawT: 0, pitchT: 0, onGround: true, crouch: false, crouchT: 0, sprinting: false, sprintAmt: 0,
    hp: 100, hpLag: 100, stamina: 100, alive: true, lastHurt: -99, bandages: 3, bandaging: 0, bleeding: 0, noise: 0, moving: false, bobPhase: 0, moveAmt: 0,
    eyeY: 0, shake: 0, hurt: 0, deathT: 0, killer: null, lastStep: 0, holdBreath: false, sprintLock: 0, eye: 1.68, lean: 0, landDip: 0, breathCd: 0,
  };
  const S = {
    mode: 'loading', rain: false, rainAmt: 0, startTime: 0, elapsed: 0, shots: 0, hits: 0, kills: 0, total: 0, ammo: MAG, reserve: RESERVE,
    aim: 0, aimHeld: false, fire: false, lookDX: 0, lookDY: 0, keys: {}, time: 0, flashT: 0, nextLightning: 20, recoilPitch: 0, recoilYaw: 0,
    lastHeart: 0, huntPressure: false, dmgDirT: 0, hintT: 0, lastSpottedT: -99,
  };
  // score + contracts for the current hunt
  const score = HZ.Score.create();
  let contracts = new HZ.Missions.Session(HZ.Missions.roll());

  // ---------------------------------------------------------------- HUD helpers
  function toast(msg, ms = 2400) { UI.toast.textContent = msg; UI.toast.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => UI.toast.classList.remove('show'), ms); }
  function feed(html, bad) { const d = document.createElement('div'); d.innerHTML = html; if (bad) d.className = 'bad'; UI.feed.prepend(d); setTimeout(() => d.remove(), 5000); while (UI.feed.children.length > 5) UI.feed.lastChild.remove(); }
  function hitMarker(final) { UI.hit.classList.remove('show', 'final'); void UI.hit.offsetWidth; UI.hit.classList.add('show'); if (final) UI.hit.classList.add('final'); }
  function hintBottom(msg, s = 2) { UI.hintBottom.textContent = msg; UI.hintBottom.classList.add('show'); S.hintT = s; }
  const fmt = (t) => { const s = Math.max(0, Math.floor(t)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  function updateAmmoUI() {
    UI.ammo.textContent = S.ammo; UI.reserve.textContent = '/ ' + S.reserve;
    UI.dots.innerHTML = ''; for (let i = 0; i < MAG; i++) { const d = document.createElement('i'); if (i >= S.ammo) d.className = 'empty'; UI.dots.appendChild(d); }
    UI.reloadHint.textContent = S.ammo === 0 ? (S.reserve > 0 ? 'OUT OF AMMO · R TO RELOAD' : 'OUT OF AMMO') : 'R TO RELOAD';
  }
  function updateAnimalUI() {
    const alive = animals.list.filter(a => !a.dead).length;
    UI.killCount.textContent = S.kills;
    UI.remainingLabel.textContent = huntMode === 'contracts' ? 'CONTRACTS LEFT' : 'ANIMALS REMAINING';
    UI.animalCount.textContent = huntMode === 'contracts' ? (contracts.total - contracts.completed) : alive;
    UI.mission.textContent = huntMode === 'contracts'
      ? (contracts.allDone ? 'All contracts complete' : (contracts.active ? contracts.active.desc : 'Track the wildlife'))
      : (S.kills >= S.total ? 'Mission complete' : `Take down the wildlife · ${S.kills}/${S.total}`);
    updateScoreUI(); updateContractsUI();
  }
  function updateScoreUI() {
    UI.score.textContent = score.total;
    UI.contracts.classList.toggle('hidden', huntMode !== 'contracts');
  }
  function updateContractsUI() {
    if (huntMode !== 'contracts') { UI.contractList.innerHTML = ''; UI.contractCount.textContent = '0/0'; return; }
    UI.contractCount.textContent = `${contracts.completed}/${contracts.total}`;
    UI.contractList.innerHTML = '';
    for (const c of contracts.list) {
      const li = document.createElement('li');
      li.className = c.done ? 'done' : (c === contracts.active ? 'active' : '');
      const title = document.createElement('span');
      title.textContent = `${c.desc} · ${contracts.progressOf(c)}/${c.need}`;
      const reward = document.createElement('em');
      reward.textContent = `${c.title} · +${c.reward}`;
      li.append(title, reward);
      UI.contractList.appendChild(li);
    }
  }
  // blood smear on screen (generated)
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
  function loadRankings() { try { const d = JSON.parse(localStorage.getItem(RKEY) || '[]'); return Array.isArray(d) ? d.filter(x => x && x.name && x.score > 0).sort((a, b) => b.score - a.score).slice(0, 10) : []; } catch (_) { return []; } }
  function renderRanking() {
    const r = loadRankings(); UI.startRanking.innerHTML = '';
    if (!r.length) { const li = document.createElement('li'); li.className = 'empty-rank'; li.textContent = 'No records yet'; UI.startRanking.appendChild(li); return; }
    r.forEach(it => {
      const li = document.createElement('li'); li.append(document.createTextNode(it.name));
      const s = document.createElement('span'); s.textContent = `${it.score} pts`; s.title = `Time ${fmt(it.time)} · ${it.kills || 0} kills`;
      li.appendChild(s); UI.startRanking.appendChild(li);
    });
  }
  // a hunt qualifies by score: a fast, sloppy session no longer beats a clean one
  const qualifies = (s) => { const r = loadRankings(); return r.length < 10 || s > r[r.length - 1].score; };
  UI.saveRank.addEventListener('click', () => {
    const name = (UI.playerName.value || '').trim().toUpperCase().slice(0, 16) || 'HUNTER';
    const r = loadRankings();
    r.push({ name, score: score.total, time: Math.max(1, Math.round(S.elapsed)), kills: S.kills, date: Date.now() });
    r.sort((a, b) => b.score - a.score);
    try { localStorage.setItem(RKEY, JSON.stringify(r.slice(0, 10))); UI.rankMessage.textContent = 'Record saved to the Top 10!'; UI.saveRank.disabled = true; UI.playerName.disabled = true; renderRanking(); } catch (_) { UI.rankMessage.textContent = 'Could not save in this browser.'; }
  });
  renderRanking();

  // ---------------------------------------------------------------- input
  const canvas = renderer.domElement;
  // Some hosts (embedded previews, strict permission policies) refuse the pointer lock.
  // When that happens the hunter falls back to hold-to-look: drag with the left button to
  // turn the head, quick tap to shoot, right button still scopes.
  let lockBlocked = false, drag = null;
  // Aim is buffered on yawT/pitchT and eased toward every frame, which removes the
  // raw 1:1 jitter of the mouse and makes turning feel fluid and cinematic.
  const look = (dx, dy) => {
    const sens = 0.0024 * Math.max(0.2, camera.fov / 72);
    P.yawT -= dx * sens; P.pitchT -= dy * sens;
    P.pitchT = HZ.clamp(P.pitchT, -1.48, 1.48);
    S.lookDX += dx; S.lookDY += dy;
  };
  const useFallbackLook = () => {
    if (lockBlocked) return;
    lockBlocked = true;
    if (S.mode === 'playing') toast('Mouse capture is blocked here — drag with the left button to look around.', 5200);
  };
  const lock = () => {
    if (lockBlocked) return;
    try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(useFallbackLook); } catch (_) { useFallbackLook(); }
  };
  document.addEventListener('pointerlockerror', useFallbackLook);
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (!locked && S.mode === 'playing' && !lockBlocked) pauseGame();
  });
  document.addEventListener('mousemove', (e) => {
    if (S.mode !== 'playing' || !P.alive) return;
    if (document.pointerLockElement === canvas) { look(e.movementX, e.movementY); return; }
    if (lockBlocked && drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      look(dx * 1.15, dy * 1.15);
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (S.mode !== 'playing') return;
    if (document.pointerLockElement !== canvas && !lockBlocked) { lock(); return; }
    if (e.button === 2) { S.aimHeld = true; audio.aim(true); return; }
    if (e.button !== 0) return;
    if (lockBlocked) drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    else S.fire = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) { S.aimHeld = false; return; }
    if (e.button !== 0 || !lockBlocked) return;
    const d = drag; drag = null;
    // a short press without dragging is a shot, a drag was just looking around
    if (d && d.moved < 8 && performance.now() - d.t < 400 && S.mode === 'playing' && P.alive) S.fire = true;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => {
    S.keys[e.code] = true;
    if (e.code === 'Escape' && S.mode === 'playing') { pauseGame(); return; }
    if (S.mode !== 'playing') return;
    if (e.code === 'KeyR') reload();
    if (e.code === 'KeyC' || e.code === 'ControlLeft') { P.crouch = !P.crouch; e.preventDefault(); }
    if (e.code === 'KeyQ') useBandage();
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { S.keys[e.code] = false; });
  window.addEventListener('blur', () => { S.keys = {}; S.aimHeld = false; });

  // ---------------------------------------------------------------- flow
  function resetPlayer() {
    P.pos.set(SPAWN.x, HZ.heightAt(SPAWN.x, SPAWN.z), SPAWN.z); P.vel.set(0, 0, 0); P.knock.set(0, 0, 0);
    P.yaw = 0; P.pitch = 0; P.yawT = 0; P.pitchT = 0; P.lean = 0; P.landDip = 0; P.sprintAmt = 0; P.breathCd = 0;
    P.hp = 100; P.hpLag = 100; P.stamina = 100; P.alive = true; P.bandages = 3; P.bandaging = 0; P.bleeding = 0;
    P.crouch = false; P.deathT = 0; P.hurt = 0; P.shake = 0; P.lastHurt = -99; P.eyeY = P.pos.y + 1.68;
    S.ammo = MAG; S.reserve = RESERVE; S.shots = 0; S.hits = 0; S.kills = 0; S.aim = 0; S.aimHeld = false; S.fire = false;
    S.lastSpottedT = -99; score.reset();
    rifle.state = 'ready'; post.u.uDead.value = 0; camera.rotation.z = 0;
  }
  function startGame() {
    audio.init(); audio.setVolume(UI.volume.value / 100);
    contracts = new HZ.Missions.Session(HZ.Missions.roll());
    resetPlayer();
    S.total = animals.list.length;
    S.mode = 'playing'; S.startTime = performance.now(); S.elapsed = 0; S.huntPressure = false;
    UI.start.classList.add('hidden'); UI.pause.classList.add('hidden'); UI.death.classList.add('hidden'); UI.end.classList.add('hidden');
    UI.hud.classList.remove('hidden'); UI.topbar.classList.remove('hidden');
    updateAmmoUI(); updateAnimalUI();
    world.forceUpdate();
    lock();
    toast('Careful: wolves and bears hunt you — and a wounded boar will charge. Good hunting.', 3800);
  }
  function restartGame() {
    effects.clear();
    animals.spawnAll(SPAWN);
    UI.rankingEntry.classList.add('hidden'); UI.notQualified.classList.add('hidden'); UI.rankMessage.textContent = ''; UI.playerName.value = ''; UI.playerName.disabled = false; UI.saveRank.disabled = false;
    startGame();
  }
  function pauseGame() { if (S.mode !== 'playing') return; S.mode = 'paused'; S.pauseAt = performance.now(); UI.pause.classList.remove('hidden'); S.keys = {}; S.aimHeld = false; document.exitPointerLock && document.exitPointerLock(); }
  function resumeGame() { if (S.mode !== 'paused') return; S.startTime += performance.now() - S.pauseAt; S.mode = 'playing'; UI.pause.classList.add('hidden'); lock(); }
  function setRain(on) { S.rain = on; UI.rain.checked = on; UI.weather.classList.toggle('rain', on); UI.weatherLabel.textContent = on ? 'Heavy rain' : 'Clear sky'; }
  UI.startBtn.addEventListener('click', startGame);
  UI.resume.addEventListener('click', resumeGame);
  UI.restart.addEventListener('click', restartGame);
  UI.retry.addEventListener('click', restartGame);
  UI.playAgain.addEventListener('click', restartGame);
  UI.rain.addEventListener('change', () => setRain(UI.rain.checked));
  UI.rainPause.addEventListener('click', () => setRain(!S.rain));
  UI.volume.addEventListener('input', () => audio.setVolume(UI.volume.value / 100));

  function renderBreakdown() {
    const b = score.breakdown();
    UI.finalScore.textContent = b.total;
    UI.scoreBreakdown.innerHTML = '';
    const row = (label, value, bad) => {
      const li = document.createElement('li');
      if (bad) li.className = 'penalty';
      const l = document.createElement('span'); l.textContent = label;
      const v = document.createElement('b'); v.textContent = value;
      li.append(l, v); UI.scoreBreakdown.appendChild(li);
    };
    row('Kill points', b.killPoints);
    row('Contract points', b.objectivePoints);
    row('Vital hits', `${score.vitalKills}/${b.kills}`);
    row('Accuracy', `${b.hits}/${b.shots} shots · ${Math.round(b.accuracy * 100)}%`);
    row('Accuracy factor', '×' + b.accuracyMult.toFixed(2), b.accuracyMult < 1);
    row('Vital factor', '×' + b.vitalsMult.toFixed(2), b.vitalsMult < 1);
  }
  function finishSession() {
    if (S.mode !== 'playing') return;
    S.mode = 'ended'; document.exitPointerLock && document.exitPointerLock();
    const acc = S.shots ? Math.round((S.hits / S.shots) * 100) : 0;
    UI.endOverline.textContent = huntMode === 'contracts' ? 'ALL CONTRACTS COMPLETE' : 'ALL ANIMALS DOWN';
    UI.finalKills.textContent = S.kills; UI.finalAccuracy.textContent = acc + '%'; UI.finalTime.textContent = fmt(S.elapsed);
    renderBreakdown();
    const total = score.total;
    const ok = qualifies(total); UI.rankingEntry.classList.toggle('hidden', !ok); UI.notQualified.classList.toggle('hidden', ok);
    UI.end.classList.remove('hidden'); UI.hud.classList.add('hidden');
  }

  // ---------------------------------------------------------------- player damage
  function damagePlayer(dmg, src, knock, cause) {
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
    if (P.hp <= 0) killPlayer(src, cause);
  }
  function killPlayer(src, cause) {
    P.hp = 0; P.alive = false; P.deathT = 0; P.killer = src;
    S.aimHeld = false; S.aim = 0;
    const names = { wolf: 'A WOLF', bear: 'A BEAR', boar: 'A BOAR' };
    UI.deathCause.textContent = cause === 'fall' ? 'KILLED BY THE FALL'
      : src ? `ATTACKED BY ${names[src.type] || 'AN ANIMAL'}` : 'YOU BLED OUT';
    audio.heartbeat(1.5);
  }

  // ---------------------------------------------------------------- weapon
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
    if (P.bandages <= 0) { hintBottom('NO BANDAGES'); return; }
    if (P.hp >= 100 && P.bleeding <= 0) { hintBottom('HEALTH FULL'); return; }
    P.bandaging = 2.6; P.bandages--; audio.bandage(); UI.bandages.classList.add('using'); hintBottom('APPLYING BANDAGE...', 2.6);
  }
  const _o = V(), _d = V(), _m = V(), _r = V(), _u = V();
  function shoot() {
    if (!P.alive || P.bandaging > 0) return;
    if (rifle.state !== 'ready') return;
    if (S.ammo <= 0) { audio.dry(); hintBottom(S.reserve > 0 ? 'OUT OF AMMO · PRESS R' : 'OUT OF AMMO'); return; }
    S.ammo--; S.shots++; score.shotFired();
    P.sprintLock = 0.22;
    rifle.fire(); audio.gunshot();
    camera.updateMatrixWorld();
    // spread: minimal when scoped; larger while moving/in the air
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
        S.hits++; score.shotHit();
        const dist = Math.round(ha.distance);
        setTimeout(() => audio.impact('flesh', ha.point), Math.min(900, ha.distance / 0.34));
        hitMarker(res.killed);
        const zone = { head: 'HEAD', neck: 'NECK', body: res.vital ? 'HEART/LUNG' : 'BODY', leg: 'LEG' }[res.zone];
        if (!res.killed) feed(`${an.sp.name} hit · ${zone} <b>${dist} m</b>`, true);
        if (!res.killed && an.sp.hostile === 'prey') hintBottom('ANIMAL HIT · FOLLOW THE BLOOD TRAIL', 3);
      }
    } else if (hw) {
      effects.impact(hw.kind, hw.point, hw.normal);
      setTimeout(() => audio.impact(hw.kind, hw.point), Math.min(900, hw.t / 0.34));
    }
    updateAmmoUI();
    updateScoreUI(); // the accuracy factor moves with every shot
    if (S.ammo === 0 && S.reserve > 0) setTimeout(() => { if (S.ammo === 0) hintBottom('PRESS R TO RELOAD', 2.5); }, 900);
  }
  animals.onKillCb = (a, zone, info) => {
    S.kills++;
    // a kill counts as stealthy when the animal never noticed the hunter
    const evt = {
      type: a.type, zone, vital: !!(info && info.vital), distance: info ? info.distance : 0,
      bledOut: !info, stealth: S.time - S.lastSpottedT > 4,
      crouch: P.crouch, sprint: P.sprinting, time: S.elapsed,
    };
    const { points, label } = score.addKill(a.sp, evt);
    feed(`${a.sp.name} down · ${label} <b>+${points} pts</b>`);
    const finished = huntMode === 'contracts' ? contracts.onKill(evt) : [];
    for (const c of finished) {
      score.addObjective(c.reward);
      toast(`CONTRACT COMPLETE · ${c.title} · +${c.reward}`, 3200);
      feed(`<b>${c.title}</b> complete +${c.reward}`);
    }
    updateAnimalUI();
    if (huntMode === 'contracts' ? contracts.allDone : S.kills >= S.total) setTimeout(finishSession, 1500);
  };

  // ---------------------------------------------------------------- player
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
    // sprint works in any forward-ish direction (strafe included), not only dead ahead
    const wantMove = iz > 0.05 || Math.abs(ix) > 0.4;
    const wantSprint = shift && wantMove && !P.crouch && S.aim < 0.3 && P.stamina > 1.5 && P.bandaging <= 0 && rifle.state !== 'reloading' && P.sprintLock <= 0;
    P.sprinting = wantSprint && P.onGround ? true : P.sprinting && wantSprint;
    const water = HZ.isWater(P.pos.x, P.pos.z, -0.25);
    let speed = P.sprinting ? 7.2 : P.crouch ? 2.05 : 4.0;
    if (S.aim > 0.3) speed = Math.min(speed, 2.2);
    if (P.bandaging > 0) speed = Math.min(speed, 1.4);
    if (water) speed *= 0.62;
    if (P.hp < 25) speed *= 0.88;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    const tx = (fx * iz + rx * ix) * speed, tz = (fz * iz + rz * ix) * speed;
    // high acceleration = responsive controls; the exponential approach keeps it silky
    const acc = P.onGround ? 16 : 4;
    P.vel.x += (tx - P.vel.x) * Math.min(1, acc * dt); P.vel.z += (tz - P.vel.z) * Math.min(1, acc * dt);
    // jump
    if (alive && k.Space && P.onGround && P.stamina > 4 && !P.crouch) { P.vel.y = 5.6; P.onGround = false; P.stamina -= 6; }
    if (alive && k.Space && P.crouch) P.crouch = false;
    P.vel.y -= 17 * dt;
    // knockback from attacks
    P.knock.multiplyScalar(Math.exp(-6 * dt));
    const mx = (P.vel.x + P.knock.x) * dt, mz = (P.vel.z + P.knock.z) * dt;
    const p = { x: P.pos.x, y: P.pos.y, z: P.pos.z };
    const res = physics.moveCircle(p, mx, mz, 0.35, P.onGround ? 0.55 : 0.3, BOUND);
    P.pos.x = p.x; P.pos.z = p.z;
    const g = res.ground;
    const ny = P.pos.y + P.vel.y * dt;
    if (ny <= g) {
      if (!P.onGround && P.vel.y < -3) { audio.land(-P.vel.y); if (P.vel.y < -11) damagePlayer((-P.vel.y - 11) * 6, null, 0, 'fall'); P.shake = Math.min(1, P.shake + 0.2); P.landDip = Math.min(1, -P.vel.y / 12); }
      P.pos.y = g; P.vel.y = 0; P.onGround = true;
    } else if (P.onGround && P.vel.y <= 0 && P.pos.y - g < 0.55) { P.pos.y = g; P.vel.y = 0; }
    else { P.pos.y = ny; P.onGround = false; }
    // stamina (recovers quickly so sprinting stays a tool, not a chore)
    if (P.sprinting && Math.hypot(P.vel.x, P.vel.z) > 3) { P.stamina -= 12 * dt; P.staminaT = 1; }
    else if (P.holdBreath) P.stamina -= 20 * dt;
    else { P.staminaT = (P.staminaT || 0) - dt; if (P.staminaT <= 0) P.stamina += 15 * dt; }
    P.stamina = HZ.clamp(P.stamina, 0, 100);
    // out of breath: audible panting when the tank runs low
    P.breathCd -= dt;
    if (alive && P.stamina < 34 && P.breathCd <= 0) { P.breathCd = 3.4; audio.breath(); }
    // smooth crouch
    P.crouchT += ((P.crouch ? 1 : 0) - P.crouchT) * Math.min(1, dt * 11);
    // footsteps and bobbing
    const hs = Math.hypot(P.vel.x, P.vel.z);
    P.moving = hs > 0.4;
    P.moveAmt += ((P.onGround ? Math.min(1, hs / 3.5) : 0) - P.moveAmt) * Math.min(1, dt * 8);
    const stepLen = P.sprinting ? 1.05 : P.crouch ? 0.55 : 0.78;
    if (P.onGround && hs > 0.3) {
      P.bobPhase += (hs / stepLen) * Math.PI * dt;
      const st = Math.floor(P.bobPhase / Math.PI);
      if (st !== P.lastStep) { P.lastStep = st; audio.step(surfaceAt(P.pos.x, P.pos.z, P.pos.y), P.sprinting ? 1.4 : P.crouch ? 0.35 : 0.8); }
    }
    // player noise (heard by animals)
    const nTarget = !P.moving ? 0.02 : P.sprinting ? 1 : P.crouch ? 0.12 : 0.42;
    P.noise += (nTarget - P.noise) * Math.min(1, dt * (nTarget > P.noise ? 6 : 1.2));
    // health: bleeding, slow regeneration up to 50, bandages
    if (P.alive) {
      if (P.bleeding > 0) { P.hp -= 1.1 * dt; P.bleeding -= dt; if (Math.random() < dt * 2) effects.groundDecal(P.pos.x + (Math.random() - 0.5) * 0.4, P.pos.z + (Math.random() - 0.5) * 0.4, 0.08 + Math.random() * 0.08, 0, 0.9); if (P.hp <= 0) killPlayer(null); }
      if (S.time - P.lastHurt > 9 && P.hp < 50 && P.bleeding <= 0) P.hp = Math.min(50, P.hp + 1.0 * dt);
      if (P.bandaging > 0) {
        P.bandaging -= dt;
        if (P.bandaging <= 0) { P.hp = Math.min(100, P.hp + 40); P.bleeding = 0; UI.bandages.classList.remove('using'); toast('Wounds bandaged · +40 health'); }
      }
    }
    P.hpLag += (P.hp - P.hpLag) * Math.min(1, dt * 1.5);
  }

  // ---------------------------------------------------------------- camera
  function updateCamera(dt) {
    // eased head turn: the buffered aim glides instead of snapping to the raw mouse
    const lk = 1 - Math.exp(-26 * dt);
    P.yaw += (P.yawT - P.yaw) * lk;
    P.pitch += (P.pitchT - P.pitch) * lk;
    P.sprintAmt += ((P.sprinting ? 1 : 0) - P.sprintAmt) * Math.min(1, dt * 7);
    const eyeH = HZ.lerp(1.68, 1.08, P.crouchT);
    const target = P.pos.y + eyeH;
    // smooth steps (climbing rocks/logs) without delaying jumps
    if (Math.abs(target - P.eyeY) > 1.2) P.eyeY = target;
    P.eyeY += (target - P.eyeY) * Math.min(1, dt * (P.onGround ? 16 : 30));
    let cx = P.pos.x, cy = P.eyeY, cz = P.pos.z;
    const bob = P.moveAmt * (1 - S.aim * 0.8);
    // raised-cosine bob: no sharp corners at the bottom of each step
    cy += -(0.5 - 0.5 * Math.cos(2 * P.bobPhase)) * 0.036 * bob * (P.sprinting ? 1.3 : 1) + 0.018 * bob;
    const side = Math.cos(P.bobPhase) * 0.02 * bob;
    cx += Math.cos(P.yaw) * side; cz += -Math.sin(P.yaw) * side;
    // knees absorb a landing; the body leans a touch into fast strafes
    P.landDip *= Math.exp(-6 * dt);
    cy -= P.landDip * 0.09;
    const lat = P.vel.x * Math.cos(P.yaw) - P.vel.z * Math.sin(P.yaw);
    const leanT = HZ.clamp(-lat * 0.01, -0.028, 0.028) * (1 - S.aim * 0.6);
    P.lean += (leanT - P.lean) * Math.min(1, dt * 5);
    // camera recoil
    S.recoilPitch *= Math.exp(-9 * dt); S.recoilYaw *= Math.exp(-9 * dt);
    // scope sway (breathing, fatigue, movement)
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
    // shake when taking damage
    P.shake *= Math.exp(-4 * dt);
    const sh = P.shake * 0.03;
    const shx = (Math.random() - 0.5) * sh, shy = (Math.random() - 0.5) * sh;
    // death: fall to the ground
    let roll = 0, dp = 0;
    if (!P.alive) {
      P.deathT += dt; const a = Math.min(1, P.deathT / 1.1), e = a * a * (3 - 2 * a);
      cy = HZ.lerp(P.eyeY, P.pos.y + 0.28, e); roll = e * 1.25; dp = e * 0.35;
    }
    camera.position.set(cx, cy, cz);
    camera.rotation.set(P.pitch + S.recoilPitch + swy + shy + dp, P.yaw + S.recoilYaw + swx + shx, roll + P.lean + Math.sin(P.bobPhase) * 0.003 * bob);
    // FOV / scope — a continuous curve over the aim value, so zooming never snaps
    const aimT = HZ.smooth(0.45, 1.0, S.aim);
    let fov = HZ.lerp(72, 12, aimT);
    fov += 4 * P.sprintAmt * (1 - aimT);
    if (Math.abs(camera.fov - fov) > 0.02) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 13); camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    UI.scope.classList.toggle('on', scoped);
    UI.crosshair.classList.toggle('hide', scoped || P.sprinting || !P.alive);
    UI.breath.style.opacity = scoped ? (P.holdBreath ? 0.25 : 0.7) : 0;
  }

  // ---------------------------------------------------------------- weather
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

  // ---------------------------------------------------------------- HUD per frame
  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
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
    // heartbeat at low health
    if (P.alive && hp < 30 && S.time - S.lastHeart > 0.95 - (30 - hp) / 60) { S.lastHeart = S.time; audio.heartbeat(0.6 + low * 0.6); }
    // hint when looking at a downed animal
    if (S.mode === 'playing' && P.alive) {
      let txt = '';
      for (const a of animals.list) {
        if (!a.dead) continue;
        const d = a.pos.distanceTo(P.pos); if (d > 4) continue;
        _d.set(a.x - camera.position.x, a.y + 0.3 - camera.position.y, a.z - camera.position.z).normalize();
        camera.getWorldDirection(_u);
        if (_u.dot(_d) > 0.85) { txt = `${a.sp.name.toUpperCase()} DOWN`; break; }
      }
      UI.hint.textContent = txt;
    }
  }

  // ---------------------------------------------------------------- resize
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
  // Dynamic scaling: if FPS drops, ease off grass/shadows for a few seconds
  let perfScale = 1, perfCool = 0;
  const baseGrassR = (HZ.sharedUniforms && HZ.sharedUniforms.uFadeGrass) ? HZ.sharedUniforms.uFadeGrass.value.clone() : null;
  function applyPerfScale(s) {
    if (!HZ.sharedUniforms || !HZ.sharedUniforms.uFadeGrass || !baseGrassR) return;
    const f = 0.55 + 0.45 * s;
    HZ.sharedUniforms.uFadeGrass.value.set(baseGrassR.x * f, baseGrassR.y * f);
    // disable shadows only on severe stutter; re-enable later
    renderer.shadowMap.enabled = s > 0.4;
  }
  function frame(now) {
    if (!TEST) requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (S.mode === 'paused' || S.mode === 'loading') dt = 0;
    S.time += dt;
    const t = S.time;

    if (S.mode === 'menu') {
      // slow cinematic camera in the menu
      const a = t * 0.035;
      camera.position.set(SPAWN.x + Math.sin(a) * 3, HZ.heightAt(SPAWN.x, SPAWN.z) + 1.9, SPAWN.z + Math.cos(a) * 3);
      camera.rotation.set(-0.02 + Math.sin(t * 0.1) * 0.02, a * 0.9 + 0.6, 0);
      if (camera.fov !== 72) { camera.fov = 72; camera.updateProjectionMatrix(); }
      camera.updateMatrixWorld();
    } else if (S.mode === 'playing' || S.mode === 'ended') {
      updatePlayer(dt);
      // scope aiming
      const canAim = S.aimHeld && P.alive && rifle.state !== 'reloading' && P.bandaging <= 0 && !P.sprinting;
      S.aim = HZ.clamp(S.aim + (canAim ? 5.2 : -7.5) * dt, 0, 1);
      if (S.fire) { S.fire = false; if (P.sprinting) P.sprinting = false; shoot(); }
      updateCamera(dt);
      if (!P.alive && P.deathT > 2.2 && UI.death.classList.contains('hidden')) {
        UI.deathStats.textContent = huntMode === 'contracts'
          ? `Contracts: ${contracts.completed}/${contracts.total} · Kills: ${S.kills} · Score: ${score.total} · Time: ${fmt(S.elapsed)}`
          : `Kills: ${S.kills}/${S.total} · Score: ${score.total} · Time: ${fmt(S.elapsed)}`;
        UI.death.classList.remove('hidden'); UI.hud.classList.add('hidden');
        document.exitPointerLock && document.exitPointerLock();
        S.mode = 'dead';
      }
      if (S.elapsed > 75) S.huntPressure = true;
    } else if (S.mode === 'dead') {
      updateCamera(dt);
    }

    // animals
    G.player.crouch = P.crouch; G.player.moving = P.moving; G.player.noise = P.noise; G.player.alive = P.alive && S.mode === 'playing';
    G.rain = S.rain; G.time = t; G.huntPressure = S.huntPressure;
    if (dt > 0) animals.update(dt, G);
    // "spotted" bookkeeping: the last time an animal within range had eyes on the hunter
    if (dt > 0 && P.alive) for (const a of animals.list) { if (!a.dead && a.seen && a.distToPlayer < 90) { S.lastSpottedT = S.time; break; } }

    // world and effects
    updateWeather(dt);
    world.update(camera, dt, t);
    env.rain = S.rainAmt > 0.5; env.pointScale = S.pointScale || 600;
    if (dt > 0) effects.update(dt, t, camera, env);
    // weapon
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
    if (fpsT > 1) {
      HZ.fps = frames / fpsT; frames = 0; fpsT = 0;
      // automatic adaptation only on high/medium quality (avoids hitching and overload splotches)
      if (quality !== 'low' && S.mode === 'playing') {
        if (HZ.fps < 28) { perfScale = Math.max(0.35, perfScale - 0.2); perfCool = 4; applyPerfScale(perfScale); }
        else if (HZ.fps < 40) { perfScale = Math.max(0.55, perfScale - 0.1); perfCool = 2.5; applyPerfScale(perfScale); }
        else if (perfCool > 0) { perfCool -= 1; }
        else if (perfScale < 1 && HZ.fps > 50) { perfScale = Math.min(1, perfScale + 0.1); applyPerfScale(perfScale); }
      }
    }
  }

  // pre-compile shaders to avoid hitches on the first shot
  setLoading(0.95, 'Compiling shaders');
  await tick();
  try { renderer.compile(scene, camera); renderer.compile(rifle.scene, camera); } catch (_) {}
  setLoading(1, 'Ready');
  UI.loading.classList.add('hidden');
  S.mode = 'menu';
  UI.start.classList.remove('hidden');
  if (!TEST) requestAnimationFrame(frame);
  let fakeNow = performance.now();
  const stepFrames = (n = 1, dt = 1 / 30, render = true) => { S.noRender = !render; for (let i = 0; i < n; i++) { fakeNow += dt * 1000; frame(fakeNow); } S.noRender = false; return true; };

  // test/preview modes via URL (?preview=animals|play)
  HZ.game = {
    stepFrames, P, S, animals, world, camera, startGame, damagePlayer, shoot, effects, rifle, scene, renderer, setRain, score, updateAnimalUI,
    get contracts() { return contracts; },
    get huntMode() { return huntMode; },
    setHuntMode(m) { huntMode = m === 'free' ? 'free' : 'contracts'; UI.modeSelect.value = huntMode; updateAnimalUI(); },
  };
  if (params.get('rain') === '1') setRain(true);
  } catch (error) {
    showLoadError(error);
  }
})();
