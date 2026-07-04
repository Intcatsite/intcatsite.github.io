(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const BORDER_X = 190; // right edge of the Ukraine strip / left edge of placeable Russia zone
  const TOP_MARGIN = 30;
  const BOTTOM_MARGIN = 30;
  const MIN_BUILD_DIST = 48;

  const COSTS = { factory: 150, pvo: 250, interceptor: 350 };
  const BOUNTY_PVO = 15;
  const BOUNTY_INTERCEPTOR = 20;

  const moneyEl = document.getElementById("moneyVal");
  const waveEl = document.getElementById("waveVal");
  const factoriesEl = document.getElementById("factoriesVal");
  const bannerEl = document.getElementById("banner");
  const hintEl = document.getElementById("hint");
  const overlayEl = document.getElementById("overlay");
  const finalScoreEl = document.getElementById("finalScore");
  const introEl = document.getElementById("introOverlay");

  const btnFactory = document.getElementById("btnFactory");
  const btnPvo = document.getElementById("btnPvo");
  const btnInterceptor = document.getElementById("btnInterceptor");
  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");
  const btnRestart2 = document.getElementById("btnRestart2");
  const btnStart = document.getElementById("btnStart");

  const buildButtons = { factory: btnFactory, pvo: btnPvo, interceptor: btnInterceptor };

  let state = null;
  let selectedMode = null;
  let paused = true;
  let started = false;
  let mouse = { x: -9999, y: -9999 };
  let lastTime = 0;
  let bannerTimer = 0;

  function freshState() {
    return {
      money: 500,
      totalEarned: 500,
      wave: 1,
      waveTimer: 25,
      spawnTimer: 1.5,
      hadFactory: false,
      gameOver: false,
      nextId: 1,
      factories: [],
      pvos: [],
      interceptors: [],
      drones: [],
      explosions: [],
    };
  }

  function resetGame() {
    state = freshState();
    selectedMode = null;
    updateBuildButtons();
    overlayEl.classList.remove("show");
    updateHud();
  }

  function showBanner(text) {
    bannerEl.textContent = text;
    bannerEl.classList.add("show");
    bannerTimer = 2.4;
  }

  function updateHud() {
    moneyEl.textContent = Math.floor(state.money);
    waveEl.textContent = state.wave;
    factoriesEl.textContent = state.factories.length;
  }

  function updateBuildButtons() {
    for (const key in buildButtons) {
      const btn = buildButtons[key];
      btn.classList.toggle("selected", selectedMode === key);
      btn.disabled = state.money < COSTS[key];
    }
  }

  function canPlaceAt(x, y) {
    if (x < BORDER_X + 30 || x > W - 30) return false;
    if (y < TOP_MARGIN + 10 || y > H - BOTTOM_MARGIN - 10) return false;
    const all = [...state.factories, ...state.pvos, ...state.interceptors];
    for (const b of all) {
      const dx = b.x - x, dy = b.y - y;
      if (Math.hypot(dx, dy) < MIN_BUILD_DIST) return false;
    }
    return true;
  }

  function placeBuilding(mode, x, y) {
    const cost = COSTS[mode];
    if (state.money < cost) return false;
    if (!canPlaceAt(x, y)) return false;
    state.money -= cost;
    const id = state.nextId++;
    if (mode === "factory") {
      state.factories.push({ id, x, y, hp: 100, maxHp: 100, income: 8, radius: 22 });
      state.hadFactory = true;
    } else if (mode === "pvo") {
      state.pvos.push({ id, x, y, range: 135, dps: 55, fireFx: 0 });
    } else if (mode === "interceptor") {
      state.interceptors.push({
        id, x, y, homeX: x, homeY: y,
        speed: 230, detect: 340, killRange: 24,
        state: "patrol", targetId: null, cooldown: 0,
        angle: 0, patrolT: Math.random() * Math.PI * 2,
      });
    }
    updateHud();
    return true;
  }

  function spawnDrone() {
    const y = TOP_MARGIN + 40 + Math.random() * (H - TOP_MARGIN - BOTTOM_MARGIN - 80);
    const x = 30;
    const wave = state.wave;
    const speed = Math.min(70 + wave * 4, 170);
    const hp = 85 + wave * 6;
    let target = null;
    if (state.factories.length) {
      target = state.factories[Math.floor(Math.random() * state.factories.length)];
    }
    if (!target) return;
    state.drones.push({
      id: state.nextId++, x, y, speed, hp, maxHp: hp,
      targetId: target.id, claimedBy: null, alive: true,
    });
  }

  function findFactory(id) {
    return state.factories.find(f => f.id === id) || null;
  }
  function findDrone(id) {
    return state.drones.find(d => d.id === id && d.alive) || null;
  }

  function addExplosion(x, y, size, color) {
    state.explosions.push({ x, y, life: 0, maxLife: 0.5, size, color });
  }

  function destroyDrone(drone, bounty) {
    drone.alive = false;
    state.money += bounty;
    state.totalEarned += bounty;
    addExplosion(drone.x, drone.y, 26, "#ffd54a");
  }

  function update(dt) {
    if (state.gameOver) return;

    // economy
    for (const f of state.factories) {
      state.money += f.income * dt;
      state.totalEarned += f.income * dt;
    }

    // wave progression
    state.waveTimer -= dt;
    if (state.waveTimer <= 0) {
      state.wave += 1;
      state.waveTimer = 25;
      showBanner(`Волна ${state.wave}!`);
    }

    // spawning
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      if (state.factories.length > 0) {
        spawnDrone();
        const base = Math.max(0.9, 3.2 - state.wave * 0.15);
        state.spawnTimer = base * (0.7 + Math.random() * 0.6);
      } else {
        state.spawnTimer = 0.5;
      }
    }

    // drones move
    for (const d of state.drones) {
      if (!d.alive) continue;
      const target = findFactory(d.targetId);
      if (!target) { d.alive = false; continue; }
      const dx = target.x - d.x, dy = target.y - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < target.radius + 6) {
        // impact
        d.alive = false;
        addExplosion(target.x, target.y, 46, "#ff5f5f");
        state.factories = state.factories.filter(f => f.id !== target.id);
        updateHud();
        continue;
      }
      d.x += (dx / dist) * d.speed * dt;
      d.y += (dy / dist) * d.speed * dt;
    }

    // PVO fire
    for (const p of state.pvos) {
      p.fireFx = Math.max(0, p.fireFx - dt);
      let firing = false;
      for (const d of state.drones) {
        if (!d.alive) continue;
        const dist = Math.hypot(d.x - p.x, d.y - p.y);
        if (dist <= p.range) {
          d.hp -= p.dps * dt;
          firing = true;
          if (d.hp <= 0) destroyDrone(d, BOUNTY_PVO);
        }
      }
      if (firing) p.fireFx = 0.1;
    }

    // interceptors
    for (const it of state.interceptors) {
      if (it.state === "patrol") {
        it.patrolT += dt * 0.8;
        const px = it.homeX + Math.cos(it.patrolT) * 26;
        const py = it.homeY + Math.sin(it.patrolT) * 26;
        it.angle = Math.atan2(py - it.y, px - it.x);
        it.x += (px - it.x) * Math.min(1, dt * 3);
        it.y += (py - it.y) * Math.min(1, dt * 3);
        let best = null, bestDist = Infinity;
        for (const d of state.drones) {
          if (!d.alive || d.claimedBy) continue;
          const dist = Math.hypot(d.x - it.homeX, d.y - it.homeY);
          if (dist <= it.detect && dist < bestDist) { best = d; bestDist = dist; }
        }
        if (best) { it.state = "engage"; it.targetId = best.id; best.claimedBy = it.id; }
      } else if (it.state === "engage") {
        const target = findDrone(it.targetId);
        if (!target) {
          it.state = "patrol"; it.targetId = null;
        } else {
          const dx = target.x - it.x, dy = target.y - it.y;
          const dist = Math.hypot(dx, dy);
          it.angle = Math.atan2(dy, dx);
          if (dist <= it.killRange) {
            destroyDrone(target, BOUNTY_INTERCEPTOR);
            it.state = "cooldown"; it.cooldown = 2.0; it.targetId = null;
          } else {
            it.x += (dx / dist) * it.speed * dt;
            it.y += (dy / dist) * it.speed * dt;
          }
        }
      } else if (it.state === "cooldown") {
        it.cooldown -= dt;
        const dx = it.homeX - it.x, dy = it.homeY - it.y;
        const dist = Math.hypot(dx, dy);
        it.angle = Math.atan2(dy, dx);
        if (dist > 4) {
          it.x += (dx / dist) * it.speed * dt;
          it.y += (dy / dist) * it.speed * dt;
        }
        if (it.cooldown <= 0) it.state = "patrol";
      }
    }

    state.drones = state.drones.filter(d => d.alive);
    for (const e of state.explosions) e.life += dt;
    state.explosions = state.explosions.filter(e => e.life < e.maxLife);

    if (state.hadFactory && state.factories.length === 0 && state.money < COSTS.factory) {
      state.gameOver = true;
      finalScoreEl.textContent = `Заработано всего: ${Math.floor(state.totalEarned)} • Волна: ${state.wave}`;
      overlayEl.classList.add("show");
    }

    updateHud();
    updateBuildButtons();
  }

  // ---------- rendering ----------

  function drawMap() {
    ctx.clearRect(0, 0, W, H);

    // Ukraine strip
    const grad = ctx.createLinearGradient(0, 0, BORDER_X, 0);
    grad.addColorStop(0, "#1a2a4a");
    grad.addColorStop(1, "#22344f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, BORDER_X, H);

    ctx.save();
    ctx.translate(BORDER_X / 2, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("У К Р А И Н А", 0, 0);
    ctx.restore();

    // direction arrows
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    for (let y = 60; y < H; y += 90) {
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(BORDER_X - 30, y);
      ctx.lineTo(BORDER_X - 40, y - 6);
      ctx.moveTo(BORDER_X - 30, y);
      ctx.lineTo(BORDER_X - 40, y + 6);
      ctx.stroke();
    }

    // Russia territory
    const rgrad = ctx.createLinearGradient(BORDER_X, 0, W, 0);
    rgrad.addColorStop(0, "#1c2b20");
    rgrad.addColorStop(1, "#16231b");
    ctx.fillStyle = rgrad;
    ctx.fillRect(BORDER_X, 0, W - BORDER_X, H);

    // subtle grid
    ctx.strokeStyle = "rgba(255,255,255,0.035)";
    ctx.lineWidth = 1;
    for (let x = BORDER_X; x < W; x += 44) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 44) {
      ctx.beginPath(); ctx.moveTo(BORDER_X, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // border line
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(BORDER_X, 0); ctx.lineTo(BORDER_X, H); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Р О С С И Я", BORDER_X + 30, 42);
  }

  function drawFactories() {
    for (const f of state.factories) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.fillStyle = "#3a3f47";
      ctx.fillRect(-20, -12, 40, 24);
      ctx.fillStyle = "#5c636e";
      ctx.fillRect(-20, -16, 40, 6);
      ctx.fillStyle = "#7a828d";
      ctx.fillRect(-6, -30, 8, 18);
      ctx.fillRect(6, -26, 6, 14);
      ctx.fillStyle = "#4ade80";
      ctx.beginPath(); ctx.arc(0, 20, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawPvos() {
    for (const p of state.pvos) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.range, 0, Math.PI * 2);
      ctx.fillStyle = p.fireFx > 0 ? "rgba(255,157,74,0.13)" : "rgba(255,157,74,0.06)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,157,74,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = "#ff9d4a";
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#3a2410";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10, -14); ctx.lineTo(10, -14); ctx.stroke();
      ctx.restore();

      if (p.fireFx > 0) {
        for (const d of state.drones) {
          const dist = Math.hypot(d.x - p.x, d.y - p.y);
          if (dist <= p.range) {
            ctx.strokeStyle = "rgba(255,200,80,0.65)";
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(d.x, d.y); ctx.stroke();
          }
        }
      }
    }
  }

  function drawInterceptors() {
    for (const it of state.interceptors) {
      if (it.state === "patrol") {
        ctx.beginPath();
        ctx.arc(it.homeX, it.homeY, it.detect, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(62,166,255,0.16)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.angle || 0);
      ctx.fillStyle = it.state === "cooldown" ? "#5a7a9a" : "#3ea6ff";
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDrones() {
    for (const d of state.drones) {
      const target = findFactory(d.targetId);
      const angle = target ? Math.atan2(target.y - d.y, target.x - d.x) : 0;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(angle);
      ctx.fillStyle = "#ff5f5f";
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-8, -7);
      ctx.lineTo(-8, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // hp bar
      const w = 22;
      const pct = Math.max(0, d.hp / d.maxHp);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(d.x - w / 2, d.y - 16, w, 4);
      ctx.fillStyle = "#ff5f5f";
      ctx.fillRect(d.x - w / 2, d.y - 16, w * pct, 4);
    }
  }

  function drawExplosions() {
    for (const e of state.explosions) {
      const t = e.life / e.maxLife;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * t, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(e.color, 1 - t);
      ctx.fill();
    }
  }

  function withAlpha(hex, alpha) {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function drawPlacementPreview() {
    if (!selectedMode || mouse.x < 0) return;
    const ok = canPlaceAt(mouse.x, mouse.y) && state.money >= COSTS[selectedMode];
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 18, 0, Math.PI * 2);
    ctx.strokeStyle = ok ? "rgba(74,222,128,0.8)" : "rgba(255,95,95,0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
    if (selectedMode === "pvo") {
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 135, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,157,74,0.4)";
      ctx.stroke();
    } else if (selectedMode === "interceptor") {
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 340, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(62,166,255,0.3)";
      ctx.stroke();
    }
  }

  function render() {
    drawMap();
    drawPvos();
    drawFactories();
    drawInterceptors();
    drawDrones();
    drawExplosions();
    drawPlacementPreview();
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTime) / 1000 || 0);
    lastTime = ts;
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) bannerEl.classList.remove("show");
    }
    if (started && !paused) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ---------- input ----------

  function canvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
  }

  canvas.addEventListener("pointermove", (e) => { mouse = canvasPos(e); });
  canvas.addEventListener("pointerleave", () => { mouse = { x: -9999, y: -9999 }; });
  canvas.addEventListener("pointerdown", (e) => {
    if (!started || paused || state.gameOver || !selectedMode) return;
    const pos = canvasPos(e);
    placeBuilding(selectedMode, pos.x, pos.y);
  });

  for (const key in buildButtons) {
    buildButtons[key].addEventListener("click", () => {
      selectedMode = selectedMode === key ? null : key;
      updateBuildButtons();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { selectedMode = null; updateBuildButtons(); }
  });

  btnPause.addEventListener("click", () => {
    paused = !paused;
    btnPause.textContent = paused ? "▶ Продолжить" : "⏸ Пауза";
  });

  function doRestart() {
    resetGame();
    paused = false;
    btnPause.textContent = "⏸ Пауза";
  }
  btnRestart.addEventListener("click", doRestart);
  btnRestart2.addEventListener("click", doRestart);

  btnStart.addEventListener("click", () => {
    introEl.style.display = "none";
    started = true;
    paused = false;
  });

  resetGame();
  requestAnimationFrame(loop);
})();
