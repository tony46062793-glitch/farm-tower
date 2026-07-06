class Game {
  constructor(config) {
    // ... 前面不變 ...
    this.state = 'waiting';   // 改為 waiting
    // 移除這行 → this.startGame();
    this.initUI();
    // 初始顯示棋盤但還不開始
    this.renderInitialBoard();
  }

  initUI() {
    // ... 前面不變 ...
    this.btnStart = document.getElementById('btn-start');  // 新增
    this.btnStart.addEventListener('click', () => this.startGame());  // 新增

    // 移除原本的 btn-restart 綁定（如果有的話），並刪除 HTML 中的 btn-restart
  }

  // 新增：繪製初始棋盤（沒有老鼠、洞）
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
    if (this.state === 'playing') return; // 避免重複開始

    this.state = 'playing';
    this.elapsedTime = 0;
    this.killCount = 0;
    // 資源已在前置繪製時設定，可以直接沿用
    this.startTimers();

    this.btnStart.textContent = '重新開始';  // 按鈕轉變功能
    this.btnStart.removeEventListener('click', this.startGame);
    this.btnStart.addEventListener('click', () => this.restartGame());

    this.showMessage('保護農舍！老鼠會沿路破壞一切！');
  }

  // 當遊戲結束時，按鈕改回「開始遊戲」
  gameOver() {
    // ... 前面的邏輯不變 ...
    this.stopAllTimers();
    // ... 清除 ...
    this.btnStart.textContent = '開始遊戲';
    this.btnStart.removeEventListener('click', this.restartGame);
    this.btnStart.addEventListener('click', () => this.startGame());
  }

  // restartGame 也可以直接呼叫 startGame（但要重置畫面）
  restartGame() {
    this.resultModal.classList.add('hidden');
    this.stopAllTimers();
    this.renderInitialBoard();   // 重置畫面
    this.state = 'waiting';
    this.btnStart.textContent = '開始遊戲';
    // 重新綁定 startGame 事件
    this.btnStart.removeEventListener('click', this.restartGame);
    this.btnStart.addEventListener('click', () => this.startGame());
  }
}
