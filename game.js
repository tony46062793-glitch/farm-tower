class Game {
  constructor(config) {
    this.config = config;
    this.state = 'idle';
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

    this.gridMap = Array(8).fill().map(() => Array(8).fill(null));

    this.loadPlayerData();
    this.initUI();
    this.startGame();
  }

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

  initUI() {
    this.boardEl = document.getElementById('game-board');
    this.timerEl = document.getElementById('timer');
    this.msgEl = document.getElementById('message');
    this.buildButtonsEl = document.getElementById('build-buttons');
    this.resourceButtonsEl = document.getElementById('resource-buttons');
    this.btnShop = document.getElementById('btn-shop');
    this.btnRestart = document.getElementById('btn-restart');
    this.shopModal = document.getElementById('shop-modal');
    this.resultModal = document.getElementById('result-modal');

    this.btnShop.addEventListener('click', () => this.openShop());
    document.getElementById('btn-close-shop').addEventListener('click', () => this.closeShop());
    this.btnRestart.addEventListener('click', () => this.restartGame());
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

  startGame() {
    this.state = 'playing';
    this.resources = { ...this.config.infiniteLevel.initialResources };
    const bonus = this.getStartResourceBonus();
    this.resources.hay += bonus.hay;
    this.resources.corn += bonus.corn;
    this.elapsedTime = 0;
    this.killCount = 0;

    this.clearBoard();
    this.buildings = [];
    this.mice = [];
    this.mouseHoles = [];
    this.farmhouse = null;
    this.selectedBuildingType = null;
    this.gridMap = Array(8).fill().map(() => Array(8).fill(null));
    this.stopAllTimers();

    this.farmPlots = this.config.infiniteLevel.farmPlots.map(p => ({ ...p }));
    for (let plot of this.farmPlots) {
      this.gridMap[plot.row][plot.col] = 'farmplot';
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.left = plot.col * 64 + 'px';
      cell.style.top = plot.row * 64 + 'px';
      cell.textContent = this.config.resources[plot.resource].emoji;
      this.boardEl.appendChild(cell);
    }

    const fhCfg = this.config.infiniteLevel.farmhouse;
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
    this.showMessage('保護農舍！老鼠會沿路破壞一切！');
    this.resultModal.classList.add('hidden');

    this.startTimers();
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
    if (row < 0 || row >= 8 || col < 0 || col >= 8) return false;
    if (row === 0 || row === 7 || col === 0 || col === 7) return false;
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

    // 若有攻擊屬性，加入範圍指示器
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
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r === 0 || r === 7 || c === 0 || c === 7) {
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
    for (let r = 1; r <= 6; r++) {
      for (let c = 1; c <= 6; c++) {
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
      path,
      pathIndex: 0,
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
        if (n.row < 0 || n.row >= 8 || n.col < 0 || n.col >= 8) continue;
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

  gameLoop(now) {
    if (this.state !== 'playing') return;
    const delta = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;

    this.moveMice(delta);
    this.buildingAttack(now);
    this.ferretClearHoles();

    this.gameLoopId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  moveMice(delta) {
    for (let i = this.mice.length - 1; i >= 0; i--) {
      const m = this.mice[i];
      if (m.pathIndex >= m.path.length) {
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
        m.x = targetX;
        m.y = targetY;
        m.row = targetNode.row;
        m.col = targetNode.col;
        this.mouseEnterCell(m, targetNode.row, targetNode.col);
        m.pathIndex++;
      } else {
        m.x += (dx / dist) * moveSpeed;
        m.y += (dy / dist) * moveSpeed;
        m.element.style.left = m.x + 'px';
        m.element.style.top = m.y + 'px';
      }
    }
  }

  mouseEnterCell(mouse, row, col) {
    const cellType = this.gridMap[row][col];
    if (cellType === 'farmhouse') {
      this.hitFarmhouse(mouse);
    } else if (cellType === 'building') {
      const building = this.buildings.find(b => b.row === row && b.col === col);
      if (building) {
        building.hp -= 5;
        if (building.hp <= 0) {
          this.destroyBuilding(building);
        }
      }
    } else if (cellType === 'farmplot') {
      const plot = this.farmPlots.find(p => p.row === row && p.col === col);
      if (plot) {
        this.resources[plot.resource] = Math.max(0, this.resources[plot.resource] - 5);
        this.updateResourceDisplay();
        if (this.resources.hay <= 0 && this.resources.corn <= 0) {
          this.gameOver();
        }
      }
    }
  }

  hitFarmhouse(mouse) {
    if (!this.farmhouse) return;
    const dmg = this.config.farmhouse.damagePerMouse;
    this.farmhouse.hp = Math.max(0, this.farmhouse.hp - dmg);
    this.updateFarmhouseHP();
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
    }
  }

  removeMouse(index) {
    const m = this.mice[index];
    if (m.element) m.element.remove();
    this.mice.splice(index, 1);
  }

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
        }
      }
    }
  }

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

        // ---------- 攻擊動畫 ----------
        const m = closestMouse;
        const offsetX = m.x - bx;
        const offsetY = m.y - by;
        const len = Math.sqrt(offsetX*offsetX + offsetY*offsetY);
        const maxStrike = 12; // 最大衝刺距離（像素）
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
        // --------------------------------

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
      }
    }
  }

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
  }

  restartGame() {
    this.resultModal.classList.add('hidden');
    this.startGame();
  }

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
