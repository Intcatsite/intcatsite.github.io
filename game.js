(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const BORDER_X = 195; // right edge of the Ukraine strip / left edge of placeable Russia zone
  const TOP_MARGIN = 30;
  const BOTTOM_MARGIN = 30;
  const MIN_BUILD_DIST = 50;

  const COSTS = { factory: 150, npz: 550, azs: 220, shop: 180, pvo: 250, interceptor: 350 };
  const KILL_BOUNTY = 5;
  const GOODS_BOUNTY = 45;
  const FACTORY_PASSIVE = 2;
  const FACTORY_TRUCK_INTERVAL = 5;
  const NPZ_TANKER_INTERVAL = 4;
  const NPZ_PRODUCE_RATE = 12;
  const NPZ_CAP = 700;
  const AZS_CAP = 150;
  const AZS_START_FUEL = 40;
  const TRUCK_FUEL_COST = 6;
  const TANKER_BATCH_MAX = 200;
  const PVO_FUEL_RATE = 3;
  const INTERCEPTOR_FUEL_RATE = 1.5;
  const PVO_SUPPLY_RADIUS = 420;
  const INTERCEPTOR_SUPPLY_RADIUS = 480;
  const FACTORY_SUPPLY_RADIUS = 480;
  const NPZ_SUPPLY_RADIUS = 650;
  const PVO_FUEL_CAP = 150;
  const INTERCEPTOR_FUEL_CAP = 80;
  const RESUPPLY_RATE = 20;

  const DIFFICULTIES = {
    easy: { startMoney: 800, waveInterval: 30, hpBase: 45, hpPerWave: 5, speedBase: 60, speedPerWave: 3, speedCap: 140, spawnBase: 3.6, spawnPerWave: 0.12, spawnMin: 1.2 },
    normal: { startMoney: 600, waveInterval: 25, hpBase: 55, hpPerWave: 7, speedBase: 70, speedPerWave: 4, speedCap: 170, spawnBase: 3.2, spawnPerWave: 0.15, spawnMin: 0.9 },
    hard: { startMoney: 450, waveInterval: 20, hpBase: 65, hpPerWave: 9, speedBase: 80, speedPerWave: 5, speedCap: 200, spawnBase: 2.6, spawnPerWave: 0.18, spawnMin: 0.6 },
  };
  let selectedDifficulty = "normal";

  const moneyEl = document.getElementById("moneyVal");
  const fuelEl = document.getElementById("fuelVal");
  const waveEl = document.getElementById("waveVal");
  const factoriesEl = document.getElementById("factoriesVal");
  const bannerEl = document.getElementById("banner");
  const overlayEl = document.getElementById("overlay");
  const finalScoreEl = document.getElementById("finalScore");
  const introEl = document.getElementById("introOverlay");

  const btnFactory = document.getElementById("btnFactory");
  const btnNpz = document.getElementById("btnNpz");
  const btnAzs = document.getElementById("btnAzs");
  const btnShop = document.getElementById("btnShop");
  const btnPvo = document.getElementById("btnPvo");
  const btnInterceptor = document.getElementById("btnInterceptor");
  const btnPause = document.getElementById("btnPause");
  const btnRestart = document.getElementById("btnRestart");
  const btnRestart2 = document.getElementById("btnRestart2");
  const btnStart = document.getElementById("btnStart");
  const diffButtons = {
    easy: document.getElementById("diffEasy"),
    normal: document.getElementById("diffNormal"),
    hard: document.getElementById("diffHard"),
  };

  const buildButtons = {
    factory: btnFactory, npz: btnNpz, azs: btnAzs, shop: btnShop,
    pvo: btnPvo, interceptor: btnInterceptor,
  };

  let state = null;
  let selectedMode = null;
  let paused = true;
  let started = false;
  let mouse = { x: -9999, y: -9999 };
  let lastTime = 0;
  let bannerTimer = 0;

  // ---------- map: real Russia SVG loaded as an image ----------

  const MAP_SCALE = (W - BORDER_X) / 1650; // russia-map.svg viewBox is 1650x1000
  const mapImg = new Image();
  let mapReady = false;
  mapImg.onload = () => { mapReady = true; };
  mapImg.src = "russia-map.svg";

  const FRONT_LABELS = [
    { name: "Брянская обл.", x: 92, y: 573 },
    { name: "Курская обл.", x: 100, y: 618 },
    { name: "Белгородская обл.", x: 95, y: 652 },
    { name: "Воронежская обл.", x: 135, y: 665 },
    { name: "Ростовская обл.", x: 95, y: 745 },
    { name: "Краснодарский край", x: 35, y: 765 },
    { name: "Калининградская обл.", x: 25, y: 417 },
    { name: "Сахалин", x: 1500, y: 660 },
  ];

  function drawMap() {
    ctx.clearRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, 0, BORDER_X, 0);
    grad.addColorStop(0, "#1a2a4a");
    grad.addColorStop(1, "#22344f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, BORDER_X, H);

    ctx.save();
    ctx.translate(BORDER_X / 2, H / 2 + 40);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("У К Р А И Н А", 0, 0);
    ctx.restore();

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

    ctx.fillStyle = "#0d140f";
    ctx.fillRect(BORDER_X, 0, W - BORDER_X, H);

    if (mapReady) {
      ctx.drawImage(mapImg, BORDER_X, 0, W - BORDER_X, H);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Загрузка карты…", BORDER_X + (W - BORDER_X) / 2, H / 2);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(BORDER_X, 0); ctx.lineTo(BORDER_X, H); ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = "center";
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = "rgba(255,210,160,0.95)";
    for (const r of FRONT_LABELS) {
      ctx.fillText(r.name, BORDER_X + r.x * MAP_SCALE, r.y * MAP_SCALE);
    }

    ctx.font = "bold 26px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.textAlign = "left";
    ctx.fillText("Р О С С И Я", BORDER_X + 24, H - 20);
  }

  // ---------- state ----------

  function freshState() {
    const diff = DIFFICULTIES[selectedDifficulty];
    return {
      diff,
      money: diff.startMoney,
      totalEarned: diff.startMoney,
      wave: 1,
      waveTimer: diff.waveInterval,
      spawnTimer: 2,
      hadEconomy: false,
      gameOver: false,
      nextId: 1,
      factories: [], npzs: [], azsList: [], shops: [],
      pvos: [], interceptors: [],
      drones: [], vehicles: [], explosions: [], popups: [],
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

  function economyCount() {
    return state.factories.length + state.npzs.length + state.azsList.length + state.shops.length;
  }

  function updateHud() {
    moneyEl.textContent = Math.floor(state.money);
    waveEl.textContent = state.wave;
    factoriesEl.textContent = economyCount();
    let fuelCur = 0, fuelCap = 0;
    for (const a of state.azsList) { fuelCur += a.fuel; fuelCap += a.cap; }
    fuelEl.textContent = `${Math.floor(fuelCur)}/${fuelCap}`;
    fuelEl.classList.toggle("low", fuelCap > 0 && fuelCur / fuelCap < 0.15);
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
    const all = [
      ...state.factories, ...state.npzs, ...state.azsList, ...state.shops,
      ...state.pvos, ...state.interceptors,
    ];
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
      state.factories.push({ id, x, y, income: FACTORY_PASSIVE, radius: 22, truckCd: Math.random() * 2 });
      state.hadEconomy = true;
    } else if (mode === "npz") {
      state.npzs.push({ id, x, y, radius: 26, fuel: 0, cap: NPZ_CAP, tankerCd: Math.random() * 2 });
      state.hadEconomy = true;
    } else if (mode === "azs") {
      state.azsList.push({ id, x, y, radius: 18, fuel: AZS_START_FUEL, cap: AZS_CAP });
      state.hadEconomy = true;
    } else if (mode === "shop") {
      state.shops.push({ id, x, y, radius: 18 });
      state.hadEconomy = true;
    } else if (mode === "pvo") {
      state.pvos.push({
        id, x, y, range: 115, dps: 72, fireFx: 0, online: true,
        fuel: PVO_FUEL_CAP, fuelCap: PVO_FUEL_CAP,
      });
    } else if (mode === "interceptor") {
      state.interceptors.push({
        id, x, y, homeX: x, homeY: y,
        speed: 230, detect: 340, killRange: 24,
        state: "patrol", targetId: null, cooldown: 0,
        angle: 0, patrolT: Math.random() * Math.PI * 2, online: true,
        fuel: INTERCEPTOR_FUEL_CAP, fuelCap: INTERCEPTOR_FUEL_CAP,
      });
    }
    updateHud();
    return true;
  }

  // ---------- lookups ----------

  function arrByKind(kind) {
    if (kind === "factory") return state.factories;
    if (kind === "npz") return state.npzs;
    if (kind === "azs") return state.azsList;
    if (kind === "shop") return state.shops;
    return [];
  }
  function findBuilding(kind, id) {
    return arrByKind(kind).find(b => b.id === id) || null;
  }
  function removeBuilding(kind, id) {
    const arr = arrByKind(kind);
    const i = arr.findIndex(b => b.id === id);
    if (i >= 0) arr.splice(i, 1);
  }
  function findDrone(id) {
    return state.drones.find(d => d.id === id && d.alive) || null;
  }
  function nearestFuelAzs(x, y, radius) {
    let best = null, bestDist = Infinity;
    for (const a of state.azsList) {
      if (a.fuel <= 0.001) continue;
      const dist = Math.hypot(a.x - x, a.y - y);
      if (dist <= radius && dist < bestDist) { best = a; bestDist = dist; }
    }
    return best;
  }
  function nearestAzsNeedingFuel(x, y, radius) {
    let best = null, bestDist = Infinity;
    for (const a of state.azsList) {
      if (a.cap - a.fuel <= 5) continue;
      const dist = Math.hypot(a.x - x, a.y - y);
      if (dist <= radius && dist < bestDist) { best = a; bestDist = dist; }
    }
    return best;
  }
  function weightedPick(candidates) {
    const total = candidates.reduce((s, c) => s + c.w, 0);
    let r = Math.random() * total;
    for (const c of candidates) {
      if (r < c.w) return c;
      r -= c.w;
    }
    return candidates[candidates.length - 1];
  }

  function addExplosion(x, y, size, color) {
    state.explosions.push({ x, y, life: 0, maxLife: 0.5, size, color });
  }

  function addPopup(x, y, text, color) {
    state.popups.push({ x, y, text, color, life: 0, maxLife: 0.9 });
  }

  function destroyDrone(drone) {
    drone.alive = false;
    state.money += KILL_BOUNTY;
    state.totalEarned += KILL_BOUNTY;
    addExplosion(drone.x, drone.y, 26, "#ffd54a");
    addPopup(drone.x, drone.y - 10, `+${KILL_BOUNTY}`, "#ffd54a");
  }

  // ---------- spawning ----------

  function spawnDrone() {
    const y = TOP_MARGIN + 40 + Math.random() * (H - TOP_MARGIN - BOTTOM_MARGIN - 80);
    const x = 30;
    const wave = state.wave;
    const diff = state.diff;
    const speed = Math.min(diff.speedBase + wave * diff.speedPerWave, diff.speedCap);
    const hp = diff.hpBase + wave * diff.hpPerWave;

    const candidates = [];
    for (const b of state.npzs) candidates.push({ kind: "npz", b, w: 5 });
    for (const b of state.azsList) candidates.push({ kind: "azs", b, w: 3 });
    for (const b of state.factories) candidates.push({ kind: "factory", b, w: 1 });
    for (const b of state.shops) candidates.push({ kind: "shop", b, w: 1 });
    if (!candidates.length) return;
    const pick = weightedPick(candidates);

    state.drones.push({
      id: state.nextId++, x, y, speed, hp, maxHp: hp,
      targetKind: pick.kind, targetId: pick.b.id, claimedBy: null, alive: true,
    });
  }

  function spawnVehicle(kind, from, to, payload) {
    state.vehicles.push({
      id: state.nextId++, kind,
      x: from.x, y: from.y,
      fromX: from.x, fromY: from.y, toX: to.x, toY: to.y,
      angle: Math.atan2(to.y - from.y, to.x - from.x),
      speed: kind === "tanker" ? 140 : 160,
      payload, alive: true, destKind: to.kind, destId: to.id,
    });
  }

  // ---------- update ----------

  function update(dt) {
    if (state.gameOver) return;

    for (const f of state.factories) {
      state.money += f.income * dt;
      state.totalEarned += f.income * dt;
    }
    for (const n of state.npzs) {
      n.fuel = Math.min(n.cap, n.fuel + NPZ_PRODUCE_RATE * dt);
    }

    state.waveTimer -= dt;
    if (state.waveTimer <= 0) {
      state.wave += 1;
      state.waveTimer = state.diff.waveInterval;
      showBanner(`Волна ${state.wave}!`);
    }

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      if (economyCount() > 0) {
        spawnDrone();
        const diff = state.diff;
        const base = Math.max(diff.spawnMin, diff.spawnBase - state.wave * diff.spawnPerWave);
        state.spawnTimer = base * (0.7 + Math.random() * 0.6);
      } else {
        state.spawnTimer = 0.5;
      }
    }

    // NPZ -> AZS tanker dispatch
    for (const n of state.npzs) {
      n.tankerCd -= dt;
      if (n.tankerCd <= 0) {
        const azs = n.fuel > 10 ? nearestAzsNeedingFuel(n.x, n.y, NPZ_SUPPLY_RADIUS) : null;
        if (azs) {
          const amount = Math.min(TANKER_BATCH_MAX, n.fuel, azs.cap - azs.fuel);
          n.fuel -= amount;
          spawnVehicle("tanker", n, { x: azs.x, y: azs.y, kind: "azs", id: azs.id }, amount);
          n.tankerCd = NPZ_TANKER_INTERVAL * (0.85 + Math.random() * 0.3);
        } else {
          n.tankerCd = 2;
        }
      }
    }

    // Factory -> Shop goods truck dispatch
    for (const f of state.factories) {
      f.truckCd -= dt;
      if (f.truckCd <= 0) {
        const shop = state.shops[Math.floor(Math.random() * state.shops.length)];
        const azs = shop ? nearestFuelAzs(f.x, f.y, FACTORY_SUPPLY_RADIUS) : null;
        if (shop && azs) {
          azs.fuel -= TRUCK_FUEL_COST;
          spawnVehicle("goods", f, { x: shop.x, y: shop.y, kind: "shop", id: shop.id }, GOODS_BOUNTY);
          f.truckCd = FACTORY_TRUCK_INTERVAL * (0.85 + Math.random() * 0.3);
        } else {
          f.truckCd = 2;
        }
      }
    }

    // vehicles move
    for (const v of state.vehicles) {
      if (!v.alive) continue;
      const dx = v.toX - v.x, dy = v.toY - v.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 8) {
        if (v.kind === "tanker") {
          const azs = findBuilding("azs", v.destId);
          if (azs) azs.fuel = Math.min(azs.cap, azs.fuel + v.payload);
        } else {
          const shop = findBuilding("shop", v.destId);
          if (shop) {
            state.money += v.payload;
            state.totalEarned += v.payload;
            addExplosion(shop.x, shop.y, 14, "#4ade80");
          }
        }
        v.alive = false;
        continue;
      }
      v.x += (dx / dist) * v.speed * dt;
      v.y += (dy / dist) * v.speed * dt;
    }
    state.vehicles = state.vehicles.filter(v => v.alive);

    // drones move
    for (const d of state.drones) {
      if (!d.alive) continue;
      const target = findBuilding(d.targetKind, d.targetId);
      if (!target) { d.alive = false; continue; }
      const dx = target.x - d.x, dy = target.y - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < target.radius + 6) {
        d.alive = false;
        addExplosion(target.x, target.y, target.kind === "npz" ? 60 : 46, "#ff5f5f");
        removeBuilding(d.targetKind, target.id);
        updateHud();
        continue;
      }
      d.x += (dx / dist) * d.speed * dt;
      d.y += (dy / dist) * d.speed * dt;
    }

    // PVO fire (drains its own tank; tank is resupplied by nearby AZS)
    for (const p of state.pvos) {
      p.fireFx = Math.max(0, p.fireFx - dt);

      const supplier = nearestFuelAzs(p.x, p.y, PVO_SUPPLY_RADIUS);
      if (supplier && p.fuel < p.fuelCap) {
        const amount = Math.min(RESUPPLY_RATE * dt, p.fuelCap - p.fuel, supplier.fuel);
        p.fuel += amount;
        supplier.fuel -= amount;
      }

      let anyInRange = false;
      for (const d of state.drones) {
        if (!d.alive) continue;
        if (Math.hypot(d.x - p.x, d.y - p.y) <= p.range) { anyInRange = true; break; }
      }
      if (!anyInRange) { p.online = p.fuel > 0; continue; }
      if (p.fuel <= 0) { p.online = false; continue; }
      p.online = true;
      const want = PVO_FUEL_RATE * dt;
      const got = Math.min(p.fuel, want);
      p.fuel -= got;
      const scale = want > 0 ? got / want : 1;
      let firing = false;
      for (const d of state.drones) {
        if (!d.alive) continue;
        const dist = Math.hypot(d.x - p.x, d.y - p.y);
        if (dist <= p.range) {
          d.hp -= p.dps * dt * scale;
          firing = true;
          if (d.hp <= 0) destroyDrone(d);
        }
      }
      if (firing) p.fireFx = 0.1;
    }

    // interceptors (drain their own tank; tank is resupplied by nearby AZS)
    for (const it of state.interceptors) {
      const supplier = nearestFuelAzs(it.x, it.y, INTERCEPTOR_SUPPLY_RADIUS);
      if (supplier && it.fuel < it.fuelCap) {
        const amount = Math.min(RESUPPLY_RATE * dt, it.fuelCap - it.fuel, supplier.fuel);
        it.fuel += amount;
        supplier.fuel -= amount;
      }

      if (it.fuel <= 0) {
        it.online = false;
        if (it.state === "engage" && it.targetId) {
          const t = findDrone(it.targetId);
          if (t) t.claimedBy = null;
        }
        continue;
      }
      it.online = true;
      it.fuel = Math.max(0, it.fuel - INTERCEPTOR_FUEL_RATE * dt);

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
            destroyDrone(target);
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
    for (const p of state.popups) { p.life += dt; p.y -= dt * 26; }
    state.popups = state.popups.filter(p => p.life < p.maxLife);

    if (state.hadEconomy && economyCount() === 0 && state.money < COSTS.factory) {
      state.gameOver = true;
      finalScoreEl.textContent = `Заработано всего: ${Math.floor(state.totalEarned)} • Волна: ${state.wave}`;
      overlayEl.classList.add("show");
    }

    updateHud();
    updateBuildButtons();
  }

  // ---------- rendering: buildings ----------

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

  function drawNpzs() {
    for (const n of state.npzs) {
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.fillStyle = "rgba(255,157,74,0.06)";
      ctx.beginPath(); ctx.arc(0, 0, NPZ_SUPPLY_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4a5560";
      ctx.fillRect(-30, -10, 60, 22);
      ctx.fillStyle = "#8a95a0";
      for (const tx of [-22, -4, 14]) {
        ctx.beginPath(); ctx.arc(tx, -14, 8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = "#2a323a";
      ctx.lineWidth = 1;
      for (const tx of [-22, -4, 14]) {
        ctx.beginPath(); ctx.arc(tx, -14, 8, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = "#ff9d4a";
      ctx.fillRect(24, -34, 3, 24);
      ctx.beginPath(); ctx.arc(25, -36, 4, 0, Math.PI * 2); ctx.fill();
      const pct = Math.max(0, n.fuel / n.cap);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(-26, 16, 52, 5);
      ctx.fillStyle = "#ff9d4a";
      ctx.fillRect(-26, 16, 52 * pct, 5);
      ctx.restore();
    }
  }

  function drawAzsList() {
    for (const a of state.azsList) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.fillStyle = "#3a3f47";
      ctx.fillRect(-14, -8, 28, 16);
      ctx.fillStyle = "#ff9d4a";
      ctx.fillRect(-14, -14, 28, 5);
      ctx.strokeStyle = "#2a2e35";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-16, -18); ctx.lineTo(16, -18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-16, -18); ctx.lineTo(-16, -8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, -18); ctx.lineTo(16, -8); ctx.stroke();
      const pct = Math.max(0, a.fuel / a.cap);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(-16, 12, 32, 5);
      ctx.fillStyle = pct < 0.15 ? "#ff5f5f" : "#ff9d4a";
      ctx.fillRect(-16, 12, 32 * pct, 5);
      ctx.restore();
    }
  }

  function drawShops() {
    for (const s of state.shops) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = "#4a5a6a";
      ctx.fillRect(-18, -10, 36, 20);
      ctx.fillStyle = "#3ea6ff";
      ctx.fillRect(-20, -16, 40, 7);
      ctx.fillStyle = "#dbe4ee";
      ctx.fillRect(-6, -2, 12, 12);
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
      ctx.fillStyle = p.online ? "#ff9d4a" : "#5a5f66";
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#3a2410";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10, -14); ctx.lineTo(10, -14); ctx.stroke();
      ctx.restore();

      const fp = Math.max(0, p.fuel / p.fuelCap);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(p.x - 14, p.y + 14, 28, 4);
      ctx.fillStyle = fp < 0.2 ? "#ff5f5f" : "#ffd54a";
      ctx.fillRect(p.x - 14, p.y + 14, 28 * fp, 4);

      if (!p.online) drawNoFuelBadge(p.x, p.y - 26);

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
      ctx.fillStyle = !it.online ? "#4a4f56" : (it.state === "cooldown" ? "#5a7a9a" : "#3ea6ff");
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, -8);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const fi = Math.max(0, it.fuel / it.fuelCap);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(it.x - 12, it.y + 12, 24, 3);
      ctx.fillStyle = fi < 0.2 ? "#ff5f5f" : "#3ea6ff";
      ctx.fillRect(it.x - 12, it.y + 12, 24 * fi, 3);

      if (!it.online) drawNoFuelBadge(it.x, it.y - 20);
    }
  }

  function drawNoFuelBadge(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(20,10,10,0.85)";
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ff5f5f";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.stroke();
    ctx.restore();
  }

  function drawVehicles() {
    for (const v of state.vehicles) {
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.angle);
      if (v.kind === "tanker") {
        ctx.fillStyle = "#4a4f56";
        ctx.fillRect(-9, -3, 8, 6);
        ctx.fillStyle = "#ff9d4a";
        ctx.beginPath(); ctx.ellipse(2, 0, 8, 4.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#3a2410"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(2, 0, 8, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = "#dbe4ee";
        ctx.fillRect(-9, -4, 12, 8);
        ctx.fillStyle = "#3ea6ff";
        ctx.fillRect(3, -4, 6, 8);
      }
      ctx.restore();
    }
  }

  function drawDrones() {
    for (const d of state.drones) {
      const target = findBuilding(d.targetKind, d.targetId);
      const angle = target ? Math.atan2(target.y - d.y, target.x - d.x) : 0;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(angle);
      ctx.fillStyle = "#7a7358";
      ctx.beginPath();
      ctx.moveTo(17, 0);
      ctx.lineTo(3, -4);
      ctx.lineTo(-7, -13);
      ctx.lineTo(-13, -9);
      ctx.lineTo(-6, -2);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-6, 2);
      ctx.lineTo(-13, 9);
      ctx.lineTo(-7, 13);
      ctx.lineTo(3, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#ff5f5f";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      const w = 22;
      const pct = Math.max(0, d.hp / d.maxHp);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(d.x - w / 2, d.y - 20, w, 4);
      ctx.fillStyle = "#ff5f5f";
      ctx.fillRect(d.x - w / 2, d.y - 20, w * pct, 4);
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
    const supplyByMode = {
      pvo: PVO_SUPPLY_RADIUS, interceptor: INTERCEPTOR_SUPPLY_RADIUS,
      factory: FACTORY_SUPPLY_RADIUS, npz: NPZ_SUPPLY_RADIUS,
    };
    if (selectedMode === "pvo") {
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 115, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,157,74,0.4)";
      ctx.stroke();
    } else if (selectedMode === "interceptor") {
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 340, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(62,166,255,0.3)";
      ctx.stroke();
    }
    if (supplyByMode[selectedMode]) {
      ctx.beginPath();
      ctx.setLineDash([6, 6]);
      ctx.arc(mouse.x, mouse.y, supplyByMode[selectedMode], 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,213,74,0.35)";
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawPopups() {
    ctx.textAlign = "center";
    ctx.font = "bold 14px sans-serif";
    for (const p of state.popups) {
      const t = p.life / p.maxLife;
      ctx.fillStyle = withAlpha(p.color, 1 - t);
      ctx.fillText(p.text, p.x, p.y);
    }
  }

  function render() {
    drawMap();
    drawPvos();
    drawNpzs();
    drawAzsList();
    drawShops();
    drawFactories();
    drawVehicles();
    drawInterceptors();
    drawDrones();
    drawExplosions();
    drawPopups();
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
    resetGame();
    started = true;
    paused = false;
  });

  for (const key in diffButtons) {
    diffButtons[key].addEventListener("click", () => {
      selectedDifficulty = key;
      for (const k in diffButtons) diffButtons[k].classList.toggle("selected", k === key);
    });
  }

  resetGame();
  requestAnimationFrame(loop);
})();
