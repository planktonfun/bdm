// ****************************************************************************
// *                                  RULES:                                  *
// * - client sends only intent never state to prevent cheating (e.g. can send attack action, walk here, cant send hp/atk stats)*
// * - server can send both states and intent (e.g. your current stats, level up, etc)    *
// * - server streams events and periodically snapshots
// ****************************************************************************

function generateUUID() {
  return Math.floor(Math.random()*255*255);
}

globalThis.generateUUID = generateUUID;

// latency table
// Pro/Competitive (FPS/Fighting): <15–30 ms. Competitive players often aim for sub-20ms to ensure "instant" reactions.
// Enthusiast/Casual: <40–50 ms. At 50 ms and higher, the delay becomes noticeable to most players.
// General/Slow-paced: <100 ms. For single-player or turn-based games, higher latency is acceptable.
const LATENCY_MS = 16;
const CLIENT_TICK_AHEAD_SECONDS = 3; // acceptable drift from the server before triggering a reset
const INPUT_LATENCY_MS = 50; // compensate latency by delaying inputs (this will be felt both local and remote)
const RENDER_FPS = 60; // this depends on your game logic

// Fixed timestep to 30
const LOGIC_FPS = Math.round(1000/LATENCY_MS); // should be 30 or less so it can support all devices
const TICK_RATE = 1000 / LOGIC_FPS;
const MAX_DELTA = 100; // ms, prevents spiral of death
const INPUT_LATENCY_SECONDS = INPUT_LATENCY_MS/1000; // compensate latency by delaying inputs (this will be felt both local and remote)

let lastTime = performance.now();
let acc = 0;

globalThis.SPEEDUP_RATE = Math.round(RENDER_FPS/LOGIC_FPS);
globalThis.CLIENT_TICK_AHEAD = LOGIC_FPS*CLIENT_TICK_AHEAD_SECONDS;
globalThis.INPUT_LATENCY_FRAMES = Math.round(LOGIC_FPS*INPUT_LATENCY_SECONDS);

// Game loop
function logicLoop() {
    // Step the physics simulation
    let command = {type:null};

    if(!rollbackManager.isPaused()) {
        command = rollbackManager.getNextCommand();
    } else {
        console.log('paused');
    }

    if (command.type === "normal") {
        // console.log(JSON.stringify(command.inputs))
        game.advance(command.inputs); // Advance game with inputs
    } else if (command.type === "rollback") {
        console.log(`rolling back to ` + (game.frame - command.frame))
        game.loadState(command.frame); // Load state from target frame
        for (let f = command.frame; f < rollbackManager.localFrame; f++) {
          game.advance(rollbackManager.inputHistory[f]); // Replay with correct inputs
        }
    } else if (command.type === "pause") {
        // Do nothing for command.value frames
        // Optionally, display a "waiting for opponent" message
    }

    // simulate heavy lag
    setTimeout((messages)=>{
        messages.forEach(msg=>{
            // console.log({...msg, frame: rollbackManager.localFrame, id: clientId, from: clientType});
            sendPacket('PLAYER_EVENT', {...msg, frame: rollbackManager.localFrame, id: clientId, from: clientType});
        });
    }, 0, rollbackManager.broadcastMessages);
    rollbackManager.broadcastMessages = [];

}

function tick() {
    // if(!globalThis.gameReady) return;
    if(!globalThis.game) return;
    if(!globalThis.rollbackManager) return;
    if(!globalThis.clientId) return;
    if(!globalThis.clientType) return;
    const time = performance.now();
    let delta = time - lastTime;
    lastTime = time;

    if (delta > MAX_DELTA) delta = MAX_DELTA;

    acc += delta;

    while (acc >= TICK_RATE) {
        logicLoop();
        acc -= TICK_RATE;
    }

    // RENDER STUFF
    game.render();
}

setInterval(tick, 1000/120);