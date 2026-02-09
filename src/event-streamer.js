// ****************************************************************************
// *                                  RULES:                                  *
// * - client sends only intent never state to prevent cheating (e.g. can send attack action, walk here, cant send hp/atk stats)*
// * - server can send both states and intent (e.g. your current stats, level up, etc)    *
// * - server streams events and periodically snapshots
// ****************************************************************************

const TICKRATE = 1;
let tick = 1;

function snapshotTick() {
    console.log('broadcasting state');
}

function serverTick() {
    // console.log('tick');

    tick++;

    if(tick%100==0) {
        snapshotTick();
    }

    if(events.length == 0) return;

    console.log('broadcasting events');

    sendPacket('STREAM_EVENTS', { tick, events }, (response)=>{
        console.log(`[SERVER]`,response);
    });

    events = [];
    seenPackets = new Set();
}

setInterval(serverTick, 1000/TICKRATE);

console.log('Streaming events...')