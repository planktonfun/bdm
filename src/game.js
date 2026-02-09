const ATTACK_RANGE = 400;      // squared distance
const ATTACK_DAMAGE = 1;      // HP per hit
const ATTACK_SPEED = 120;      // ticks between attacks
const MOVEMENT_SPEED = 1;
const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

const eventObjectsTemplate = [
  {
    type: "HELLO", frame: 255*255*255*255, id: 255*255, from: 'client'
  },
  {
      "type": "EVENTS",
      frame: 255*255*255*255,
      "buffer": [
          {
              frame: 255*255*255*255,
              params: [
                { type: "MOVE", key: "string" },
              ]
          }
      ],
      "id": 255*255,
      "from": "client"
  }
];

// a single event from a player
const eventSchema = inferSchema(eventObjectsTemplate).items;
applyEnumSchema(eventSchema, 'from', ["client", "server"]);
const inputTypes = ["w","a", "s", "d"];
applyEnumSchema(eventSchema, 'key', inputTypes);

const stateTemplate = {
  gameState: {
      seed: 255*255*255*255,
      inputHistory: [{
          turn: 255*255*255*255,
          input: "key",
          rngState: 255*255*255*255
      }],
  },
  inputState: "key",
  seed: 255*255*255*255,
};

const stateSchema = inferSchema(stateTemplate);
stateSchema.fields.gameState.fields.inputHistory.lengthBits = 32;
// applyEnumSchema(stateSchema, 'inputState', inputTypes);
applyEnumSchema(stateSchema, 'input', inputTypes);

console.log(stateSchema);

ObjectTemplates.eventPacker = makeSerializer(eventSchema);
ObjectTemplates.statePacker = makeSerializer(stateSchema);

// Test
// console.log(stateSchema);
/*const event = {
    "seed": 123,
    "state": {
        "units": [
            {
                "key": 1,
                "value": {
                  'type': 'Tank',
                  "x": 602,
                  "y": 553,
                  "behavior": "idle",
                  "targetX": 602,
                  "targetY": 553,
                  "targetId": 0
                }
            }
        ]
    }
};

const packed = ObjectTemplates.statePacker.pack(event);
console.log(ObjectTemplates.statePacker.unpack(packed));*/


// ========== DETERMINISTIC RNG ==========
class SeededRNG {
    constructor(seed = Date.now()) {
        this.seed = seed;
        this.state = seed;
    }

    next() {
        // xorshift32
        this.state ^= this.state << 13;
        this.state ^= this.state >> 17;
        this.state ^= this.state << 5;

        // force unsigned 32-bit
        this.state >>>= 0;

        return this.state / 4294967296; // [0, 1)
    }

    int(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    choice(arr) {
        return arr[this.int(0, arr.length - 1)];
    }

    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = this.int(0, i);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}

// ========== GAME STATE ==========
class GameState {
    constructor(seed) {
        this.seed = seed || Date.now();
        this.rng = new SeededRNG(this.seed);
        this.turn = 0;
        this.depth = 1;
        this.player = {
            x: 0,
            y: 0,
            hp: 20,
            maxHp: 20,
            attack: 5,
            defense: 2,
            gold: 0,
            inventory: [],
            vision: 6
        };
        this.map = [];
        this.entities = [];
        this.eventLog = [];
        this.inputHistory = [];
        this.gameOver = false;
        this.victory = false;

        // Generate initial level
        this.generateLevel();
    }

