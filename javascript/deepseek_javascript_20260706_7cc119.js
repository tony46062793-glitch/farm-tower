// game.js —— 核心遊戲邏輯
class Game {
  constructor(config) {
    this.config = config;
    this.state = 'idle'; // idle | prepare | defend | result
    this.resources = {};
    this.buildings = [];
    this.mice = [];
    this.farmPlots = [];
    this.selectedBuildingType = null; // 正在選擇建造的類型
    this.playerData = { gold: 0, purchasedUpgrades: [] };
    this.timeLeft = 0;
    this.timerInterval = null;
    this.mouseSpawnInterval = null;
    this.gameLoopId = null;
    this.accidentInterval = null;
    this.lastTimestamp = 0;

    this.loadPlayerData();
    this.initUI();
    this.startLevel(1);
  }

  // ========== 存檔相關 ==========
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
    for (let upgradeId of this.playerData.purchasedUpgrades) {
      const card = this.config.shopCards.find(c => c.id === upgradeId);
      if (card && card.effect.globalAttack) bonus += card.effect.globalAttack;
    }
    return bonus;
  }

  getStartResourceBonus() {
    let bonus = { hay: 0, corn: 0 };
    for (let upgradeId of this.playerData.purchasedUpgrades) {
      const card = this.config.shopCards.find(c => c.id === upgradeId);
      if (card && card.effect.bonusStart) {
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
    this.btnStart = document.getElementById('btn-start');
    this.btnShop = document.getElementById('btn-shop');
    this.shopModal = document.getElementById('shop-modal');
    this.resultModal = document.getElementById('result-modal');

    // 綁定事件
    this.btnStart.addEventListener('click', () => this.startDefense());
    this.btnShop.addEventListener('click', () => this.openShop());
    document.getElementById('btn-close-shop').addEventListener('click', () => this.closeShop());
    document.getElementById('btn-restart').addEventListener('click', () => this.restartLevel());
    this.boardEl.addEventListener('click', (e) => this.onBoardClick(e));

    this.createBuildButtons();
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

  selectBuilding(id) {
    if (this.state !== 'prepare') return;
    this.selectedBuildingType = id;
    this.showMessage(`已選擇 ${this.config.buildings[id].name}，點擊空地建造`);
  }

  // ========== 關卡初始化 ==========
  startLevel(levelId) {
    this.state = 'prepare';
    const level = this.config.levels.find(l => l.id === levelId);
    if (!level) return;

    this.currentLevel = level;
    // 資源初始化
    const baseRes = { ...level.initialResources };
    const bonus = this.getStartResourceBonus();
    this.resources = {
      hay: baseRes.hay + bonus.hay,
      corn: baseRes.corn + bonus.corn,
      meatEgg: baseRes.meatEgg || 0,
      meat: baseRes.meat || 0
    };

    // 清除舊的建築、老鼠
    this.buildings.forEach(b => b.element?.remove());
    this.mice.forEach(m => m.element?.remove());
    this.buildings = [];
    this.mice = [];
    this.timeLeft = level.duration;
    this.stopAllTimers();

    // 渲染農田
    this.renderFarmPlots(level.farmPlots);
    this.updateResourceDisplay();
    this.updateTimerDisplay();
    this.btnStart.disabled = false;
    this.showMessage('準備階段：建造防禦建築，然後開始防守！');
    this.resultModal.classList.add('hidden');
  }

  renderFarmPlots(plots) {
    // 清除舊的農田顯示
    this.boardEl.querySelectorAll('.cell').forEach(el => el.remove());
    this.farmPlots = plots.map(p => ({ ...p }));
    for (let plot of this.farmPlots) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.left = plot.col * this.config.grid.cellSize + 'px';
      cell.style.top = plot.row * this.config.grid.cellSize + 'px';
      cell.textContent = this.config.resources[plot.resource].emoji;
      this.boardEl.appendChild(cell);
    }
  }

  // 檢查格子是否為可建造空地（非農田、無建築、在棋盤內）
  isCellBuildable(row, col) {
    if (row < 0 || row >= this.config.grid.rows || col < 0 || col >= this.config.grid.cols) return false;
    // 農田佔據不可建造
    for (let plot of this.farmPlots) {
      if (plot.row === row && plot.col === col) return false;
    }
    // 已有建築
    for (let b of this.buildings) {
      if (b.row === row && b.col === col) return false;
    }
    return true;
  }

  // 點擊棋盤建造建築
  onBoardClick(event) {
    if (this.state !== 'prepare' || !this.selectedBuildingType) return;
    const rect = this.boardEl.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.floor(x / this.config.grid.cellSize);
    const row = Math.floor(y / this.config.grid.cellSize);
    if (!this.isCellBuildable(row, col)) {
      this.showMessage('此格無法建造');
      return;
    }
    this.tryBuild(this.selectedBuildingType, row, col);
  }

  tryBuild(buildingId, row, col) {
    const def = this.config.buildings[buildingId];
    if (!def) return;

    // 檢查前置建築
    if (def.unlockRequirement) {
      const hasReq = this.buildings.some(b => b.type === def.unlockRequirement);
      if (!hasReq) {
        this.showMessage(`需要先建造 ${this.config.buildings[def.unlockRequirement].name}`);
        return;
      }
    }

    // 檢查資源
    for (let res in def.cost) {
      if ((this.resources[res] || 0) < def.cost[res]) {
        this.showMessage(`${this.config.resources[res].name}不足`);
        return;
      }
    }

    // 扣除資源
    for (let res in def.cost) {
      this.resources[res] -= def.cost[res];
    }

    // 創建建築物件
    const building = {
      type: buildingId,
      row,
      col,
      hp: def.hp,
      maxHp: def.hp,
      lastAttackTime: 0,
      element: null
    };
    this.buildings.push(building);
    this.placeBuildingElement(building);
    this.updateResourceDisplay();
    this.showMessage(`建造了 ${def.name}`);
  }

  placeBuildingElement(building) {
    const def = this.config.buildings[building.type];
    const el = document.createElement('div');
    el.className = 'building';
    el.style.left = building.col * this.config.grid.cellSize + 'px';
    el.style.top = building.row * this.config.grid.cellSize + 'px';
    el.textContent = def.emoji;
    this.boardEl.appendChild(el);
    building.element = el;
  }

  // ========== 防守階段 ==========
  startDefense() {
    if (this.state !== 'prepare') return;
    this.state = 'defend';
    this.btnStart.disabled = true;
    this.selectedBuildingType = null;
    this.showMessage('防守開始！保護農田！');

    this.startTimers();
  }

  startTimers() {
    // 計時器
    this.timerInterval = setInterval(() => {
      this.timeLeft -= 1;
      this.updateTimerDisplay();
      if (this.timeLeft <= 0) {
        this.endDefense(true);
      }
    }, 1000);

    // 老鼠生成
    const spawn = this.currentLevel.spawn;
    this.mouseSpawnInterval = setInterval(() => {
      if (this.state !== 'defend') return;
      const type = spawn.types[Math.floor(Math.random() * spawn.types.length)];
      this.spawnMouse(type);
    }, spawn.interval * 1000);

    // 誤傷檢查
    this.accidentInterval = setInterval(() => {
      this.checkAccidentalDamage();
    }, 10000);

    // 遊戲主循環
    this.lastTimestamp = performance.now();
    this.gameLoopId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  stopAllTimers() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.mouseSpawnInterval) clearInterval(this.mouseSpawnInterval);
    if (this.accidentInterval) clearInterval(this.accidentInterval);
    if (this.gameLoopId) cancelAnimationFrame(this.gameLoopId);
    this.timerInterval = null;
    this.mouseSpawnInterval = null;
    this.accidentInterval = null;
    this.gameLoopId = null;
  }

  spawnMouse(type) {
    const def = this.currentLevel.spawn[type];
    if (!def) return;
    // 隨機選擇一個邊緣位置（上下左右）
    const edge = Math.floor(Math.random() * 4);
    let startX, startY;
    const boardW = this.config.grid.cols * this.config.grid.cellSize;
    const boardH = this.config.grid.rows * this.config.grid.cellSize;
    if (edge === 0) { // 上
      startX = Math.random() * boardW;
      startY = -10;
    } else if (edge === 1) { // 右
      startX = boardW + 10;
      startY = Math.random() * boardH;
    } else if (edge === 2) { // 下
      startX = Math.random() * boardW;
      startY = boardH + 10;
    } else { // 左
      startX = -10;
      startY = Math.random() * boardH;
    }

    // 目標：隨機選一個農田格
    const targetPlot = this.farmPlots[Math.floor(Math.random() * this.farmPlots.length)];
    const targetX = targetPlot.col * this.config.grid.cellSize + this.config.grid.cellSize / 2;
    const targetY = targetPlot.row * this.config.grid.cellSize + this.config.grid.cellSize / 2;

    const mouse = {
      type,
      x: startX,
      y: startY,
      hp: def.hp,
      maxHp: def.hp,
      speed: def.speed,
      targetX,
      targetY,
      element: null
    };
    this.mice.push(mouse);
    this.createMouseElement(mouse);
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
    if (this.state !== 'defend') return;
    const delta = (now - this.lastTimestamp) / 1000; // 秒
    this.lastTimestamp = now;

    this.moveMice(delta);
    this.buildingAttack(now);
    this.checkMiceReach();

    this.gameLoopId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  moveMice(delta) {
    for (let i = this.mice.length - 1; i >= 0; i--) {
      const m = this.mice[i];
      const dx = m.targetX - m.x;
      const dy = m.targetY - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 4) {
        // 到達農田，偷取資源
        this.mouseSteal(m);
        this.removeMouse(i);
        continue;
      }
      const move = m.speed * delta;
      m.x += (dx / dist) * move;
      m.y += (dy / dist) * move;
      m.element.style.left = m.x + 'px';
      m.element.style.top = m.y + 'px';
    }
  }

  mouseSteal(mouse) {
    // 找到老鼠目標農田對應的資源
    const plot = this.farmPlots.find(p => {
      const cx = p.col * this.config.grid.cellSize + this.config.grid.cellSize / 2;
      const cy = p.row * this.config.grid.cellSize + this.config.grid.cellSize / 2;
      return Math.abs(cx - mouse.targetX) < 1 && Math.abs(cy - mouse.targetY) < 1;
    });
    if (plot) {
      const resType = plot.resource;
      this.resources[resType] = Math.max(0, this.resources[resType] - 5);
      this.updateResourceDisplay();
      this.showMessage(`🐭 偷走了 ${this.config.resources[resType].name}！`);
      // 若資源歸零，遊戲失敗
      if (this.resources.hay <= 0 && this.resources.corn <= 0) {
        this.endDefense(false);
      }
    }
  }

  buildingAttack(now) {
    const globalAtk = this.getGlobalAttackBonus();
    // 計算犬窩、貂洞的加成（存在即+2）
    const hasDogHouse = this.buildings.some(b => b.type === 'dogHouse');
    const hasFerretDen = this.buildings.some(b => b.type === 'ferretDen');
    let extraAtk = 0;
    if (hasDogHouse) extraAtk += 2;
    if (hasFerretDen) extraAtk += 2;
    const totalBonus = globalAtk + extraAtk;

    for (let building of this.buildings) {
      const def = this.config.buildings[building.type];
      if (!def.attack || def.attack <= 0) continue;
      const attackCooldown = 1 / def.attackSpeed; // 秒
      if (now - building.lastAttackTime < attackCooldown * 1000) continue;

      // 尋找範圍內的老鼠
      const bCenterX = building.col * this.config.grid.cellSize + this.config.grid.cellSize / 2;
      const bCenterY = building.row * this.config.grid.cellSize + this.config.grid.cellSize / 2;
      for (let i = this.mice.length - 1; i >= 0; i--) {
        const m = this.mice[i];
        const dx = m.x - bCenterX;
        const dy = m.y - bCenterY;
        if (Math.sqrt(dx*dx + dy*dy) <= def.range) {
          // 攻擊
          building.lastAttackTime = now;
          const damage = def.attack + totalBonus;
          m.hp -= damage;
          // 攻擊動畫（簡單閃爍）
          m.element.style.filter = 'brightness(2)';
          setTimeout(() => { if (m.element) m.element.style.filter = ''; }, 100);
          if (m.hp <= 0) {
            this.removeMouse(i);
          }
          break; // 每次攻擊只打一隻
        }
      }
    }
  }

  removeMouse(index) {
    const m = this.mice[index];
    if (m.element) m.element.remove();
    this.mice.splice(index, 1);
  }

  checkMiceReach() {
    // 已在 moveMice 中處理到達
  }

  // 誤傷檢查
  checkAccidentalDamage() {
    if (this.state !== 'defend') return;
    const hasOwl = this.buildings.some(b => b.type === 'owlPerch');
    const hasDog = this.buildings.some(b => b.type === 'dogHouse');
    if (hasOwl && !hasDog) {
      if (Math.random() < 0.1) {
        // 選擇一個兔穴、雞舍、貂洞
        const targets = this.buildings.filter(b => ['rabbitHole','chickenCoop','ferretDen'].includes(b.type));
        if (targets.length > 0) {
          const victim = targets[Math.floor(Math.random() * targets.length)];
          victim.hp -= 20;
          this.showMessage(`🦉 貓頭鷹誤傷了 ${this.config.buildings[victim.type].name}！`);
          if (victim.hp <= 0) {
            this.destroyBuilding(victim);
          }
        }
      }
    }
  }

  destroyBuilding(building) {
    const index = this.buildings.indexOf(building);
    if (index > -1) {
      this.buildings.splice(index, 1);
      if (building.element) building.element.remove();
      this.showMessage(`${this.config.buildings[building.type].name} 被摧毀了！`);
    }
  }

  // ========== 結算 ==========
  endDefense(success) {
    this.stopAllTimers();
    this.state = 'result';
    this.btnStart.disabled = true;

    // 清除場上老鼠
    this.mice.forEach(m => m.element?.remove());
    this.mice = [];

    if (success) {
      // 資源轉金幣
      const goldEarned = this.resources.hay + this.resources.corn + this.resources.meatEgg * 2 + this.resources.meat * 2;
      this.playerData.gold += goldEarned;
      this.savePlayerData();
      document.getElementById('result-title').textContent = '🎉 防守成功！';
      document.getElementById('result-detail').textContent = `你獲得了 ${goldEarned} 金幣！`;
    } else {
      document.getElementById('result-title').textContent = '😵 農作物被吃光了…';
      document.getElementById('result-detail').textContent = '獲得少量安慰金幣 20';
      this.playerData.gold += 20;
      this.savePlayerData();
    }
    this.resultModal.classList.remove('hidden');
  }

  restartLevel() {
    this.resultModal.classList.add('hidden');
    this.startLevel(this.currentLevel.id);
  }

  // ========== 商店 ==========
  openShop() {
    if (this.state === 'defend') return;
    this.updateShopItems();
    this.shopModal.classList.remove('hidden');
  }

  closeShop() {
    this.shopModal.classList.add('hidden');
  }

  updateShopItems() {
    const container = document.getElementById('shop-items');
    if (!container) return;
    container.innerHTML = '';
    for (let card of this.config.shopCards) {
      const div = document.createElement('div');
      div.style.margin = '8px 0';
      const bought = this.playerData.purchasedUpgrades.includes(card.id);
      div.innerHTML = `<strong>${card.name}</strong> - ${card.desc} (💰${card.cost})`;
      const btn = document.createElement('button');
      btn.textContent = bought ? '已購買' : '購買';
      btn.disabled = bought || this.playerData.gold < card.cost;
      btn.addEventListener('click', () => this.buyCard(card.id));
      div.appendChild(btn);
      container.appendChild(div);
    }
  }

  buyCard(cardId) {
    const card = this.config.shopCards.find(c => c.id === cardId);
    if (!card) return;
    if (this.playerData.gold < card.cost) return;
    if (this.playerData.purchasedUpgrades.includes(cardId)) return;
    this.playerData.gold -= card.cost;
    this.playerData.purchasedUpgrades.push(cardId);
    this.savePlayerData();
    this.updateShopItems();
    this.showMessage(`購買了 ${card.name}！`);
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
    const mins = Math.floor(Math.max(0, this.timeLeft) / 60);
    const secs = Math.max(0, this.timeLeft) % 60;
    this.timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  showMessage(text) {
    this.msgEl.textContent = text;
    setTimeout(() => { if (this.msgEl.textContent === text) this.msgEl.textContent = ''; }, 2500);
  }
}

// 啟動遊戲
window.addEventListener('DOMContentLoaded', () => {
  new Game(CONFIG);
});