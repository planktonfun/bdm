const checkpointFileName="checkpoint.log";
const eventsFileName="stream.log";

function loadLatestStateFromEvents(callback) {

    let maximumFrame = 0;
    console.log("Initializing from events stream...");
    console.time('Initialization')
    processDataOnce(eventsFileName, (size,payload,percentComplete)=>{
        // console.log({size,payload});
        console.log(`Loading... `, percentComplete);
        const event = clientPackers[OperationFunctions.indexOf('PLAYER_EVENT')].unpack(payload);
        // console.log({event});

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
        console.log('checkpoint loaded start game loop')
        callback({checkpointFileName, maximumFrame});
        console.timeEnd('Initialization')
    });
}

function loadLatestStateFromCheckpoint(callback) {
    console.log("Initializing from checkpoint...");

    // Load Checkpoint from file
    readFile(checkpointFileName, (data) => {
        if(!data) {
            return;
        }
        const checkpoint = clientPackers[OperationFunctions.indexOf('RESET')].unpack(data);
        game.reset(checkpoint.frame, checkpoint.state);

        callback({
            checkpointFileName,
            maximumFrame: checkpoint.frame
        });

        // rollbackManager.reset(checkpoint.frame);
    })
}

globalThis.loadLatestStateFromEvents = loadLatestStateFromEvents;
globalThis.loadLatestStateFromCheckpoint = loadLatestStateFromCheckpoint;