    generateLevel() {
        const width  = 50;
        const height = 50;
        this.map = Array(height).fill().map(() => Array(width).fill('#'));

        // Create rooms
        const rooms = [];
        for (let i = 0; i < 5; i++) {
            const roomWidth = this.rng.int(4, 8);
            const roomHeight = this.rng.int(4, 8);
            const x = this.rng.int(1, width - roomWidth - 1);
            const y = this.rng.int(1, height - roomHeight - 1);

            rooms.push({ x, y, width: roomWidth, height: roomHeight });

            // Carve room
            for (let dy = 0; dy < roomHeight; dy++) {
                for (let dx = 0; dx < roomWidth; dx++) {
                    this.map[y + dy][x + dx] = '.';
                }
            }
        }

        // Connect rooms with corridors
        for (let i = 0; i < rooms.length - 1; i++) {
            const r1 = rooms[i];
            const r2 = rooms[i + 1];

            // Horizontal corridor
            const startX = Math.min(r1.x + Math.floor(r1.width / 2), r2.x + Math.floor(r2.width / 2));
            const endX = Math.max(r1.x + Math.floor(r1.width / 2), r2.x + Math.floor(r2.width / 2));

            for (let x = startX; x <= endX; x++) {
                this.map[r1.y + Math.floor(r1.height / 2)][x] = '.';
            }

            // Vertical corridor
            const startY = Math.min(r1.y + Math.floor(r1.height / 2), r2.y + Math.floor(r2.height / 2));
            const endY = Math.max(r1.y + Math.floor(r1.height / 2), r2.y + Math.floor(r2.height / 2));

            for (let y = startY; y <= endY; y++) {
                this.map[y][r2.x + Math.floor(r2.width / 2)] = '.';
            }
        }

        // Place player in first room
        const startRoom = rooms[0];
        this.player.x = startRoom.x + Math.floor(startRoom.width / 2);
        this.player.y = startRoom.y + Math.floor(startRoom.height / 2);

        // Clear entities for new level
        this.entities = [];

        // Place enemies
        for (let i = 0; i < this.depth + 2; i++) {
            let ex, ey;
            do {
                const room = this.rng.choice(rooms.slice(1)); // Not in starting room
                ex = room.x + this.rng.int(1, room.width - 2);
                ey = room.y + this.rng.int(1, room.height - 2);
            } while (ex === this.player.x && ey === this.player.y);

            const enemyType = this.depth > 3 ? this.rng.choice(['goblin', 'orc', 'skeleton']) : 'goblin';
            this.entities.push({
                type: 'enemy',
                enemyType,
                x: ex,
                y: ey,
                hp: enemyType === 'goblin' ? 8 : enemyType === 'orc' ? 15 : 12,
                maxHp: enemyType === 'goblin' ? 8 : enemyType === 'orc' ? 15 : 12,
                attack: enemyType === 'goblin' ? 3 : enemyType === 'orc' ? 6 : 4,
                defense: enemyType === 'goblin' ? 1 : enemyType === 'orc' ? 3 : 2,
                symbol: enemyType === 'goblin' ? 'g' : enemyType === 'orc' ? 'O' : 's'
            });
        }

        // Place items
        for (let i = 0; i < 3; i++) {
            let ix, iy;
            do {
                const room = this.rng.choice(rooms);
                ix = room.x + this.rng.int(1, room.width - 2);
                iy = room.y + this.rng.int(1, room.height - 2);
            } while (ix === this.player.x && iy === this.player.y);

            const itemType = this.rng.choice(['health', 'sword', 'armor', 'gold']);
            this.entities.push({
                type: 'item',
                itemType,
                x: ix,
                y: iy,
                symbol: itemType === 'health' ? '+' :
                      itemType === 'sword' ? '/' :
                      itemType === 'armor' ? ']' : '$',
                value: itemType === 'gold' ? this.rng.int(5, 20) : 1
            });
        }

        // Place stairs down
        const endRoom = rooms[rooms.length - 1];
        this.entities.push({
            type: 'stairs',
            x: endRoom.x + Math.floor(endRoom.width / 2),
            y: endRoom.y + Math.floor(endRoom.height / 2),
            symbol: '>'
        });

        this.logMessage(`Entered dungeon level ${this.depth}`);
    }

    logMessage(message) {
        this.eventLog.push({ turn: this.turn, message });
        if (this.eventLog.length > 50) {
            this.eventLog.shift();
        }
    }

