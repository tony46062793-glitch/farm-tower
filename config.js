const CONFIG = {
  grid: { rows: 9, cols: 9, cellSize: 48 },
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
      range: 300,            // 範圍提升至 300
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
      attack: 1,             // 新增攻擊力
      attackSpeed: 2.5,      // 每秒攻擊次數
      range: 90,             // 攻擊範圍
      unlockRequirement: null,
      unlocks: 'ferretDen'
    },
    chickenCoop: {
      id: 'chickenCoop',
      name: '雞舍',
      emoji: '🐔',
      cost: { corn: 30 },
      hp: 30,
      attack: 3,             // 新增攻擊力
      attackSpeed: 1.8,
      range: 120,
      unlockRequirement: null,
      unlocks: 'dogHouse'
    },
    dogHouse: {
      id: 'dogHouse',
      name: '犬窩',
      emoji: '🐕',
      cost: { meatEgg: 25 },
      hp: 60,
      attack: 7,             // 新增攻擊力
      attackSpeed: 1,        // 每秒 1 次
      range: 200,
      effect: 'globalAttack+1',   // 全體攻擊 +1
      unlockRequirement: 'chickenCoop'
    },
    ferretDen: {
      id: 'ferretDen',
      name: '貂洞',
      emoji: '🦦',
      cost: { meat: 25 },
      hp: 60,
      attackSpeed: 0.5, 
      effect: 'globalAttack+2',
      special: '摧毀範圍內的老鼠洞',   // 主要功能
      ferretRange: 4,        // 摧毀洞的範圍（格子數）
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
    initialSpawnDelay: 2
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
    outerHoleMax: 4,
    outerHoleSpawnInterval: 8,
    innerHoleSpawnInterval: 15,
    innerHoleMax: 3,
    spawn: {
      normal: { speed: 1.0, hp: 20 },
      fast: { speed: 1.5, hp: 15 }
    },
    mouseAttack: {
      buildingDamage: 10,
      farmSteal: 5,
      attackInterval: 0.8,
      maxFarmStay: 3
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
