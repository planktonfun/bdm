
class SchemaInterface {
  static HEADER = "";
  static TYPES = [];
  static schema = {};
  static default = {};

  static createPacket(param) {}
  static loadPacket(param) {}
}

// 1 byte header used for to distinguish different schema types
const SCHEMATYPE = [
  'REGISTER',
  'COMMAND',
  'CLIENTSTATE',
  'ERROR',
  'OTHER_PLAYERS',
  'PLAYERNAME_LIST',
];

// Data that is sent from client to server
class RegisterSchema {
  static HEADER = "REGISTER";
  static TYPES = [];
  static schema = {
    clientID: 10000,
  };
  static default = {
    clientID: 10000,
  };

  static createPacket(clientID) {
    const state = {...this.default};
    state.clientID=clientID;
    return prependOneByteHeader(
      SCHEMATYPE.indexOf(this.HEADER),
      GameStateCompressor.compress(state, this.schema)
    );
  }

  static loadPacket(raw) {
    const state = GameStateCompressor.decompress(raw, this.schema);
    return state;
  }
}

class CommandSchema {

  static HEADER = 'COMMAND';

  static TYPES = [
    'attack',
    'run',
    'heal',
    'equip',
    'explore',
    'escape',
  ];

  static TARGETS = [
    'player',
    'enemy',
    'team',
  ];

  static schema = {
    id: 10000, // must be static not declared (the server will know who its coming from)
    buttons: {
      up: 1, down: 1,
      left: 1, right: 1,
      z: 1, x: 1,
      c: 1
    },
    mousePositionPercent: {
      x: 100, y: 100,
    },
    explicitCommandId: this.TYPES.length,
    targetId: this.TARGETS.length,
  };

  static default = {
    id: 123, // must be static not declared (the server will know who its coming from)
    buttons: {
      up: 0, down: 0,
      left: 0, right: 0,
      z: 0, x: 0,
      c: 0
    },
    mousePositionPercent: {
      x: 50, y: 90,
    },
    explicitCommandId: this.TYPES.indexOf('attack'),
    targetId: this.TARGETS.indexOf('enemy'),
  };

  static createPacket(playerId, type) {
    if(this.TYPES.indexOf(type) == -1) {
      throw new Error(`Unknown Command: ${type}`);
    }

    const state = {...this.default};
    state.id=playerId;
    state.explicitCommandId = this.TYPES.indexOf(type);

    return prependOneByteHeader(
      SCHEMATYPE.indexOf(this.HEADER),
      GameStateCompressor.compress(state, this.schema)
    );
  }

  static loadPacket(raw) {
    const state = GameStateCompressor.decompress(raw, this.schema);
    return state;
  }
}

// Data that is sent from server to client and to other players
// schema values are maximum range integer
// you can save a lot of data by making a lot of unlocking system and then compute stats from unlocked

class PrivatePlayerSchema {
  static HEADER = 'CLIENTSTATE';

  static TYPES = [];

  static schema = {
    id: 10000,
    clientID: 10000,
    health: 100,
    mana: 100,
    stamina: 100,
    position: { x: 255, y: 255 },
    hasSword: 1,
    hasShield: 1,
    hasPotion: 1,
    level: 31,
    exp: 10000,
  };

  static default = {
    id: 1,
    clientID: 1,
    health: 100,
    mana: 100,
    stamina: 100,
    position: { x: 0, y: 0 },
    hasSword: false,
    hasShield: false,
    hasPotion: false,
    level: 1,
    exp: 0,
  };

  static createPacket(player, clientId) {
    const state = {...this.default};

    for(var prop in this.schema) {
      if(player.state[prop] != undefined)
        state[prop] = player.state[prop];
    }

    state.clientID = clientId;

    return prependOneByteHeader(
      SCHEMATYPE.indexOf(this.HEADER),
      GameStateCompressor.compress(state, this.schema)
    );
  }