    // ========== DETERMINISTIC UPDATE ==========
    processInput(input) {
        if (this.gameOver) return;
        if (input=="") return;

        // Record input for replay
        this.inputHistory.push({
            turn: this.turn,
            input,
            rngState: this.rng.state
        });

        this.turn++;

        let moved = false;
        const oldX = this.player.x;
        const oldY = this.player.y;

        // Move player
        switch(input) {
            case 'ArrowUp': case 'w':
                if (this.map[this.player.y - 1]?.[this.player.x] === '.') this.player.y--;
                moved = true;
                break;
            case 'ArrowDown': case 's':
                if (this.map[this.player.y + 1]?.[this.player.x] === '.') this.player.y++;
                moved = true;
                break;
            case 'ArrowLeft': case 'a':
                if (this.map[this.player.y]?.[this.player.x - 1] === '.') this.player.x--;
                moved = true;
                break;
            case 'ArrowRight': case 'd':
                if (this.map[this.player.y]?.[this.player.x + 1] === '.') this.player.x++;
                moved = true;
                break;
            case ' ': // Wait
                this.logMessage("You wait...");
                break;
            case 'p': // Pick up
                this.pickupItem();
                break;
        }

        // Check for entity collisions
        if (moved) {
            const entity = this.entities.find(e => e.x === this.player.x && e.y === this.player.y);
            if (entity) {
                this.handleEntityCollision(entity);
                // Move back if collided with enemy
                if (entity.type === 'enemy') {
                    this.player.x = oldX;
                    this.player.y = oldY;
                }
            }
        }

        // Process enemy turns if player moved
        if (moved) {
            this.processEnemyTurns();
        }

        // Check game over
        if (this.player.hp <= 0) {
            this.gameOver = true;
            this.logMessage("You have died!");
        }
    }

    handleEntityCollision(entity) {
        switch(entity.type) {
            case 'enemy':
                this.attackEntity(entity);
                break;
            case 'item':
                this.pickupItem(entity);
                break;
            case 'stairs':
                this.depth++;
                this.logMessage(`Descending to level ${this.depth}...`);
                this.generateLevel();
                break;
        }
    }

    attackEntity(enemy) {
        const damage = Math.max(1, this.player.attack - enemy.defense + this.rng.int(-1, 1));
        enemy.hp -= damage;
        this.logMessage(`You hit the ${enemy.enemyType} for ${damage} damage!`);

        if (enemy.hp <= 0) {
            this.entities = this.entities.filter(e => e !== enemy);
            const gold = this.rng.int(1, 5);
            this.player.gold += gold;
            this.logMessage(`You killed the ${enemy.enemyType} and found ${gold} gold!`);
        }
    }

    pickupItem(item = null) {
        if (!item) {
            item = this.entities.find(e =>
                e.type === 'item' &&
                Math.abs(e.x - this.player.x) <= 1 &&
                Math.abs(e.y - this.player.y) <= 1
            );
        }

        if (item && item.type === 'item') {
            this.entities = this.entities.filter(e => e !== item);

            switch(item.itemType) {
                case 'health':
                    const heal = this.rng.int(3, 8);
                    this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
                    this.logMessage(`You drink a healing potion and recover ${heal} HP!`);
                    break;
                case 'sword':
                    this.player.attack += 2;
                    this.logMessage("You equip a better sword! (+2 attack)");
                    break;
                case 'armor':
                    this.player.defense += 2;
                    this.logMessage("You equip better armor! (+2 defense)");
                    break;
                case 'gold':
                    this.player.gold += item.value;
                    this.logMessage(`You pick up ${item.value} gold!`);
                    break;
            }
        }
    }

