class RollbackManager {
  constructor({numPlayers, performanceBoost=false, bufferDelay=0, spectatorMode=false, maxFrameAdvantage = 8, isServer = false}) {
    this.localFrame = 0;
    this.syncFrame = 0;
    this.numPlayers = numPlayers;
    this.maxFrameAdvantage = maxFrameAdvantage;
    this.inputHistory = {};
    this.predictedInputs = {};
    this.lastKnownInputs = Array(numPlayers).fill(null);
    this.remoteFrames = Array(numPlayers).fill(0);
    this.remoteFrames[0] = this.localFrame; // Local player
    this.alwaysRollback = true; // always rollback even with local inputs
    this.pauseToWaitForRemote = false; // false if you don't want to wait for players input
    this.enableInputPrediction = false; // will use last known input when given null
    this.pausedFor = 0; // custom implementation of pause
    this.bufferDelay = bufferDelay;
    this.fullRollback = false;
    this.processedFrames = [];
    this.broadcastMessages = [];

    // boosts performance but doesn't work on all games
    if(performanceBoost) {
        this.alwaysRollback = false;
    }

    this.__setupInputSender();

    if(!spectatorMode && !isServer) {
        this.__setupFrameSyncPolling();
        // this.__setupKeyBindings();
    }
  }

  reset(frame) {
    this.localFrame = frame;
    this.syncFrame = frame;
    this.inputHistory = {};
    this.predictedInputs = {};
  }

  doFullRollback() {
    this.fullRollback = true;
  }

  addLocalInput(playerId, frame, input) {
    if (playerId !== 0) return; // Only player 0 is local
    if (!this.inputHistory[frame]) this.inputHistory[frame] = {};

    // no overwrites!
    if(this.inputHistory[frame][playerId]) return;
    // console.log(this.inputHistory[frame][playerId]);

    this.inputHistory[frame][playerId] = input;
    this.lastKnownInputs[playerId] = input;
    this.remoteFrames[0] = Math.max(this.remoteFrames[0], frame);

    // attempt rollback
    if (this.localFrame > frame) {
        this.syncFrame = Math.min(this.syncFrame, frame-1);
    }

    // always rollback once
    if (this.alwaysRollback && this.syncFrame >= this.localFrame) {
        this.syncFrame = Math.min(this.syncFrame, this.localFrame-1);
    }

    this.processedFrames.push(frame);
  }

  receiveRemoteInput(playerId, frame, input) {
    if (playerId === 0) return; // Player 0 is local

    if (!this.inputHistory[frame]) this.inputHistory[frame] = {};

    // no overwrites!
    if(this.inputHistory[frame][playerId]) return;
    // console.log(this.inputHistory[frame][playerId]);

    this.inputHistory[frame][playerId] = input;
    this.lastKnownInputs[playerId] = input;
    this.remoteFrames[playerId] = Math.max(this.remoteFrames[playerId], frame);

    // Check prediction
    if (this.predictedInputs[frame] && this.predictedInputs[frame][playerId] !== undefined) {
      if (this.predictedInputs[frame][playerId] !== input) {
        this.syncFrame = Math.min(this.syncFrame, frame);
      }
    }

    this.processedFrames.push(frame);
  }

  getNextCommand() {
    if (this.fullRollback) {
      this.fullRollback = false;
      const result = { type: "rollback", frame: 0 };
      return result;
    }

    if (this.localFrame > this.syncFrame && this.processedFrames.length > 0) {

        this.processedFrames.sort();
        const scopy = [...this.processedFrames ];
        const result = { type: "rollback", frame: scopy[0] };
        this.processedFrames=[];

        this.syncFrame = this.localFrame;
        return result;
    }

    // if remote don't send anything in maxFrameAdvantage(8) frames pause it
    if(this.pauseToWaitForRemote) {
        const minRemoteFrame = Math.min(...this.remoteFrames);
        const frameAdvantage = this.localFrame - minRemoteFrame;

        // console.log(this.localFrame, minRemoteFrame);

        if (frameAdvantage > this.maxFrameAdvantage) {
          return { type: "pause" };
        }
    }

    const inputs = Array(this.numPlayers).fill(null);
    for (let i = 0; i < this.numPlayers; i++) {
      if (this.inputHistory[this.localFrame] && this.inputHistory[this.localFrame][i]) {
        inputs[i] = this.inputHistory[this.localFrame][i];
      } else {
        if(this.enableInputPrediction) {
            inputs[i] = this.lastKnownInputs[i] || null;
        } else {
            inputs[i] = null;
        }
        if (i !== 0) {
          if (!this.predictedInputs[this.localFrame]) {
            this.predictedInputs[this.localFrame] = {};
          }
          this.predictedInputs[this.localFrame][i] = inputs[i];
        }
      }
    }

    if(this.processedFrames.indexOf(this.localFrame) > -1) {
        this.processedFrames.splice(this.processedFrames.indexOf(this.localFrame), 1);
    }

    this.localFrame++;
    this.syncFrame = this.localFrame;

    return { type: "normal", inputs };
  }

  // Added method to update syncFrame after rollback
  afterRollback() {
    this.syncFrame = this.localFrame;
  }

  isPaused() {
    if(this.pausedFor > 0) {
      this.pausedFor--;
      return true;
    }
    return false;
  }

