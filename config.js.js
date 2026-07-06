// config.js —— 所有遊戲數值、內容定義
const CONFIG = {
  grid: { rows: 7, cols: 7, cellSize: 64 }, // 7x7 格，每格 64px
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
      range: 100,        // 攻擊範圍（像素）
      attackSpeed: 1.2,  // 每秒攻擊次數
      special: '若無犬窩，有 10% 機率誤傷兔/雞/貂',
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
      unlockRequirement: 'rabbitHole'
    }
  },
  levels: [
    {
      id: 1,
      name: '初春試煉',
      duration: 300, // 5 分鐘（秒）
      initialResources: { hay: 100, corn: 80, meatEgg: 0, meat: 0 },
      // 中央 3x3 農田分佈（row 2-4, col 2-4）
      farmPlots: [
        { row: 2, col: 2, resource: 'corn' },
        { row: 2, col: 3, resource: 'hay' },
        { row: 2, col: 4, resource: 'corn' },
        { row: 3, col: 2, resource: 'hay' },
        { row: 3, col: 3, resource: 'corn' },
        { row: 3, col: 4, resource: 'hay' },
        { row: 4, col: 2, resource: 'corn' },
        { row: 4, col: 3, resource: 'hay' },
        { row: 4, col: 4, resource: 'corn' }
      ],
      spawn: {
        normal: { speed: 60, hp: 20 },   // 普通鼠：移動速度 60px/s，血量 20
        fast: { speed: 90, hp: 15 },
        interval: 3,                      // 每隔 3 秒生成一隻
        types: ['normal']                 // 本關只出普通鼠
      }
    }
  ],
  shopCards: [
    { id: 'atkUp1', name: '鋒利鷹爪', desc: '所有建築攻擊 +1', cost: 50, effect: { globalAttack: 1 } },
    { id: 'atkUp2', name: '強化巢穴', desc: '所有建築攻擊 +2', cost: 120, effect: { globalAttack: 2 } },
    { id: 'startRes', name: '豐收禮包', desc: '起始牧草、玉米各 +30', cost: 80, effect: { bonusStart: { hay: 30, corn: 30 } } }
  ]
};