    processEnemyTurns() {
        this.entities
            .filter(e => e.type === 'enemy')
            .forEach(enemy => {
                // Simple AI: move toward player if adjacent
                const dx = this.player.x - enemy.x;
                const dy = this.player.y - enemy.y;

                if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
                    // Attack if adjacent
                    const damage = Math.max(1, enemy.attack - this.player.defense + this.rng.int(-1, 1));
                    this.player.hp -= damage;
                    this.logMessage(`The ${enemy.enemyType} hits you for ${damage} damage!`);
                } else if (Math.abs(dx) + Math.abs(dy) < 8) {
                    // Move toward player
                    let newX = enemy.x;
                    let newY = enemy.y;

                    if (Math.abs(dx) > Math.abs(dy)) {
                        newX += dx > 0 ? 1 : -1;
                    } else {
                        newY += dy > 0 ? 1 : -1;
                    }

                    // Check if move is valid
                    if (this.map[newY]?.[newX] === '.' &&
                        !this.entities.find(e => e.x === newX && e.y === newY && e !== enemy) &&
                        !(newX === this.player.x && newY === this.player.y)) {
                        enemy.x = newX;
                        enemy.y = newY;
                    }
                }
            });
    }

    // ========== STATE SERIALIZATION ==========
    serialize() {
        return {
            seed: this.seed,
            inputHistory: structuredClone(this.inputHistory),
        };
    }

    loadState() {

    }

    deserialize(data) {
        this.seed = data.seed;
        this.turn = data.turn;
        this.depth = data.depth;
        this.player = data.player;
        this.map = data.map;
        this.entities = data.entities;
        this.eventLog = data.eventLog;
        this.inputHistory = data.inputHistory;
        this.gameOver = data.gameOver;
        this.victory = data.victory;

        // Recreate RNG with same state
        this.rng = new SeededRNG(this.seed);
        this.rng.state = data.rngState;

        return this;
    }

    // For replay functionality
    static replayFromStart(data) {
        // Create fresh game with same seed
        const replayGame = new GameState(data.seed);

        // Replay all inputs
        for (const inputEvent of data.inputHistory) {
            replayGame.rng.state = inputEvent.rngState;
            replayGame.processInput(inputEvent.input);
        }

        return replayGame;
    }
}

class Game {
  random() {
    var x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }

  constructor({canRender=true, speedUpRate=1}) {
    this.serializer = ObjectTemplates.statePacker;
    this.speedUpRate = speedUpRate;
    this.latestState = null;
    this.canRender = canRender;

    // States
    this.seed = 123;
    this.gameState = new GameState(this.seed);
    this.inputState = "";

    this.lastInputWithChecksum = "";
    this.frame = 0;
    this.stateHistory = {};
    this.saveState(0);
  }

  // Simulation logic
  // { id: 255*255, type: "CREATE", x: 255*255, y: 255*255 },
  // { id: 255*255, type: "MOVE",   targetX: 255*255, targetY: 255*255 },
  // { id: 255*255, type: "ATTACK", targetId: 255*255 },
  applyCommand(event) {
    if (event.type === "MOVE") {
      this.inputState = event.key; // w, a, s, d
    }
  }

