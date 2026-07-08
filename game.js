class Game {
  constructor(config) {
    this.config = config;
    this.state = 'waiting';   // waiting | playing | gameover | tutorial
    this.resources = {};
    this.buildings = [];
    this.mice = [];
    this.farmPlots = [];
    this.farmhouse = null;
    this.mouseHoles = [];        // 內部洞（可被破壞）
    this.outerHoles = [];        // 外圈洞（不可破壞）
    this.selectedBuildingType = null;
    this.playerData = { gold: 0, purchasedUpgrades: [] };

    this.elapsedTime = 0;
    this.killCount = 0;
    this.farmingCounts = { hay: 0, corn: 0 }; // 種植等級

    this.timerInterval = null;
    this.outerHoleSpawnInterval = null;
    this.innerHoleSpawnInterval = null;
    this.accidentInterval = null;
    this.gameLoopId = null;
    this.lastTimestamp = 0;

    this.gridMap = Array(9).fill().map(() => Array(9).fill(null));
    this.cellSize = this.config.grid.cellSize;   // 48

    this.loadPlayerData();
    this.initUI();
    this.renderInitialBoard();
    this.showTutorialIfNeeded();   // 檢查是否需要顯示教學
  }

  // ========== 存檔 ==========
  loadPlayerData() {
    const saved = localStorage.getItem('farmTowerSave');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.playerData.gold = data.gold || 0;
        this.playerData.purchasedUpgrades = data.purchasedUpgrades || [];
        this.farmingCounts = data.farmingCounts || { hay: 0, corn: 0 };
      } catch (e) {}
    }
  }
  savePlayerData() {
    localStorage.setItem('farmTowerSave', JSON.stringify({
      gold: this.playerData.gold,
      purchasedUpgrades: this.playerData.purchasedUpgrades,
      farmingCounts: this.farmingCounts
    }));
    this.updateResourceDisplay();
  }

  // ========== 加成計算 ==========
  getGlobalAttackBonus() {
    let bonus = 0;
    for (let id of this.playerData.purchasedUpgrades) {
      const card = this.config.shopCards.find(c => c.id === id && c.type === 'upgrade');
      if (card?.effect.globalAttack) bonus += card.effect.globalAttack;
    }
    return bonus;
  }
  getStartResourceBonus() {
    let bonus = { hay: 0, corn: 0 };
    for (let id of this.playerData.purchasedUpgrades) {
      const card = this.config.shopCards.find(c => c.id === id && c.type === 'upgrade');
      if (card?.effect.bonusStart) {
        bonus.hay += card.effect.bonusStart.hay || 0;
        bonus.corn += card.effect.bonusStart.corn || 0;
      }
    }
    return bonus;
  }

  // ========== UI 初始化 ==========
  initUI() {
    this.boardEl = document.getElementById('game-board');
    this.timerEl = document.getElementById('timer');
    this.msgEl = document.getElementById('message');
    this.buildButtonsEl = document.getElementById('build-buttons');
    this.resourceButtonsEl = document.getElementById('resource-buttons');
    this.btnShop = document.getElementById('btn-shop');
    this.btnStart = document.getElementById('btn-start');
    this.shopModal = document.getElementById('shop-modal');
    this.resultModal = document.getElementById('result-modal');

    this.btnShop.addEventListener('click', () => this.openShop());
    document.getElementById('btn-close-shop').addEventListener('click', () => this.closeShop());
    this.btnStart.addEventListener('click', () => this.startGame());
    document.getElementById('btn-play-again').addEventListener('click', () => this.restartGame());
    this.boardEl.addEventListener('click', (e) => this.onBoardClick(e));

    // 教學彈窗按鈕
    const btnTutorialOk = document.getElementById('btn-tutorial-ok');
    if (btnTutorialOk) {
      btnTutorialOk.addEventListener('click', () => this.closeTutorial());
    }

    this.createBuildButtons();
    this.createFarmingButtons();
    this.updateResourceDisplay();
    this.updateShopItems();
  }

  // ========== 右側按鈕：建造防禦（含提示） ==========
  createBuildButtons() {
    this.buildButtonsEl.innerHTML = '';
    for (let key in this.config.buildings) {
      const b = this.config.buildings[key];
      const btn = document.createElement('button');
      btn.textContent = `${b.emoji} ${b.name}`;
      btn.dataset.buildingId = b.id;

      let tip = `${b.name}`;
      if (b.attack > 0) {
        tip += `\n攻擊力：${b.attack}`;
        tip += `\n攻擊速度：${b.attackSpeed}/秒`;
      }
      if (b.range) tip += `\n攻擊範圍：${b.range} px`;
      let costStr = [];
      for (let res in b.cost) costStr.push(`${this.config.resources[res].emoji} ${b.cost[res]}`);
      tip += `\n消耗：${costStr.join('，')}`;
      if (b.special) tip += `\n特殊：${b.special}`;
      if (b.effect === 'globalAttack+1' || b.effect === 'globalAttack+2') {
        tip += `\n效果：全體攻擊 +${b.effect.slice(-1)}`;
      }
      if (b.unlocks) {
        const unlocked = this.config.buildings[b.unlocks];
        tip += `\n解鎖：${unlocked ? unlocked.name : b.unlocks}`;
      }
      if (b.unlockRequirement) {
        const req = this.config.buildings[b.unlockRequirement];
        tip += `\n前置建築：${req ? req.name : b.unlockRequirement}`;
      }
      btn.title = tip;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectBuilding(b.id);
      });
      this.buildButtonsEl.appendChild(btn);
    }
  }

  // ========== 右側按鈕：種植作物 ==========
  createFarmingButtons() {
    this.resourceButtonsEl.innerHTML = '';
    const farming = this.config.farming;
    for (let key in farming) {
      const farm = farming[key];
      const btn = document.createElement('button');
      const level = this.farmingCounts[key] || 0;
      btn.textContent = `${farm.emoji} ${farm.name} (Lv.${level})`;
      btn.title = `花費 ${farm.cost} 金幣\n效果：每秒 +${farm.perSecond} ${this.config.resources[farm.resource].name}${farm.extraGold ? `，+${farm.extraGold} 金幣` : ''}`;
      btn.addEventListener('click', () => this.buyFarming(key));
      this.resourceButtonsEl.appendChild(btn);
    }
  }

  buyFarming(type) {
    if (this.state !== 'playing') return;
    const farm = this.config.farming[type];
    if (this.playerData.gold < farm.cost) {
      this.showMessage('金幣不足');
      return;
    }
    this.playerData.gold -= farm.cost;
    this.farmingCounts[type] = (this.farmingCounts[type] || 0) + 1;
    this.savePlayerData();
    this.createFarmingButtons();
    this.showMessage(`購買了 ${farm.name}！現在每秒 +${farm.perSecond * this.farmingCounts[type]} ${this.config.resources[farm.resource].name}`);
  }

  // 每秒生產 (由計時器觸發)
  produceFarming() {
    let produced = false;
    if (this.farmingCounts.hay > 0) {
      this.resources.hay += this.farmingCounts.hay * this.config.farming.hay.perSecond;
      produced = true;
    }
    if (this.farmingCounts.corn > 0) {
      this.resources.corn += this.farmingCounts.corn * this.config.farming.corn.perSecond;
      this.playerData.gold += this.farmingCounts.corn * (this.config.farming.corn.extraGold || 1);
      produced = true;
    }
    if (produced) {
      this.updateResourceDisplay();
    }
  }

  selectBuilding(id) {
    if (this.state !== 'playing') return;
    this.selectedBuildingType = id;
    this.buildButtonsEl.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
    const activeBtn = this.buildButtonsEl.querySelector(`[data-building-id="${id}"]`);
    if (activeBtn) activeBtn.classList.add('selected');
    this.showMessage(`已選擇 ${this.config.buildings[id].name}，點擊空地建造`);
  }

  // ========== 初始棋盤繪製 ==========
  renderInitialBoard() {
    const level = this.config.infiniteLevel;
    this.resources = { ...level.initialResources };
    const bonus = this.getStartResourceBonus();
    this.resources.hay += bonus.hay;
    this.resources.corn += bonus.corn;

    this.clearBoard();
    this.buildings = [];
    this.mice = [];
    this.mouseHoles = [];
    this.outerHoles = [];
    this.farmhouse = null;
    this.selectedBuildingType = null;
    this.gridMap = Array(9).fill().map(() => Array(9).fill(null));

    // 繪製農田
    this.farmPlots = level.farmPlots.map(p => ({ ...p }));
    for (let plot of this.farmPlots) {
      this.gridMap[plot.row][plot.col] = 'farmplot';
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.left = plot.col * this.cellSize + 'px';
      cell.style.top = plot.row * this.cellSize + 'px';
      cell.textContent = this.config.resources[plot.resource].emoji;
      this.boardEl.appendChild(cell);
    }

    // 繪製農舍
    const fhCfg = level.farmhouse;
    this.farmhouse = {
      row: fhCfg.row,
      col: fhCfg.col,
      hp: this.config.farmhouse.hp,
      maxHp: this.config.farmhouse.hp,
      element: null
    };
    this.gridMap[fhCfg.row][fhCfg.col] = 'farmhouse';
    const el = document.createElement('div');
    el.className = 'building farmhouse';
    el.style.left = fhCfg.col * this.cellSize + 'px';
    el.style.top = fhCfg.row * this.cellSize + 'px';
    el.innerHTML = `<div class="farmhouse-emoji">${this.config.farmhouse.emoji}</div>
                    <div class="hp-bar-container"><div class="hp-bar-fill" style="width:100%"></div></div>`;
    this.boardEl.appendChild(el);
    this.farmhouse.element = el;

    this.updateResourceDisplay();
    this.updateTimerDisplay();
    this.showMessage('準備好就按下「開始遊戲」！');
    this.resultModal.classList.add('hidden');
  }

  // ========== 開始 / 重新開始 ==========
  startGame() {
    if (this.state !== 'waiting') return;   // 只有 waiting 狀態才能開始
    this.state = 'playing';
    this.elapsedTime = 0;
    this.killCount = 0;
    this.startTimers();

    this.btnStart.textContent = '重新開始';
    this.btnStart.removeEventListener('click', this.startGame);
    this.btnStart.addEventListener('click', () => this.restartGame());

    this.showMessage('保護農舍！老鼠會破壞一切！');
  }

  clearBoard() {
    this.boardEl.querySelectorAll('.cell,.building,.mouse,.mouse-hole').forEach(e => e.remove());
  }

  updateFarmhouseHP() {
    if (!this.farmhouse?.element) return;
    const percent = Math.max(0, (this.farmhouse.hp / this.farmhouse.maxHp) * 100);
    const fill = this.farmhouse.element.querySelector('.hp-bar-fill');
    if (fill) fill.style.width = percent + '%';
  }

  isCellBuildable(row, col) {
    if (row < 0 || row >= 9 || col < 0 || col >= 9) return false;
    if (row === 0 || row === 8 || col === 0 || col === 8) return false;
    if (this.gridMap[row][col] !== null) return false;
    return true;
  }

  onBoardClick(event) {
    if (this.state !== 'playing' || !this.selectedBuildingType) return;
    const rect = this.boardEl.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (!this.isCellBuildable(row, col)) {
      this.showMessage('此格無法建造');
      return;
    }
    this.tryBuild(this.selectedBuildingType, row, col);
  }

  tryBuild(buildingId, row, col) {
    const def = this.config.buildings[buildingId];
    if (!def) return;
    if (def.unlockRequirement) {
      if (!this.buildings.some(b => b.type === def.unlockRequirement)) {
        this.showMessage(`需要先建造 ${this.config.buildings[def.unlockRequirement].name}`);
        return;
      }
    }
    for (let res in def.cost) {
      if ((this.resources[res] || 0) < def.cost[res]) {
        this.showMessage(`${this.config.resources[res].name}不足`);
        return;
      }
    }
    for (let res in def.cost) this.resources[res] -= def.cost[res];

    const building = {
      type: buildingId,
      row, col,
      hp: def.hp,
      maxHp: def.hp,
      lastAttackTime: 0,
      element: null
    };
    this.buildings.push(building);
    this.gridMap[row][col] = 'building';
    this.placeBuildingElement(building);
    this.updateResourceDisplay();
    this.showMessage(`建造了 ${def.name}`);
  }

  placeBuildingElement(building) {
    const def = this.config.buildings[building.type];
    const el = document.createElement('div');
    el.className = 'building';
    el.style.left = building.col * this.cellSize + 'px';
    el.style.top = building.row * this.cellSize + 'px';
    el.textContent = def.emoji;

    if (def.attack > 0) {
      const rangeEl = document.createElement('div');
      rangeEl.className = 'range-indicator';
      rangeEl.style.width = def.range * 2 + 'px';
      rangeEl.style.height = def.range * 2 + 'px';
      el.appendChild(rangeEl);
    }

    this.boardEl.appendChild(el);
    building.element = el;
  }

  // ========== 計時器與生成 ==========
  startTimers() {
    this.timerInterval = setInterval(() => {
      this.elapsedTime++;
      this.updateTimerDisplay();
      this.produceFarming();
    }, 1000);

    this.startOuterHoleSpawn();
    this.startInnerHoleSpawning();
    this.accidentInterval = setInterval(() => this.checkAccidentalDamage(), 10000);
    this.lastTimestamp = performance.now();
    this.gameLoopId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  stopAllTimers() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.outerHoleSpawnInterval) clearInterval(this.outerHoleSpawnInterval);
    if (this.innerHoleSpawnInterval) clearInterval(this.innerHoleSpawnInterval);
    if (this.accidentInterval) clearInterval(this.accidentInterval);
    if (this.gameLoopId) cancelAnimationFrame(this.gameLoopId);
    for (let hole of this.outerHoles) if (hole.intervalId) clearInterval(hole.intervalId);
    for (let hole of this.mouseHoles) if (hole.intervalId) clearInterval(hole.intervalId);
    this.timerInterval = null;
    this.outerHoleSpawnInterval = null;
    this.innerHoleSpawnInterval = null;
    this.accidentInterval = null;
    this.gameLoopId = null;
  }

  // --- 外圈洞生成 (不可破壞) ---
  startOuterHoleSpawn() {
    if (this.outerHoleSpawnInterval) clearInterval(this.outerHoleSpawnInterval);
    const interval = this.config.infiniteLevel.outerHoleSpawnInterval * 1000;
    this.outerHoleSpawnInterval = setInterval(() => {
      if (this.state !== 'playing') return;
      this.trySpawnOuterHole();
    }, interval);
  }

  trySpawnOuterHole() {
    const max = this.config.infiniteLevel.outerHoleMax;
    if (this.outerHoles.length >= max) return;

    const candidates = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (r === 0 || r === 8 || c === 0 || c === 8) {
          if (!this.outerHoles.some(h => h.row === r && h.col === c)) {
            candidates.push({ row: r, col: c });
          }
        }
      }
    }
    if (candidates.length === 0) return;
    const pos = candidates[Math.floor(Math.random() * candidates.length)];
    this.createOuterHole(pos.row, pos.col);
  }

  createOuterHole(row, col) {
    const holeCfg = this.config.mouseHole;
    const hole = { row, col, intervalId: null, element: null };
    this.outerHoles.push(hole);

    const el = document.createElement('div');
    el.className = 'mouse-hole outer-hole';
    el.style.left = col * this.cellSize + 'px';
    el.style.top = row * this.cellSize + 'px';
    el.textContent = holeCfg.emoji;
    this.boardEl.appendChild(el);
    hole.element = el;

    hole.intervalId = setInterval(() => {
      if (this.state !== 'playing') return;
      this.spawnMouseAt(row, col, 'normal');
    }, holeCfg.spawnInterval * 1000);
  }

  // --- 內部洞生成 (僅當外圈洞滿) ---
  startInnerHoleSpawning() {
    if (this.innerHoleSpawnInterval) clearInterval(this.innerHoleSpawnInterval);
    const interval = this.config.infiniteLevel.innerHoleSpawnInterval * 1000;
    this.innerHoleSpawnInterval = setInterval(() => {
      if (this.state !== 'playing') return;
      this.trySpawnInnerHole();
    }, interval);
  }

  trySpawnInnerHole() {
    if (this.outerHoles.length < this.config.infiniteLevel.outerHoleMax) return;
    const max = this.config.infiniteLevel.innerHoleMax;
    if (this.mouseHoles.length >= max) return;

    const empty = [];
    for (let r = 1; r <= 7; r++) {
      for (let c = 1; c <= 7; c++) {
        if (this.gridMap[r][c] === null && !this.mouseHoles.some(h => h.row === r && h.col === c)) {
          empty.push({ row: r, col: c });
        }
      }
    }
    if (empty.length === 0) return;
    const pos = empty[Math.floor(Math.random() * empty.length)];
    this.createInnerHole(pos.row, pos.col);
  }

  createInnerHole(row, col) {
    const holeCfg = this.config.mouseHole;
    const hole = { row, col, hp: holeCfg.hp, maxHp: holeCfg.hp, element: null };
    this.mouseHoles.push(hole);
    this.gridMap[row][col] = 'mousehole';
    const el = document.createElement('div');
    el.className = 'mouse-hole';
    el.style.left = col * this.cellSize + 'px';
    el.style.top = row * this.cellSize + 'px';
    el.textContent = holeCfg.emoji;
    this.boardEl.appendChild(el);
    hole.element = el;

    hole.intervalId = setInterval(() => {
      if (this.state !== 'playing') return;
      if (hole.hp <= 0) { clearInterval(hole.intervalId); return; }
      this.spawnMouseAt(row, col, 'normal');
    }, holeCfg.spawnInterval * 1000);
  }

  removeInnerHole(hole) {
    const idx = this.mouseHoles.indexOf(hole);
    if (idx > -1) {
      clearInterval(hole.intervalId);
      if (hole.element) hole.element.remove();
      if (this.gridMap[hole.row][hole.col] === 'mousehole') this.gridMap[hole.row][hole.col] = null;
      this.mouseHoles.splice(idx, 1);
    }
  }

  // ========== 老鼠生成與移動 ==========
  spawnMouseAt(row, col, type) {
    const baseDef = this.config.infiniteLevel.spawn[type];
    if (!baseDef) return;
    const minutes = this.elapsedTime / 60;
    const hpBonus = Math.floor(this.config.infiniteLevel.difficultyScale.hpIncreasePerMinute * minutes);
    const speedBonus = this.config.infiniteLevel.difficultyScale.speedIncreasePerMinute * minutes;

    const start = { row, col };
    const end = { row: this.farmhouse.row, col: this.farmhouse.col };
    const path = this.findPath(start, end);
    if (path.length === 0) return;

    const mouse = {
      type,
      row, col,
      x: col * this.cellSize + this.cellSize / 2,
      y: row * this.cellSize + this.cellSize / 2,
      hp: baseDef.hp + hpBonus,
      maxHp: baseDef.hp + hpBonus,
      speed: baseDef.speed + speedBonus,
      path,
      pathIndex: 0,
      state: 'moving',
      attackTarget: null,
      attackTimer: 0,
      element: null
    };
    this.mice.push(mouse);
    this.createMouseElement(mouse);
  }

  findPath(start, end) {
    if (start.row === end.row && start.col === end.col) return [];
    const queue = [[start]];
    const visited = new Set();
    visited.add(`${start.row},${start.col}`);
    while (queue.length > 0) {
      const path = queue.shift();
      const cur = path[path.length - 1];
      const neighbors = [
        { row: cur.row - 1, col: cur.col },
        { row: cur.row + 1, col: cur.col },
        { row: cur.row, col: cur.col - 1 },
        { row: cur.row, col: cur.col + 1 }
      ];
      for (let n of neighbors) {
        if (n.row < 0 || n.row >= 9 || n.col < 0 || n.col >= 9) continue;
        if (n.row === end.row && n.col === end.col) {
          return path.slice(1).concat([{ row: n.row, col: n.col }]);
        }
        const key = `${n.row},${n.col}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push([...path, { row: n.row, col: n.col }]);
        }
      }
    }
    return [];
  }

  createMouseElement(mouse) {
    const el = document.createElement('div');
    el.className = 'mouse';
    el.textContent = '🐭';
    el.style.left = mouse.x + 'px';
    el.style.top = mouse.y + 'px';
    this.boardEl.appendChild(el);
    mouse.element = el;
  }

  // ========== 遊戲循環 ==========
  gameLoop(now) {
    if (this.state !== 'playing') return;
    const delta = Math.min((now - this.lastTimestamp) / 1000, 0.1);
    this.lastTimestamp = now;

    this.updateMice(delta);
    this.buildingAttack(now);
    this.ferretClearInnerHoles(now);

    this.gameLoopId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  updateMice(delta) {
    for (let i = this.mice.length - 1; i >= 0; i--) {
      const m = this.mice[i];
      if (m.state === 'moving') {
        if (m.pathIndex >= m.path.length) {
          this.hitFarmhouse(m);
          this.removeMouse(i);
          continue;
        }
        const targetNode = m.path[m.pathIndex];
        const targetX = targetNode.col * this.cellSize + this.cellSize / 2;
        const targetY = targetNode.row * this.cellSize + this.cellSize / 2;
        const dx = targetX - m.x;
        const dy = targetY - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const moveSpeed = m.speed * this.cellSize * delta;
        if (dist <= moveSpeed + 2) {
          m.x = targetX;
          m.y = targetY;
          m.row = targetNode.row;
          m.col = targetNode.col;
          this.onMouseReachCell(m, targetNode.row, targetNode.col);
          m.pathIndex++;
        } else {
          m.x += (dx / dist) * moveSpeed;
          m.y += (dy / dist) * moveSpeed;
          m.element.style.left = m.x + 'px';
          m.element.style.top = m.y + 'px';
        }
      } else if (m.state === 'attacking') {
        m.attackTimer += delta;
        const interval = this.config.infiniteLevel.mouseAttack.attackInterval;
        if (m.attackTimer >= interval) {
          m.attackTimer -= interval;
          this.mouseDoAttack(m);
        }
        if (m.element) {
          const shake = Math.sin(performance.now() / 50) * 3;
          m.element.style.transform = `translate(-50%, -50%) translateX(${shake}px)`;
        }
      }
    }
  }

  onMouseReachCell(mouse, row, col) {
    const cellType = this.gridMap[row][col];
    if (cellType === 'building') {
      const building = this.buildings.find(b => b.row === row && b.col === col);
      if (building) {
        mouse.state = 'attacking';
        mouse.attackTarget = building;
        mouse.attackTimer = 0;
      }
    } else if (cellType === 'farmplot') {
      const plot = this.farmPlots.find(p => p.row === row && p.col === col);
      if (plot && this.resources[plot.resource] > 0) {
        mouse.state = 'attacking';
        mouse.attackTarget = plot;
        mouse.attackTimer = 0;
        mouse.farmStayTimer = 0;
      }
    } else if (cellType === 'farmhouse') {
      this.hitFarmhouse(mouse);
    }
  }

  mouseDoAttack(mouse) {
    if (!mouse.attackTarget) {
      mouse.state = 'moving';
      mouse.element.style.transform = '';
      return;
    }
    const atkCfg = this.config.infiniteLevel.mouseAttack;
    if (mouse.attackTarget.type) {
      const building = mouse.attackTarget;
      if (!this.buildings.includes(building) || building.hp <= 0) {
        mouse.state = 'moving';
        mouse.attackTarget = null;
        mouse.element.style.transform = '';
        this.repathMouse(mouse);
        return;
      }
      building.hp -= atkCfg.buildingDamage;
      if (building.hp <= 0) {
        this.destroyBuilding(building);
        mouse.state = 'moving';
        mouse.attackTarget = null;
        mouse.element.style.transform = '';
        this.repathMouse(mouse);
      }
    } else {
      const plot = mouse.attackTarget;
      const resType = plot.resource;
      if (this.resources[resType] <= 0 || !this.farmPlots.includes(plot)) {
        mouse.state = 'moving';
        mouse.attackTarget = null;
        mouse.element.style.transform = '';
        this.repathMouse(mouse);
        return;
      }
      const stealAmount = Math.min(atkCfg.farmSteal, this.resources[resType]);
      this.resources[resType] -= stealAmount;
      this.updateResourceDisplay();
      mouse.farmStayTimer = (mouse.farmStayTimer || 0) + atkCfg.attackInterval;
      if (this.resources[resType] <= 0 || mouse.farmStayTimer >= atkCfg.maxFarmStay) {
        if (this.resources[resType] <= 0) this.removeFarmPlot(plot);
        mouse.state = 'moving';
        mouse.attackTarget = null;
        mouse.element.style.transform = '';
        this.repathMouse(mouse);
      }
    }
  }

  repathMouse(mouse) {
    const start = { row: mouse.row, col: mouse.col };
    const end = { row: this.farmhouse.row, col: this.farmhouse.col };
    mouse.path = this.findPath(start, end);
    mouse.pathIndex = 0;
  }

  removeFarmPlot(plot) {
    const idx = this.farmPlots.indexOf(plot);
    if (idx > -1) {
      this.farmPlots.splice(idx, 1);
      this.gridMap[plot.row][plot.col] = null;
      const cells = this.boardEl.querySelectorAll('.cell');
      for (let cell of cells) {
        const left = parseInt(cell.style.left);
        const top = parseInt(cell.style.top);
        if (left === plot.col * this.cellSize && top === plot.row * this.cellSize) {
          cell.remove();
          break;
        }
      }
      if (this.farmPlots.length === 0) this.gameOver();
    }
  }

  hitFarmhouse(mouse) {
    if (!this.farmhouse) return;
    const dmg = this.config.farmhouse.damagePerMouse;
    this.farmhouse.hp = Math.max(0, this.farmhouse.hp - dmg);
    this.updateFarmhouseHP();
    if (this.farmhouse.hp <= 0) this.gameOver();
  }

  destroyBuilding(building) {
    const idx = this.buildings.indexOf(building);
    if (idx > -1) {
      this.buildings.splice(idx, 1);
      this.gridMap[building.row][building.col] = null;
      if (building.element) building.element.remove();
    }
  }

  removeMouse(index) {
    const m = this.mice[index];
    if (m.element) m.element.remove();
    this.mice.splice(index, 1);
  }

  // ========== 貂洞摧毀內部洞 (含冷卻) ==========
  ferretClearInnerHoles(now) {
    const ferretDef = this.config.buildings.ferretDen;
    const range = ferretDef.ferretRange;
    const cooldown = (ferretDef.attackSpeed || 0.5) * 1000;

    for (let building of this.buildings) {
      if (building.type !== 'ferretDen') continue;
      if (building.lastClearTime === undefined) building.lastClearTime = 0;
      if (now - building.lastClearTime < cooldown) continue;

      let cleared = false;
      for (let i = this.mouseHoles.length - 1; i >= 0; i--) {
        const hole = this.mouseHoles[i];
        const dist = Math.abs(building.row - hole.row) + Math.abs(building.col - hole.col);
        if (dist <= range) {
          hole.hp = 0;
          this.removeInnerHole(hole);
          cleared = true;
          break;
        }
      }
      if (cleared) {
        building.lastClearTime = now;
        this.showMessage('🦦 貂洞摧毀了一個老鼠洞！');
      }
    }
  }

  // ========== 建築攻擊 (含動畫) ==========
  buildingAttack(now) {
    const globalAtk = this.getGlobalAttackBonus();
    const hasDog = this.buildings.some(b => b.type === 'dogHouse');
    const hasFerret = this.buildings.some(b => b.type === 'ferretDen');
    let extraAtk = 0;
    if (hasDog) extraAtk += 1;   // 犬窩全體+1
    if (hasFerret) extraAtk += 2; // 貂洞全體+2
    const totalBonus = globalAtk + extraAtk;

    for (let building of this.buildings) {
      const def = this.config.buildings[building.type];
      if (!def.attack || def.attack <= 0) continue;
      const cooldown = 1 / def.attackSpeed;
      if (now - building.lastAttackTime < cooldown * 1000) continue;

      const bx = building.col * this.cellSize + this.cellSize / 2;
      const by = building.row * this.cellSize + this.cellSize / 2;
      let closestMouse = null;
      let closestDist = Infinity;
      for (let m of this.mice) {
        const dx = m.x - bx;
        const dy = m.y - by;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist <= def.range && dist < closestDist) {
          closestDist = dist;
          closestMouse = m;
        }
      }
      if (closestMouse) {
        building.lastAttackTime = now;
        const damage = def.attack + totalBonus;
        closestMouse.hp -= damage;
        closestMouse.element.style.filter = 'brightness(2)';
        setTimeout(() => { if (closestMouse.element) closestMouse.element.style.filter = ''; }, 100);

        // 攻擊動畫
        const m = closestMouse;
        const offsetX = m.x - bx;
        const offsetY = m.y - by;
        const len = Math.sqrt(offsetX*offsetX + offsetY*offsetY);
        const maxStrike = 12;
        let strikeX = 0, strikeY = 0;
        if (len > 1) {
          strikeX = (offsetX / len) * Math.min(len * 0.2, maxStrike);
          strikeY = (offsetY / len) * Math.min(len * 0.2, maxStrike);
        }
        const el = building.element;
        el.style.transform = `translate(${strikeX}px, ${strikeY}px)`;
        setTimeout(() => { if (el) el.style.transform = 'translate(0, 0)'; }, 150);

        if (closestMouse.hp <= 0) {
          this.killCount++;
          this.removeMouse(this.mice.indexOf(closestMouse));
        }
      }
    }
  }

  checkAccidentalDamage() {
    if (this.state !== 'playing') return;
    const hasOwl = this.buildings.some(b => b.type === 'owlPerch');
    const hasDog = this.buildings.some(b => b.type === 'dogHouse');
    if (hasOwl && !hasDog && Math.random() < 0.1) {
      const targets = this.buildings.filter(b => ['rabbitHole','chickenCoop','ferretDen'].includes(b.type));
      if (targets.length > 0) {
        const victim = targets[Math.floor(Math.random() * targets.length)];
        victim.hp -= 20;
        if (victim.hp <= 0) this.destroyBuilding(victim);
        this.showMessage('🦉 貓頭鷹誤傷了建築！');
      }
    }
  }

  // ========== 遊戲結束 ==========
  gameOver() {
    if (this.state !== 'playing') return;
    this.stopAllTimers();
    this.state = 'gameover';
    this.mice.forEach(m => m.element?.remove());
    this.mice = [];
    const survivalGold = Math.floor(this.elapsedTime / 10);
    this.playerData.gold += survivalGold;
    this.savePlayerData();
    document.getElementById('result-title').textContent = '😵 任務失敗…';
    document.getElementById('result-detail').textContent =
      `存活時間：${this.formatTime(this.elapsedTime)}\n消滅老鼠：${this.killCount} 隻\n獲得金幣：${survivalGold} 💰`;
    this.resultModal.classList.remove('hidden');

    this.btnStart.textContent = '開始遊戲';
    this.btnStart.removeEventListener('click', this.restartGame);
    this.btnStart.addEventListener('click', () => this.restartGame());
  }

  restartGame() {
    this.resultModal.classList.add('hidden');
    this.stopAllTimers();
    this.renderInitialBoard();
    this.state = 'waiting';
    this.btnStart.textContent = '開始遊戲';
    this.btnStart.removeEventListener('click', this.restartGame);
    this.btnStart.addEventListener('click', () => this.startGame());
  }

  // ========== 商店 ==========
  openShop() {
    this.updateShopItems();
    this.shopModal.classList.remove('hidden');
  }
  closeShop() { this.shopModal.classList.add('hidden'); }

  updateShopItems() {
    const container = document.getElementById('shop-items');
    container.innerHTML = '';

    const resourcesGroup = document.createElement('div');
    resourcesGroup.innerHTML = '<h3>🛍️ 購買資源</h3>';
    const upgradesGroup = document.createElement('div');
    upgradesGroup.innerHTML = '<h3>⬆️ 永久升級</h3>';
    container.appendChild(resourcesGroup);
    container.appendChild(upgradesGroup);

    for (let card of this.config.shopCards) {
      const div = document.createElement('div');
      div.className = 'shop-item';

      let buttonDisabled = false;
      let buttonText = '';

      if (card.type === 'resource') {
        buttonDisabled = this.playerData.gold < card.cost;
        buttonText = `購買 (💰${card.cost})`;
      } else {
        const bought = this.playerData.purchasedUpgrades.includes(card.id);
        buttonDisabled = bought || this.playerData.gold < card.cost;
        buttonText = bought ? '已購買' : `💰${card.cost}`;
      }

      div.innerHTML = `
        <div class="shop-item-info">
          <strong>${card.name}</strong>
          <span>${card.desc}</span>
        </div>
        <button ${buttonDisabled ? 'disabled' : ''}>${buttonText}</button>
      `;

      div.querySelector('button').addEventListener('click', () => this.buyCard(card.id));

      if (card.type === 'resource') {
        resourcesGroup.appendChild(div);
      } else {
        upgradesGroup.appendChild(div);
      }
    }
  }

  buyCard(id) {
    const card = this.config.shopCards.find(c => c.id === id);
    if (!card) return;

    if (card.type === 'resource') {
      if (this.playerData.gold < card.cost) {
        this.showMessage('金幣不足');
        return;
      }
      this.playerData.gold -= card.cost;
      for (let res in card.effect) {
        this.resources[res] = (this.resources[res] || 0) + card.effect[res];
      }
      this.updateResourceDisplay();
      this.savePlayerData();
      this.updateShopItems();
      this.showMessage(`購買了 ${card.name}！`);
      // 檢查是否為通關證明
if (card.id === 'win_pass' && !this.playerData.purchasedUpgrades.includes(card.id)) {
  // 直接勝利！
  this.stopAllTimers();
  this.state = 'gameover';
  this.mice.forEach(m => m.element?.remove());
  this.mice = [];
  const survivalGold = Math.floor(this.elapsedTime / 10) + 500; // 額外獎勵
  this.playerData.gold += survivalGold;
  this.savePlayerData();
  document.getElementById('result-title').textContent = '🎉 你成功通關了！';
  document.getElementById('result-detail').textContent =
    `你購買了通關證明，農場安全了！\n存活時間：${this.formatTime(this.elapsedTime)}\n額外獎勵：${survivalGold} 💰`;
  this.resultModal.classList.remove('hidden');
  this.btnStart.textContent = '開始遊戲';
  this.btnStart.removeEventListener('click', this.restartGame);
  this.btnStart.addEventListener('click', () => this.restartGame());
  return; // 不再繼續執行原本的購買邏輯
}
    } } else {
  // 永久升級
  if (this.playerData.purchasedUpgrades.includes(id)) return;
  if (this.playerData.gold < card.cost) {
    this.showMessage('金幣不足');
    return;
  }
  this.playerData.gold -= card.cost;
  this.playerData.purchasedUpgrades.push(id);
  this.savePlayerData();
  this.updateShopItems();
  this.showMessage(`購買了 ${card.name}！`);

  // 🎯 通關證明：即時勝利
  if (card.id === 'win_pass') {
    this.stopAllTimers();
    this.state = 'gameover';
    this.mice.forEach(m => m.element?.remove());
    this.mice = [];
    const survivalGold = Math.floor(this.elapsedTime / 10) + 500;
    this.playerData.gold += survivalGold;
    this.savePlayerData();
    document.getElementById('result-title').textContent = '🎉 你成功通關了！';
    document.getElementById('result-detail').textContent =
      `你購買了通關證明，農場安全了！\n存活時間：${this.formatTime(this.elapsedTime)}\n額外獎勵：${survivalGold} 💰`;
    this.resultModal.classList.remove('hidden');
    this.btnStart.textContent = '開始遊戲';
    this.btnStart.removeEventListener('click', this.restartGame);
    this.btnStart.addEventListener('click', () => this.restartGame());
  }
}
    }
  }

  // ========== 教學引導 ==========
  showTutorialIfNeeded() {
    const seen = localStorage.getItem('farmTowerTutorialSeen');
    if (!seen) {
      this.state = 'tutorial';
      const modal = document.getElementById('tutorial-modal');
      if (modal) modal.classList.remove('hidden');
      if (this.btnStart) {
        this.btnStart.disabled = true;
        this.btnStart.textContent = '請先完成教學';
      }
    }
  }

  closeTutorial() {
    const modal = document.getElementById('tutorial-modal');
    if (modal) modal.classList.add('hidden');
    localStorage.setItem('farmTowerTutorialSeen', 'true');
    this.state = 'waiting';
    if (this.btnStart) {
      this.btnStart.disabled = false;
      this.btnStart.textContent = '開始遊戲';
      this.btnStart.removeEventListener('click', this.restartGame);
      this.btnStart.addEventListener('click', () => this.startGame());
    }
  }

  // ========== UI 工具 ==========
  updateResourceDisplay() {
    document.getElementById('res-hay').textContent = this.resources.hay;
    document.getElementById('res-corn').textContent = this.resources.corn;
    document.getElementById('res-meatEgg').textContent = this.resources.meatEgg || 0;
    document.getElementById('res-meat').textContent = this.resources.meat || 0;
    document.getElementById('res-gold').textContent = this.playerData.gold;
  }

  updateTimerDisplay() {
    this.timerEl.textContent = this.formatTime(this.elapsedTime);
  }

  formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  showMessage(text) {
    this.msgEl.textContent = text;
    setTimeout(() => { if (this.msgEl.textContent === text) this.msgEl.textContent = ''; }, 2500);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Game(CONFIG);
});
