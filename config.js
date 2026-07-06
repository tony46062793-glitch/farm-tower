const CONFIG = {
  grid: { rows: 9, cols: 9, cellSize: 64 },
  resources: {
    hay: { name: '牧草', emoji: '🌿' },
    corn: { name: '玉米', emoji: '🌽' },
    meatEgg: { name: '肉蛋', emoji: '🥚' },
    meat: { name: '肉食', emoji: '🍖' },
    gold: { name: '金幣', emoji: '💰' }
  },
  buildings: {
    owlPerch: {
      id: 'owlPerch',
      name: '棲架',
      emoji: '🦉',
      cost: { hay: 20 },
      hp: 50,
      attack: 5,
      range: 100,
      attackSpeed: 1.2,
      special: '若無犬窩，有10%機率誤傷兔/雞/貂',
      unlockRequirement: null
    },
    rabbitHole: {
      id: 'rabbitHole',
      name: '兔穴',
      emoji: '🐇',
      cost: { hay: 30 },
      hp: 30,
      attack: 0,
      unlockRequirement: null,
      unlocks: 'ferretDen'
    },
    chickenCoop: {
      id: 'chickenCoop',
      name: '雞舍',
      emoji: '🐔',
      cost: { corn: 30 },
      hp: 30,
      attack: 0,
      unlockRequirement: null,
      unlocks: 'dogHouse'
    },
    dogHouse: {
      id: 'dogHouse',
      name: '犬窩',
      emoji: '🐕',
      cost: { meatEgg: 25 },
      hp: 60,
      attack: 0,
      effect: 'globalAttack+2',
      unlockRequirement: 'chickenCoop'
    },
    ferretDen: {
      id: 'ferretDen',
      name: '貂洞',
      emoji: '🦦',
      cost: { meat: 25 },
      hp: 60,
      attack: 0,
      effect: 'globalAttack+2',
      special: '摧毀範圍內的老鼠洞',
      ferretRange: 2,
      unlockRequirement: 'rabbitHole'
    }
  },
  farmhouse: {
    emoji: '🏠',
    hp: 200,
    damagePerMouse: 10
  },
  mouseHole: {
    emoji: '🕳️',
    hp: 30,
    spawnInterval: 5,
    initialSpawnDelay: 2,
    spawnTypes: ['normal']
  },
  infiniteLevel: {
    initialResources: { hay: 100, corn: 80, meatEgg: 0, meat: 0 },
    initialGold: 0,
    farmPlots: [
      { row: 3, col: 3, resource: 'corn' },
      { row: 3, col: 4, resource: 'hay' },
      { row: 3, col: 5, resource: 'corn' },
      { row: 4, col: 3, resource: 'hay' },
      { row: 4, col: 5, resource: 'hay' },
      { row: 5, col: 3, resource: 'corn' },
      { row: 5, col: 4, resource: 'hay' },
      { row: 5, col: 5, resource: 'corn' }
    ],
    farmhouse: { row: 4, col: 4 },
    outerSpawnInterval: 4,
    innerHoleSpawnInterval: 15,
    innerHoleMax: 3,
    spawn: {
      normal: { speed: 1.0, hp: 20 },   // 速度降低為 1.0 格/秒
      fast: { speed: 1.5, hp: 15 }
    },
    // 老鼠攻擊參數
    mouseAttack: {
      buildingDamage: 10,         // 每次攻擊對建築的傷害
      farmSteal: 5,               // 每次偷取資源量
      attackInterval: 0.8,        // 攻擊間隔（秒）
      maxFarmStay: 3              // 在農田最多停留秒數（避免資源被偷光）
    },
    difficultyScale: {
      hpIncreasePerMinute: 2,
      speedIncreasePerMinute: 0.3
    }
  },
  resourceShop: {
    hay: { cost: 10, amount: 20 },
    corn: { cost: 10, amount: 20 },
    meatEgg: { cost: 20, amount: 10 },
    meat: { cost: 20, amount: 10 }
  },
  shopCards: [
    { id: 'atkUp1', name: '鋒利鷹爪', desc: '所有建築攻擊 +1', cost: 50, effect: { globalAttack: 1 } },
    { id: 'atkUp2', name: '強化巢穴', desc: '所有建築攻擊 +2', cost: 120, effect: { globalAttack: 2 } },
    { id: 'startRes', name: '豐收禮包', desc: '起始牧草、玉米各 +30', cost: 80, effect: { bonusStart: { hay: 30, corn: 30 } } }
  ]
};