  // Render grid using ImageData for batching
  render () {
    if(!this.canRender) return;

    const units = [];
    let ids = 0;
    const { player, map, entities } = this.gameState;

    units.push({ key: `player_${ids++}`,  value: {type: "Player", ...player } });

    let display = '';

    for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < map[y].length; x++) {
            // Check if position is visible
            const distance = Math.sqrt(Math.pow(x - player.x, 2) + Math.pow(y - player.y, 2));
            const isVisible = distance <= player.vision;

            let char = map[y][x];
            let color = '#333';

            if (isVisible) {
                color = char === '#' ? '#666' : '#ccc';

                // Check for entities
                const entity = entities.find(e => e.x === x && e.y === y);
                if (entity) {
                    char = entity.symbol;
                    color = entity.type === 'enemy' ? '#ff6666' :
                            entity.type === 'item' ? '#ffff66' : '#66ffff';
                } else if (x === player.x && y === player.y) {
                    char = '@';
                    color = '#33ff33';
                }
            } else if (map[y][x] === '.') {
                char = ' ';
            }

            switch(char) {
              // case "#": units.push({ key: ids++,  value: {type: "Wall", x, y } }); break;
              case '+': units.push({ key: `item_${ids++}`,  value: {type: "Item", x, y } }); break;
              case '/': units.push({ key: `item_${ids++}`,  value: {type: "Item", x, y } }); break;
              case ']': units.push({ key: `item_${ids++}`,  value: {type: "Item", x, y } }); break;
              case '$': units.push({ key: `item_${ids++}`,  value: {type: "Item", x, y } }); break;
              case '>': units.push({ key: `portal_${ids++}`,  value: {type: "Portal", x, y } }); break;
              case 'g': units.push({ key: `enemy_${ids++}`,  value: {type: "Enemy", x, y } }); break;
              case 'O': units.push({ key: `enemy_${ids++}`,  value: {type: "Enemy", x, y } }); break;
              case 's': units.push({ key: `enemy_${ids++}`,  value: {type: "Enemy", x, y } }); break;
              // case "@": break;
              case " ": units.push({ key: `path_${ids++}`,  value: {type: "Wall", x, y } }); break;
              case ".": units.push({ key: `path_${ids++}`,  value: {type: "Wall", x, y } }); break;
            }
        }
    }

    globalThis.logicState = units;
  }

  step(inputs) {
    let inputsApplied = false;

    this.inputState = "";
    for(const player in inputs) {
      const input = inputs[player];
      if(!input) continue;

      input.forEach(event=>{
        this.applyCommand(event);
      });
      // this.gameState.processInput(this.inputState);
      inputsApplied = true;
    }

    if(inputsApplied) {
      this.lastInputWithChecksum = `() Inputs applied at ${this.frame} checksum ${this.checksum()}`;
    }

/*
    // Tick order (VERY IMPORTANT)
    1. Apply commands
    2. Movement
    3. Combat
    4. Death cleanup
*/
    // for (var i = 0; i < this.speedUpRate; i++) {
      this.gameState.processInput(this.inputState);
    // }
  }

  hashString(handle) {
    const str = String(handle); // works with numbers or strings like "5e-324"
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash); // Ensure positive integer
  }

  checksum() {
    return this.hashString(JSON.stringify(this.stateHistory[this.frame % 300]));
  }

  convertMapToArrayOfObjects(mapObj) {
    if(mapObj.size == 0) return {};

    return Array.from(mapObj, ([key, value]) => ({ key, value }));
  }

  convertArrayOfObjectsToMap(arrayOfObjects) {
    return new Map(arrayOfObjects.map(item => [item.key, item.value]));
  }

  packWithChecks(payload) {
    const packed = this.serializer.pack(payload);
    const unpacked = this.serializer.unpack(packed);

    if(!deepEqual(unpacked, payload) ) {
      console.log(this.frame, unpacked, payload);
      debugger;
      throw new Error('not equal');
    }

    return packed;
  }

  saveState(frame) {
    const payload = {
      gameState: this.gameState.serialize(),
      inputState: this.inputState,
      seed: this.seed,
    };

    this.stateHistory[frame % 300] = this.packWithChecks(payload);

    this.latestSavedFrame = frame;
  }

  loadState(frame) {
    if (this.stateHistory[frame % 300]) {
      this.frame = frame;

      const state = this.serializer.unpack(this.stateHistory[frame % 300]);
      this.inputState = state.inputState;
      this.seed = state.seed;
      this.gameState = GameState.replayFromStart(state.gameState);
    } else {
      console.warn(`No state found for frame ${frame}`);
    }
  }

  getLatestState() {
    // create latest state for export
    const state = this.stateHistory[this.latestSavedFrame % 300];
    return Array.from(state);
  }

  reset(frame, state) {
    this.lastInputWithChecksum = "";
    this.frame = frame;
    this.stateHistory[frame % 300] = new Uint8Array(state);
    this.loadState(frame);
  }


  advance(inputs) {
    this.step(inputs);
    this.frame++;
    this.saveState(this.frame);
  }
}

globalThis.Game = Game;