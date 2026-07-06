class Game {
  constructor(config) {
    this.config = config;
    this.state = 'waiting';
    this.resources = {};
    this.buildings = [];
    this.mice = [];
    this.farmPlots = [];
    this.farmhouse = null;
    this.mouseHoles = [];
    this.selectedBuildingType = null;
    this.playerData = { gold: 0, purchasedUpgrades: [] };

    this.elapsedTime = 0;
    this.killCount = 0;
    this.timerInterval = null;
    this.outerSpawnInterval = null;
    this.innerHoleSpawnInterval = null;
    this.accidentInterval = null;
    this.gameLoopId = null;
    this.lastTimestamp = 0;

    this.gridMap = Array(9).fill().map(() => Array(9).fill(null));

    this.loadPlayerData();
    this.initUI();
    this.renderInitialBoard();
  }

  // ========== 存檔 ==========
  loadPlayerData() {
    const saved = localStorage.getItem('farmTowerSave');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.playerData.gold = data.gold || 0;
        this.playerData.purchasedUpgrades = data.purchasedUpgrades || [];
      } catch (e) {}
    }
  }
  savePlayerData() {
    localStorage.setItem('farmTowerSave', JSON.stringify(this.playerData));
    this.updateResourceDisplay();
  }
  getGlobalAttackBonus() {
    let bonus = 0;
    for (let id of this.playerData.purchasedUpgrades) {
      const card = this.config.shopCards.find(c => c.id === id);
      if (card?.effect.globalAttack) bonus += card.effect.globalAttack;
    }
    return bonus;
  }
  getStartResourceBonus() {
    let bonus = { hay: 0, corn: 0 };
    for (let id of this.playerData.purchasedUpgrades) {
      const card = this.config.shopCards.find(c => c.id === id);
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

    this.createBuildButtons();
    this.createResourceButtons();
    this.updateResourceDisplay();
    this.updateShopItems();
  }

  createBuildButtons() {
    this.buildButtonsEl.innerHTML = '';
    for (let key in this.config.buildings) {
      const b = this.config.buildings[key];
      const btn = document.createElement('button');
      btn.textContent = `${b.emoji} ${b.name}`;
      btn.dataset.buildingId = b.id;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectBuilding(b.id);
      });
      this.buildButtonsEl.appendChild(btn);
    }
  }

  createResourceButtons() {
    this.resourceButtonsEl.innerHTML = '';
    const order = ['hay', 'corn', 'meatEgg', 'meat'];
    for (let key of order) {
      const shop = this.config.resourceShop[key];
      const info = this.config.resources[key];
      const btn = document.createElement('button');
      btn.textContent = `${info.emoji}+${shop.amount} (${shop.cost}💰)`;
      btn.addEventListener('click', () => this.buyResource(key));
      this.resourceButtonsEl.appendChild(btn);
    }
  }

  selectBuilding(id) {
    if (this.state !== 'playing') return;
    this.selectedBuildingType = id;
    this.showMessage(`已選擇 ${this.config.buildings[id].name}，點擊空地建造`);
  }

  // ========== 初始畫面 ==========
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
    this.farmhouse = null;
    this.selectedBuildingType = null;
    this.gridMap = Array(9).fill().map(() => Array(9).fill(null));

    this.farmPlots = level.farmPlots.map(p => ({ ...p }));
    for (let plot of this.farmPlots) {
      this.gridMap[plot.row][plot.col] = 'farmplot';
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.left = plot.col * 64 + 'px';
      cell.style.top = plot.row * 64 + 'px';
      cell.textContent = this.config.resources[plot.resource].emoji;
      this.boardEl.appendChild(cell);
    }

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
    el.style.left = fhCfg.col * 64 + 'px';
    el.style.top = fhCfg.row * 64 + 'px';
    el.innerHTML = `<div class="farmhouse-emoji">${this.config.farmhouse.emoji}</div>
                    <div class="hp-bar-container"><div class="hp-bar-fill" style="width:100%"></div></div>`;
    this.boardEl.appendChild(el);
    this.farmhouse.element = el;

    this.updateResourceDisplay();
    this.updateTimerDisplay();
    this.showMessage('準備好就按下「開始遊戲」！');
    this.resultModal.classList.add('hidden');
  }

  startGame() {
    if (this.state === 'playing') return;
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
    const col = Math.floor(x / 64);
    const row = Math.floor(y / 64);
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
    el.style.left = building.col * 64 + 'px';
    el.style.top = building.row * 64 + 'px';
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

  buyResource(key) {
    if (this.state !== 'playing') return;
    const shop = this.config.resourceShop[key];
    if (!shop || this.playerData.gold < shop.cost) {
      this.showMessage('金幣不足');
      return;
    }
    this.playerData.gold -= shop.cost;
    this.resources[key] = (this.resources[key] || 0) + shop.amount;
    this.updateResourceDisplay();
    this.savePlayerData();
  }

  // ========== 計時與生成 ==========
  startTimers() {
    this.timerInterval = setInterval(() => {
      this.elapsedTime++;
      this.updateTimerDisplay();
    }, 1000);

    this.startOuterSpawn();
    this.startInnerHoleSpawning();
    this.accidentInterval = setInterval(() => this.checkAccidentalDamage(), 10000);
    this.lastTimestamp = performance.now();
    this.gameLoopId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  stopAllTimers() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.outerSpawnInterval) clearInterval(this.outerSpawnInterval);
    if (this.innerHoleSpawnInterval) clearInterval(this.innerHoleSpawnInterval);
    if (this.accidentInterval) clearInterval(this.accidentInterval);
    if (this.gameLoopId) cancelAnimationFrame(this.gameLoopId);
    this.timerInterval = null;
    this.outerSpawnInterval = null;
    this.innerHoleSpawnInterval = null;
    this.accidentInterval = null;
    this.gameLoopId = null;
  }

  startOuterSpawn() {
    if (this.outerSpawnInterval) clearInterval(this.outerSpawnInterval);
    const interval = this.config.infiniteLevel.outerSpawnInterval * 1000;
    this.outerSpawnInterval = setInterval(() => {
      if (this.state !== 'playing') return;
      this.spawnFromOuterHole();
    }, interval);
  }

  spawnFromOuterHole() {
    const candidates = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (r === 0 || r === 8 || c === 0 || c === 8) {
          candidates.push({ row: r, col: c });
        }
      }
    }
    const pos = candidates[Math.floor(Math.random() * candidates.length)];
    this.spawnMouseAt(pos.row, pos.col, 'normal');
  }

  startInnerHoleSpawning() {
    if (this.innerHoleSpawnInterval) clearInterval(this.innerHoleSpawnInterval);
    const interval = this.config.infiniteLevel.innerHoleSpawnInterval * 1000;
    this.innerHoleSpawnInterval = setInterval(() => {
      if (this.state !== 'playing') return;
      this.trySpawnInnerHole();
    }, interval);
  }

  trySpawnInnerHole() {
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
    this.createMouseHole(pos.row, pos.col);
  }

  createMouseHole(row, col) {
    const holeCfg = this.config.mouseHole;
    const hole = {
      row, col,
      hp: holeCfg.hp,
      maxHp: holeCfg.hp,
      spawnTimer: holeCfg.initialSpawnDelay,
      element: null
    };
    this.mouseHoles.push(hole);
    this.gridMap[row][col] = 'mousehole';
    const el = document.createElement('div');
    el.className = 'mouse-hole';
    el.style.left = col * 64 + 'px';
    el.style.top = row * 64 + 'px';
    el.textContent = holeCfg.emoji;
    this.boardEl.appendChild(el);
    hole.element = el;

    hole.intervalId = setInterval(() => {
      if (this.state !== 'playing') return;
      if (hole.hp <= 0) {
        clearInterval(hole.intervalId);
        return;
      }
      this.spawnMouseAt(row, col, 'normal');
    }, holeCfg.spawnInterval * 1000);
  }

  removeMouseHole(hole) {
    const idx = this.mouseHoles.indexOf(hole);
    if (idx > -1) {
      clearInterval(hole.intervalId);
      if (hole.element) hole.element.remove();
      if (this.gridMap[hole.row][hole.col] === 'mousehole') {
        this.gridMap[hole.row][hole.col] = null;
      }
      this.mouseHoles.splice(idx, 1);
    }
  }

  // ========== 老鼠生成與路徑 ==========
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
      x: col * 64 + 32,
      y: row * 64 + 32,
      hp: baseDef.hp + hpBonus,
      maxHp: baseDef.hp + hpBonus,
      speed: baseDef.speed + speedBonus,
      path,                // 剩餘路徑（不含當前格）
      pathIndex: 0,
      state: 'moving',     // 'moving' | 'attacking'
      attackTarget: null,  // 正在攻擊的物件（building 或 farmPlot）
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

  // ========== 遊戲主循環 ==========
  gameLoop(now) {
    if (this.state !== 'playing') return;
    const delta = Math.min((now - this.lastTimestamp) / 1000, 0.1); // 避免大幀跳
    this.lastTimestamp = now;

    this.updateMice(delta);
    this.buildingAttack(now);
    this.ferretClearHoles();

    this.gameLoopId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  // 更新所有老鼠（移動 + 攻擊）
  updateMice(delta) {
    for (let i = this.mice.length - 1; i >= 0; i--) {
      const m = this.mice[i];

      if (m.state === 'moving') {
        // 移動狀態
        if (m.pathIndex >= m.path.length) {
          // 到達終點（農舍）
          this.hitFarmhouse(m);
          this.removeMouse(i);
          continue;
        }
        const targetNode = m.path[m.pathIndex];
        const targetX = targetNode.col * 64 + 32;
        const targetY = targetNode.row * 64 + 32;
        const dx = targetX - m.x;
        const dy = targetY - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const moveSpeed = m.speed * 64 * delta;
        if (dist <= moveSpeed + 2) {
          // 到達目標格子中心
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
        // 攻擊狀態
        m.attackTimer += delta;
        const interval = this.config.infiniteLevel.mouseAttack.attackInterval;
        if (m.attackTimer >= interval) {
          m.attackTimer -= interval;
          this.mouseDoAttack(m);
        }
        // 攻擊時輕微抖動
        if (m.element) {
          const shake = Math.sin(performance.now() / 50) * 3;
          m.element.style.transform = `translate(-50%, -50%) translateX(${shake}px)`;
        }
      }
    }
  }

  // 老鼠到達一個新格子時觸發
  onMouseReachCell(mouse, row, col) {
    const cellType = this.gridMap[row][col];
    if (cellType === 'building') {
      const building = this.buildings.find(b => b.row === row && b.col === col);
      if (building) {
        // 開始攻擊建築
        mouse.state = 'attacking';
        mouse.attackTarget = building;
        mouse.attackTimer = 0;
        this.showMessage('🐭 開始啃咬建築！');
      }
    } else if (cellType === 'farmplot') {
      const plot = this.farmPlots.find(p => p.row === row && p.col === col);
      if (plot && this.resources[plot.resource] > 0) {
        // 開始偷取農田
        mouse.state = 'attacking';
        mouse.attackTarget = plot;
        mouse.attackTimer = 0;
        // 記錄停留開始時間（用於限制最大停留）
        mouse.farmStayTimer = 0;
      }
    } else if (cellType === 'farmhouse') {
      this.hitFarmhouse(mouse);
      // 老鼠在攻擊農舍後消失，不用更改狀態
    }
    // 若是空地或老鼠洞，保持 moving 繼續前進
  }

  // 老鼠執行一次攻擊（對建築或農田）
  mouseDoAttack(mouse) {
    if (!mouse.attackTarget) {
      // 目標已消失，恢復移動
      mouse.state = 'moving';
      mouse.element.style.transform = ''; // 清除抖動
      return;
    }

    const atkCfg = this.config.infiniteLevel.mouseAttack;

    if (mouse.attackTarget.type) {
      // 攻擊目標是建築
      const building = mouse.attackTarget;
      // 確認建築還存在
      if (!this.buildings.includes(building) || building.hp <= 0) {
        // 建築已摧毀，清除目標，重新計算路徑
        mouse.state = 'moving';
        mouse.attackTarget = null;
        mouse.element.style.transform = '';
        // 重新尋找從當前格到農舍的路徑
        const start = { row: mouse.row, col: mouse.col };
        const end = { row: this.farmhouse.row, col: this.farmhouse.col };
        mouse.path = this.findPath(start, end);
        mouse.pathIndex = 0;
        return;
      }
      building.hp -= atkCfg.buildingDamage;
      this.showMessage(`🐭 攻擊建築！-${atkCfg.buildingDamage} HP`);
      if (building.hp <= 0) {
        this.destroyBuilding(building);
        // 建築摧毀後，恢復移動並重算路徑
        mouse.state = 'moving';
        mouse.attackTarget = null;
        mouse.element.style.transform = '';
        const start = { row: mouse.row, col: mouse.col };
        const end = { row: this.farmhouse.row, col: this.farmhouse.col };
        mouse.path = this.findPath(start, end);
        mouse.pathIndex = 0;
      }
    } else {
      // 攻擊目標是農田
      const plot = mouse.attackTarget;
      const resType = plot.resource;
      if (this.resources[resType] <= 0 || !this.farmPlots.includes(plot)) {
        // 農田已空，恢復移動
        mouse.state = 'moving';
        mouse.attackTarget = null;
        mouse.element.style.transform = '';
        const start = { row: mouse.row, col: mouse.col };
        const end = { row: this.farmhouse.row, col: this.farmhouse.col };
        mouse.path = this.findPath(start, end);
        mouse.pathIndex = 0;
        return;
      }
      const stealAmount = Math.min(atkCfg.farmSteal, this.resources[resType]);
      this.resources[resType] -= stealAmount;
      this.updateResourceDisplay();
      this.showMessage(`🐭 偷走了 ${stealAmount} ${this.config.resources[resType].name}！`);

      // 累計停留時間，超過上限或資源歸零則離開
      mouse.farmStayTimer = (mouse.farmStayTimer || 0) + atkCfg.attackInterval;
      if (this.resources[resType] <= 0 || mouse.farmStayTimer >= atkCfg.maxFarmStay) {
        // 資源歸零 → 移除農田
        if (this.resources[resType] <= 0) {
          this.removeFarmPlot(plot);
        }
        mouse.state = 'moving';
        mouse.attackTarget = null;
        mouse.element.style.transform = '';
        const start = { row: mouse.row, col: mouse.col };
        const end = { row: this.farmhouse.row, col: this.farmhouse.col };
        mouse.path = this.findPath(start, end);
        mouse.pathIndex = 0;
      }
    }
  }

  removeFarmPlot(plot) {
    const idx = this.farmPlots.indexOf(plot);
    if (idx > -1) {
      this.farmPlots.splice(idx, 1);
      this.gridMap[plot.row][plot.col] = null;
      // 移除對應的 cell 元素
      const cells = this.boardEl.querySelectorAll('.cell');
      for (let cell of cells) {
        const left = parseInt(cell.style.left);
        const top = parseInt(cell.style.top);
        if (left === plot.col * 64 && top === plot.row * 64) {
          cell.remove();
          break;
        }
      }
      // 如果所有農田都沒了，遊戲失敗
      if (this.farmPlots.length === 0) {
        this.gameOver();
      }
    }
  }

  hitFarmhouse(mouse) {
    if (!this.farmhouse) return;
    const dmg = this.config.farmhouse.damagePerMouse;
    this.farmhouse.hp = Math.max(0, this.farmhouse.hp - dmg);
    this.updateFarmhouseHP();
    this.showMessage(`🐭 撞擊農舍！-${dmg} HP`);
    if (this.farmhouse.hp <= 0) {
      this.gameOver();
    }
  }

  destroyBuilding(building) {
    const idx = this.buildings.indexOf(building);
    if (idx > -1) {
      this.buildings.splice(idx, 1);
      this.gridMap[building.row][building.col] = null;
      if (building.element) building.element.remove();
      this.showMessage(`${this.config.buildings[building.type].name} 被摧毀！`);
    }
  }

  removeMouse(index) {
    const m = this.mice[index];
    if (m.element) m.element.remove();
    this.mice.splice(index, 1);
  }

  // ========== 貂洞清除內部老鼠洞 ==========
  ferretClearHoles() {
    const ferretDef = this.config.buildings.ferretDen;
    const range = ferretDef.ferretRange;
    for (let building of this.buildings) {
      if (building.type !== 'ferretDen') continue;
      for (let i = this.mouseHoles.length - 1; i >= 0; i--) {
        const hole = this.mouseHoles[i];
        const dist = Math.abs(building.row - hole.row) + Math.abs(building.col - hole.col);
        if (dist <= range) {
          hole.hp = 0;
          this.removeMouseHole(hole);
          this.showMessage('🦦 貂洞摧毀了一個老鼠洞！');
        }
      }
    }
  }

  // ========== 防禦建築攻擊 ==========
  buildingAttack(now) {
    const globalAtk = this.getGlobalAttackBonus();
    const hasDog = this.buildings.some(b => b.type === 'dogHouse');
    const hasFerret = this.buildings.some(b => b.type === 'ferretDen');
    let extraAtk = 0;
    if (hasDog) extraAtk += 2;
    if (hasFerret) extraAtk += 2;
    const totalBonus = globalAtk + extraAtk;

    for (let building of this.buildings) {
      const def = this.config.buildings[building.type];
      if (!def.attack || def.attack <= 0) continue;
      const cooldown = 1 / def.attackSpeed;
      if (now - building.lastAttackTime < cooldown * 1000) continue;

      const bx = building.col * 64 + 32;
      const by = building.row * 64 + 32;
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
        setTimeout(() => {
          if (el) el.style.transform = 'translate(0, 0)';
        }, 150);

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
    this.mouseHoles.forEach(h => clearInterval(h.intervalId));
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
    for (let card of this.config.shopCards) {
      const bought = this.playerData.purchasedUpgrades.includes(card.id);
      const div = document.createElement('div');
      div.style.margin = '8px 0';
      div.innerHTML = `<strong>${card.name}</strong> - ${card.desc} (💰${card.cost})`;
      const btn = document.createElement('button');
      btn.textContent = bought ? '已購買' : '購買';
      btn.disabled = bought || this.playerData.gold < card.cost;
      btn.addEventListener('click', () => this.buyCard(card.id));
      div.appendChild(btn);
      container.appendChild(div);
    }
  }

  buyCard(id) {
    const card = this.config.shopCards.find(c => c.id === id);
    if (!card || this.playerData.gold < card.cost || this.playerData.purchasedUpgrades.includes(id)) return;
    this.playerData.gold -= card.cost;
    this.playerData.purchasedUpgrades.push(id);
    this.savePlayerData();
    this.updateShopItems();
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