  static loadPacket(raw) {
    return GameStateCompressor.decompress(raw, this.schema);
  }
}

class PublicPlayerSchema {
  static HEADER = 'OTHER_PLAYERS';
  static TYPES = [];

  static schema = {
    id: 10000,
    level: 31,
    position: { x: 255, y: 255 },
  };

  static default = {
    id: 1,
    level: 1,
    position: { x: 0, y: 0 },
  };

  static createPacket(players) {
    const compressedArray = [];

    players.forEach((player, id)=>{
      const state = {...this.default};

      for(var prop in this.schema) {
        if(player.state[prop] != undefined)
          state[prop] = player.state[prop];
      }

      compressedArray.push(GameStateCompressor.compress(state, this.schema));
    });

    return prependOneByteHeader(SCHEMATYPE.indexOf(this.HEADER), packFixedArray(compressedArray));
  }

  static loadPacket(raw) {
    return unpackFixedArray(raw).map(playerData => {
      const player = new Player();
      player.state = GameStateCompressor.decompress(playerData, this.schema);
      return player.toJSObject();
    });
  }
}

class ErrorSchema {

  static HEADER = 'ERROR';

  static TYPES = [
    'BLANK',
    'ALREADY_LOGGED_IN',
  ];

  static schema = {
    clientID: 10000,
    errorType:  this.TYPES.length,
  };

  static default = {
    clientID: 1,
    errorType: 0,
  };

  static createPacket(errReason, clientId) {
    if(this.TYPES.indexOf(errReason) == -1) {
      throw new Error(`Unknown Error: ${errReason} from ${clientID}`);
    }

    const state = {...this.default};
    state.clientID=clientId;
    state.errorType= this.TYPES.indexOf(errReason);

    return prependOneByteHeader(
      SCHEMATYPE.indexOf(this.HEADER),
      GameStateCompressor.compress(state, this.schema)
    );
  }

  static loadPacket(raw) {
    const state = GameStateCompressor.decompress(raw, this.schema);
    state.errorType = this.TYPES[state.errorType];
    return state;
  }
}

class PlayerNamesSchema {
  static HEADER = 'PLAYERNAME_LIST';
  static TYPES = [];

  static schema = {
    id: 10000,
    name: "Mysterious Player",
  };

  static default = {
    id: 0,
    name: "Mysterious Player",
  };

  static createPacket(players) {
    const compressedArray = [];

    players.forEach((player, id)=>{
      const state = {...this.default};

      state['id'] = player.state['id'];
      state['name'] = player['name'];

      compressedArray.push([state.id, state.name]);
    });

    return prependOneByteHeader(SCHEMATYPE.indexOf(this.HEADER), convertJSONToBinary(compressedArray));
  }

  static loadPacket(raw) {
    const playerMap = new Map();

    convertBinaryToJSON(raw).forEach(playerName => {
      playerMap.set(playerName[0], playerName[1]);
    });

    return playerMap;
  }
}

// Check which environment we are in and attach functions to the appropriate global scope
if (typeof window !== 'undefined') {
  // We are in a browser
  window.SCHEMATYPE = SCHEMATYPE;
  window.RegisterSchema = RegisterSchema;
  window.CommandSchema = CommandSchema;
  window.PrivatePlayerSchema = PrivatePlayerSchema;
  window.PublicPlayerSchema = PublicPlayerSchema;
  window.ErrorSchema = ErrorSchema;
  window.PlayerNamesSchema = PlayerNamesSchema;
} else if (typeof global !== 'undefined') {
  // We are in Node.js (CommonJS environment check)
  global.SCHEMATYPE = SCHEMATYPE;
  global.RegisterSchema = RegisterSchema;
  global.CommandSchema = CommandSchema;
  global.PrivatePlayerSchema = PrivatePlayerSchema;
  global.PublicPlayerSchema = PublicPlayerSchema;
  global.ErrorSchema = ErrorSchema;
  global.PlayerNamesSchema = PlayerNamesSchema;
}