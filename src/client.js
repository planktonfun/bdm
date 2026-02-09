// Connect to channel "test_channel"
const WSBroadcastChannel = require('./WSBroadcastChannelModule');
require('./binary-packet-generator.js');
require('./enums.js');
require('./generated-packers.js');
require('./packet-handler.js');
require('./game-settings.js');

// ****************************************************************************
// *                                  RULES:                                  *
// * - client sends only intent never state to prevent cheating (e.g. can send attack action, walk here, cant send hp/atk stats)*
// * - server can send both states and intent (e.g. your current stats, level up, etc)    *
// ****************************************************************************

/* TIMELINE:

Tick 100: Client predicts MOVE right
Tick 101: Client predicts MOVE right

Server replies:
Tick 100: MOVE accepted
Tick 101: MOVE rejected (speed hack)

Client Normal Flow:
- Roll back to 99 (server state)
- Apply server MOVE at 100
- Replay only valid local inputs
- Visual correction occurs

Client Recovery Flow
- discard local state
- set state = snapshot
- resume prediction
*/

let clientState = createInitialState();
let pendingEvents = [];
let lastTickTime = Date.now();

// simulate inputs
const getInput = () => {
  if(clientState.tick > 2 && clientState.tick < 7) {
    return 'EAT';
  }

  if(clientState.tick > 7 && clientState.tick < 9) {
    return 'POOP';
  }

  return 'IDLE';
};

function onServerUpdate(auth) {
  // 1. Drop acknowledged events
  pendingEvents = pendingEvents.filter(e => e.tick > auth.tick);

  // 2. Start from ground truth and REPLAY
  let reconciledState = { ...auth.snapshot };
  pendingEvents.forEach(e => {
    reconciledState = applyEvent(reconciledState, e);
  });

  // console.log({reconciledState});
  clientState = reconciledState;
  clientState.tick = (pendingEvents.length > 0)
    ? pendingEvents[pendingEvents.length - 1].tick + 1
    : auth.tick + 1;

  console.log(`Tick: ${clientState.tick} | Hunger: ${clientState.hunger} ${reconciledState.hunger} | Pending: ${pendingEvents.length}`);
}

const playerId = Math.floor(Math.random()*255*255);

function clientTick() {
  const now = Date.now();

  // if (now - lastTickTime >= TICK_MS) {
    const input = getInput(); // Your EAT/POOP logic
    const event = { tick: clientState.tick, type: Math.random() > 0.5 ? 'EAT':'POOP', playerId };

    // 1. Prediction (Apply to local state immediately)
    clientState = applyEvent(clientState, event);
    clientState.tick = (clientState.tick + 1) % 255;
    // serverState.tick++;

    // 2. Buffer for reconciliation
    pendingEvents.push(event);

    // 3. Sync to Server
    sendPacket('PLAYER_INTENT', event, (response)=>{
        console.log(`[CLIENT]`,response);
    });

    lastTickTime = now;
    // console.log(`Tick: ${event.tick} | Hunger: ${clientState.hunger} | Pending: ${pendingEvents.length}`);
  // }
}

setInterval(clientTick, 1000/TICK_RATE);

(async ()=>{
    await sendPacket('CHAT_MESSAGE', {
        playerId,
        message: "I am online",
        messageType: "GLOBAL",
    }, (response)=>{
        console.log(`[CLIENT]`,response);
    });
})();

// Handle Recieved Messages
sp.registerHandler(OperationFunctions.indexOf('STREAM_STATE'), async (opCode, data) => {
    const serializer = clientPackers[opCode];
    const unpacked = serializer.unpack(data);  // returns reconstructed object

    console.log(`[CLIENT] RECONCILE EVENTS`);
    onServerUpdate(unpacked);

    return true;
});

sp.registerHandler(OperationFunctions.indexOf('CHAT_MESSAGE'), async (opCode, data) => {
    const serializer = clientPackers[opCode];
    const unpacked = serializer.unpack(data);  // returns reconstructed object

    const { playerId, message, messageType } = unpacked;
    console.log(`[CLIENT] Chat from ${playerId}: ${message} (type: ${messageType})`);

    return true;
});

console.log('Client is ready.')