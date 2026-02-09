

// Full object definition (dont modify, append only)
globalThis.eventObjectsTemplate = [
  {tick: 65025, type: 'CHANGE_TARGET', playerId: 65025, targetId: 65025 },
  {tick: 65025, type: 'REMOVE_TARGET', playerId: 65025 },
  {tick: 65025, type: 'MOVE', tileX: 255, tileY: 255, playerId: 65025 },
  {tick: 65025, type: 'SPAWN', tileX: 255, tileY: 255, playerId: 65025 },
  {tick: 65025, type: 'DEATH', playerId: 65025 },
  {tick: 65025, type: 'ATTACK', playerId: 65025 },
  {tick: 65025, type: 'SKILL', playerId: 65025 },
  {tick: 65025, type: 'EQUIP', playerId: 65025, itemType: 65025 },
  {tick: 65025, type: 'USE_ITEM', playerId: 65025, itemType: 65025 },
  {tick: 65025, type: 'PICK_ITEM', playerId: 65025, itemType: 65025},
  {tick: 65025, type: 'INCREASE_ATTRIBUTE', playerId: 65025, attributeId: 255, amount: 255 },
  {tick: 65025, type: 'EAT', playerId: 65025 },
  {tick: 65025, type: 'POOP', playerId: 65025 },
];

globalThis.spriteObjectsTemplate = [
  {type: 'PLAYER', tileX: 255, tileY: 255, playerType: 255, id: 65025 },
  {type: 'NPC',    tileX: 255, tileY: 255, npcType: 255, id: 60525 },
  {type: 'ITEM',   tileX: 255, tileY: 255, itemType: 65025, id: 65025 },
  {type: 'MOBS',   tileX: 255, tileY: 255, health: 65025, mobType: 255, id: 65025 },
  {type: 'ORE',    tileX: 255, tileY: 255, health: 65025, oreType: 255, id: 65025 },
];

// Enums
globalThis.EventTypes = eventObjectsTemplate.map(e=>{return e.type});

globalThis.SpriteTypes = [
  "PLAYER",
  "MOBS",
  "NPC",
  "ITEM",
  "ORE",
];

globalThis.MessageTypes = [
  "GLOBAL",
  "PRIVATE",
];