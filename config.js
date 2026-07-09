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
    owlPerch: { id:'owlPerch', name:'棲架', emoji:'🦉', cost:{hay:20}, hp:50, attack:5, range:200, attackSpeed:1.2, special:'若無犬窩，有10%機率誤傷兔/雞/貂', unlockRequirement:null },
    rabbitHole: { id:'rabbitHole', name:'兔穴', emoji:'🐇', cost:{hay:30}, hp:30, attack:1, attackSpeed:2.5, range:90, unlockRequirement:null, unlocks:'ferretDen' },
    chickenCoop: { id:'chickenCoop', name:'雞舍', emoji:'🐔', cost:{corn:30}, hp:30, attack:3, attackSpeed:1.8, range:120, unlockRequirement:null, unlocks:'dogHouse' },
    dogHouse: { id:'dogHouse', name:'犬窩', emoji:'🐕', cost:{meatEgg:25}, hp:60, attack:7, attackSpeed:1, range:150, effect:'globalAttack+1', unlockRequirement:'chickenCoop' },
    ferretDen: { id:'ferretDen', name:'貂洞', emoji:'🦦', cost:{meat:25}, hp:60, attack:0, attackSpeed:0.5, range:400, effect:'globalAttack+2', special:'每0.5秒摧毀範圍4格內的一個鼠洞', ferretRange:4, unlockRequirement:'rabbitHole' }
  },
  farmhouse: { emoji:'🏠', hp:200, damagePerMouse:10 },
  mouseHole: { emoji:'🕳️', hp:30, spawnInterval:5, initialSpawnDelay:2 },
  infiniteLevel: {
    initialResources: { hay:100, corn:80, meatEgg:0, meat:0 },
    initialGold: 0,
    farmPlots: [
      { row:3, col:3, resource:'corn' }, { row:3, col:4, resource:'hay' }, { row:3, col:5, resource:'corn' },
      { row:4, col:3, resource:'hay' }, { row:4, col:5, resource:'hay' },
      { row:5, col:3, resource:'corn' }, { row:5, col:4, resource:'hay' }, { row:5, col:5, resource:'corn' }
    ],
    farmhouse: { row:4, col:4 },
    outerHoleMax: 4, outerHoleSpawnInterval: 8, innerHoleSpawnInterval: 15, innerHoleMax: 3,
    spawn: { normal: { speed:0.5, hp:20 }, fast: { speed:0.75, hp:15 } },
    mouseAttack: { buildingDamage:10, farmSteal:5, attackInterval:0.8, maxFarmStay:3 },
    difficultyScale: { hpIncreasePerMinute:2, speedIncreasePerMinute:0.3 }
  },
  farming: {
    hay: { name:'種植牧草', emoji:'🌿', cost:10, perSecond:1, resource:'hay' },
    corn: { name:'種植玉米', emoji:'🌽', cost:20, perSecond:1, extraGold:1, resource:'corn' }
  },
  shopCards: [
    { id:'buy_hay', name:'購買牧草', desc:'獲得 20 牧草', cost:10, type:'resource', effect:{ hay:20 } },
    { id:'buy_corn', name:'購買玉米', desc:'獲得 20 玉米', cost:10, type:'resource', effect:{ corn:20 } },
    { id:'buy_meatEgg', name:'購買肉蛋', desc:'獲得 10 肉蛋', cost:20, type:'resource', effect:{ meatEgg:10 } },
    { id:'buy_meat', name:'購買肉食', desc:'獲得 10 肉食', cost:20, type:'resource', effect:{ meat:10 } },
    { id:'atkUp1', name:'鋒利鷹爪', desc:'所有建築攻擊 +1', cost:50, type:'upgrade', effect:{ globalAttack:1 } },
    { id:'atkUp2', name:'強化巢穴', desc:'所有建築攻擊 +2', cost:120, type:'upgrade', effect:{ globalAttack:2 } },
    { id:'startRes', name:'豐收禮包', desc:'起始牧草、玉米各 +30', cost:80, type:'upgrade', effect:{ bonusStart:{ hay:30, corn:30 } } },
    { id:'win_pass', name:'通關證明', desc:'花費 100 金幣，即時勝利！', cost:100, type:'upgrade', effect:{ win:true } }
  ]
};