  handleRecievedMessage(clientId, clientType, msg) {
    if(clientId == msg.id) return;
    if(clientType == "client" && msg.from == "client") {
        return;
    }

     // if(clientType == "server" && msg.from == "client") {
       // bc.postMessage({...msg, from: clientType});
       // return;
     // }

     switch(msg.type) {
        case "HELLO": // frame check every second, pause if you are ahead
            // console.log('HELLO')
            // if(this.localFrame - msg.frame > 100) this.pausedFor = Math.max(this.pausedFor, this.localFrame - msg.frame);
        break;
        case "EVENTS":
            msg.buffer.forEach(event=>{
                this.receiveRemoteInput(1, event.frame, event.params);
            });
        break;
    }
  }

  __setupFrameSyncPolling() {
    // frame sync check every second
    setInterval(()=>{
        this.broadcastMessages.push({ type: "HELLO", frame: this.localFrame });
    }, 1000);
  }

  __setupInputSender() {
    const buffer = new Map();
    const sentFrames = new Set();

    this.sendInput = (inputThisFrame, additionalDelay=0) => {
        // overwrite same frames to latest
        const key = this.localFrame+additionalDelay+this.bufferDelay;

        if(!sentFrames.has(key)) {
            buffer.set(key, inputThisFrame);
            sentFrames.add(key);
        }
    }

    // send interval every 0.5 second
    setInterval(()=>{

        if(buffer.size == 0) return;

        const accepted = [];

        buffer.forEach((buff, key)=>{
            this.addLocalInput(0, key, buff);
            accepted.push({
                frame: key,
                params: buff
            });
        });

        this.broadcastMessages.push({ type: "EVENTS", buffer: accepted });

        buffer.clear();

    }, 32);
  }

  __setupKeyBindings() {
    let buttons = {};
    let buttonType = "";

    document.addEventListener('mousemove', e=>{
        if(!buttons["MOUSE"]) return;
        const {x,y} = game.get2DMouse(e);
        this.sendInput({buttonType, x, y});
    });

    document.addEventListener('mousedown', e=>{
        switch(e.button) {
            case 0: buttonType="MOUSELEFT"; break;
            case 1: buttonType="MOUSEMIDDLE"; break;
            case 2: buttonType="MOUSERIGHT"; break;
        }
        if(buttons["MOUSE"]) return;
        if(!buttons["MOUSE"]) buttons["MOUSE"] = true;
        const {x,y} = game.get2DMouse(e);
        this.sendInput({buttonType, x, y});
    });

    document.addEventListener('mouseup', e=>{
        delete buttons["MOUSE"];
        this.sendInput({buttonType:"MOUSE_UP", x:0, y:0}, 1);
    });

    document.addEventListener('keydown', e => {
        if(buttons[e.code]) return;
        if(!buttons[e.code]) buttons[e.code] = true;
        this.sendInput({buttonType: e.code + "_DOWN"});
    });

    document.addEventListener('keyup', e => {
        delete buttons[e.code];
        this.sendInput({buttonType: e.code + "_UP"}, 1);
    });
  }
}

globalThis.RollbackManager = RollbackManager;
/*// Simple assertion function for testing
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test Case: Rollback Due to Misprediction
function testRollbackDueToMisprediction() {
  console.log("Running Test: Rollback Due to Misprediction");

  const manager = new RollbackManager(2, true, 3, true);

  // Frame 0: Local input, predict remote
  manager.addLocalInput(0, 0, "move_left");
  let command = manager.getNextCommand();
  assert(command.type === "normal", "Frame 0 should return 'normal'");
  assert(command.inputs[0] === "move_left" && command.inputs[1] === null,
    "Frame 0 inputs should be {0: 'move_left', 1: null}");

  // Frame 1: Local input, predict remote
  manager.addLocalInput(0, 1, "move_right");
  command = manager.getNextCommand();
  assert(command.type === "normal", "Frame 1 should return 'normal' actual:" + command.type);
  assert(command.inputs[0] === "move_right" && command.inputs[1] === null,
    "Frame 1 inputs should be {0: 'move_right', 1: null}");

  // Receive remote input for Frame 0 that mismatches prediction
  manager.receiveRemoteInput(1, 0, "jump"); // Predicted null, actual "jump"
  assert(manager.syncFrame === 0, "syncFrame should be set to 0 due to misprediction");

  // Frame 2: Should trigger rollback
  manager.addLocalInput(0, 2, "punch");
  command = manager.getNextCommand();
  assert(command.type === "rollback" && command.frame === 0,
    "Frame 2 should return 'rollback' to frame 0");

  // Simulate game handling rollback (replay from frame 0 to 2)
  // After replaying, call afterRollback
  manager.afterRollback();

  // Frame 3: Should proceed normally
  command = manager.getNextCommand();
  assert(command.type === "normal", "Frame 3 should return 'normal' after rollback");
  assert(manager.enableInputPrediction == false || command.inputs[0] === "punch" && command.inputs[1] === "jump",
    "Frame 3 inputs should be {0: 'punch', 1: 'jump'} actual " + JSON.stringify(command.inputs));

  console.log("Test Passed: Rollback Due to Misprediction");
}

// Run the test
try {
  testRollbackDueToMisprediction();
} catch (e) {
  console.error(e.message);
}*/