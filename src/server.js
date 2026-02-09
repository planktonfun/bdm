// Connect to channel "test_channel"
const crypto = require('crypto');
require('./WSBroadcastChannelModule');
require('./bitpacking.js');
require('./binary-packet-generator.js');
require('./object-templates.js');
require('./file-manager.js');
require('./game.js');
require('./packet-handler.js');
require('./log-writer.js');
require('./log-reader.js');
require('./game-settings.js');
require('./rollback-manager.js');
require('./checkpoint-helper.js');

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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Create checkpoint from event logs
async function start(result) {
    const {checkpointFileName, maximumFrame} = result;

    globalThis.rollbackManager = new RollbackManager({
      numPlayers:2,
      performanceBoost:true,
      bufferDelay: INPUT_LATENCY_FRAMES,
      spectatorMode:false,
      isServer:true,
    }); // For 2 players

    rollbackManager.reset(maximumFrame);

    await sleep(3);

    // save checkpoint periodically (using events)
    setInterval(()=>{
        console.log("Saving checkpoint (checkpoint)");
        const serverTick = rollbackManager.localFrame;
        const checkpoint = clientPackers[OperationFunctions.indexOf('RESET')].pack({
            id: 1,
            frame: serverTick+CLIENT_TICK_AHEAD,
            state: game.getLatestState()
        });
        overWriteFile(checkpointFileName, checkpoint);
        console.log("Saving checkpoint (events)");
        flushToDisk();
    }, 10000);

    // for debugging
    setInterval(()=>{
        console.log("bytes recieved per sec: ", (totalBytesRecieved/totalRecievedCount).toFixed(2));
        console.log("bytes sent per sec: ", (totalBytesSent/totalSentCount).toFixed(2));
        console.log({tick: rollbackManager.localFrame});

        totalBytesRecieved = 0;
        totalRecievedCount = 0;
        totalBytesSent = 1;
        totalSentCount = 1;
    }, 1000);


    // Handle recieved messages
    sp.registerHandler(OperationFunctions.indexOf('PLAYER_EVENT'), async (opCode, data) => {

        // check if it has been seen already
        // if(!make(data)) return;

        const serializer = clientPackers[opCode];
        const event = serializer.unpack(data);  // returns reconstructed object

        const serverTick = rollbackManager.localFrame;
        const clientTick = event.frame;

        if (serverTick >= clientTick || Math.abs(clientTick - serverTick) > (CLIENT_TICK_AHEAD*2) ) {
            console.log(`[SERVER] Rejected Event`, {serverTick, clientTick, diff: Math.abs(clientTick - serverTick)});

            sendPacket('RESET', {
                id: event.id,
                frame: serverTick+CLIENT_TICK_AHEAD,
                state: game.getLatestState()
            });

            return false;
        }

        // console.log('PROCESS EVENT');
        rollbackManager.handleRecievedMessage(clientId, clientType, event);
        fastWriteBinary(data);

        event.from=clientType;
        sendPacket('SERVER_EVENT', event);

        return true;
    });

    console.log('Server is ready.')

}

loadLatestStateFromEvents(start); // slow start but accurate
// loadLatestStateFromCheckpoint(start); // fast start but not accurate
