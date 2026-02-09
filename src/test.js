// Connect to channel "test_channel"
const crypto = require('crypto');
require('./WSBroadcastChannelModule');
require('./bitpacking.js');
require('./binary-packet-generator.js');
require('./object-templates.js');
require('./file-manager.js');
require('./packet-handler.js');
require('./log-writer.js');
require('./log-reader.js');
require('./game-settings.js');
require('./rollback-manager.js');
require('./game.js');

// ****************************************************************************
// *                                  RULES:                                  *
// * - client sends only intent never state to prevent cheating (e.g. can send attack action, walk here, cant send hp/atk stats)*
// * - server can send both states and intent (e.g. your current stats, level up, etc)    *
// * - server streams events and periodically snapshots
// * - One-way data flow, separate render with game logic so server can run headless:
// * - server: INPUT → LOGIC → VARIABLES
// * - client: INPUT → LOGIC → VARIABLES → RENDER
// * - make sure logic is deterministic so we can perform an accurate rollback
// * Deterministic allows you to:
//  - Debugging becomes dramatically easier
//  - create/replay identical checkpoints
//  - replay bugs "You can literally record inputs once and replay failures years later"
//  - Time travel
//  - pause rendering
//  - can do rollbacks
//  - near-superhuman levels of reliability, debuggability, testability, and composability.
// ****************************************************************************

globalThis.clientType = 'server';
globalThis.clientId = generateUUID();
globalThis.game = new Game({
    canRender: false,
    speedUpRate: SPEEDUP_RATE,
});



// Create checkpoint from event logs
function createCheckpointFromEvents() {

    let maximumFrame = 0;
    processDataOnce('stream.log', (size,payload)=>{
        // console.log({size,payload});
        const event = clientPackers[OperationFunctions.indexOf('PLAYER_EVENT')].unpack(payload);
        console.log({event});

        if(event.type != "EVENTS") return;

        const frameEvents = new Map();

        event.buffer.forEach(e=>{
            frameEvents.set(e.frame, e.params);
            if(e.frame > maximumFrame) {
                maximumFrame = e.frame;
            }
        });

        while(game.frame <= maximumFrame) {
            let input = [null,null];
            if(frameEvents.has(game.frame)) {
                input = [null, frameEvents.get(game.frame)];
            }
            game.advance(input);
        }
    }, ()=>{
        // console.log(game.getLatestState())

        console.log("Saving checkpoint");
        const serverTick = maximumFrame;
        const checkpoint = clientPackers[OperationFunctions.indexOf('RESET')].pack({
            id: 1,
            frame: serverTick+CLIENT_TICK_AHEAD,
            state: game.getLatestState()
        });
        overWriteFile("checkpoint.log", checkpoint);
        console.log('checkpoint loaded start game loop')

        globalThis.rollbackManager = new RollbackManager({
          numPlayers:2,
          performanceBoost:true,
          bufferDelay: INPUT_LATENCY_FRAMES,
          spectatorMode:false,
          isServer:true,
        }); // For 2 players
    });

    console.log('Checkpoint is ready.')
}
