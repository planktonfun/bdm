const fs = require('fs');


// touch stream.log if it doesnt exist yet
const fileName = 'stream.log';
let remainder = Buffer.alloc(0);
let currentPos = 0;


function initializeStreaming() {
    // 1. Initial process of existing data
    if (fs.existsSync(fileName)) {
        processNewData();
    }

    // 2. Watch for file changes
    fs.watch(fileName, (eventType) => {
        if (eventType === 'change') {
            processNewData();
        }
    });
}

function processNewData() {
    const stats = fs.statSync(fileName);

    // If the file was truncated or cleared, reset position
    if (stats.size < currentPos) currentPos = 0;
    if (stats.size === currentPos) return;

    // Read only the NEW bytes added since currentPos
    const readStream = fs.createReadStream(fileName, {
        start: currentPos,
        end: stats.size - 1
    });

    readStream.on('data', (chunk) => {
        let buffer = Buffer.concat([remainder, chunk]);
        let offset = 0;

        while (offset + 4 <= buffer.length) {
            const messageSize = buffer.readUInt32LE(offset);
            if (offset + messageSize <= buffer.length) {
                const payload = buffer.subarray(offset + 4, offset + messageSize);
                processData(messageSize, payload);

                offset += messageSize;
            } else {
                break;
            }
        }
        remainder = buffer.subarray(offset);
    });

    readStream.on('end', () => {
        currentPos = stats.size;
        console.log('Waiting for new data...');
    });
}

function processData (size, event) {
    if(globalThis.onReadCallback) {
        globalThis.onReadCallback(event);
        return;
    }
    // console.log(`New Message: ${size}`, event);
}

// used for loading checkpoints via event logs at the start of a game
function processDataOnce(fileName, callback, endCallback) {

    if (!fs.existsSync(fileName)) {
        console.log('end of file');
        endCallback();
        return;
    }

    const stats = fs.statSync(fileName);
    let remainder = Buffer.alloc(0);
    let currentPos = 0;
    let bytesRead = 0;

    // If the file was truncated or cleared, reset position
    if (stats.size < currentPos) currentPos = 0;
    if (stats.size === currentPos) {
        console.log('end of file');
        endCallback();
        return;
    }

    // Read only the NEW bytes added since currentPos
    const readStream = fs.createReadStream(fileName, {
        start: currentPos,
        end: stats.size - 1
    });

    readStream.on('data', (chunk) => {
        let buffer = Buffer.concat([remainder, chunk]);
        let offset = 0;


        while (offset + 4 <= buffer.length) {
            const messageSize = buffer.readUInt32LE(offset);
            if (offset + messageSize <= buffer.length) {
                const payload = buffer.subarray(offset + 4, offset + messageSize);
                offset += messageSize;
                const percent = ((offset / stats.size) * 100).toFixed(2)*1;
                callback(messageSize, payload, percent);
            } else {
                break;
            }
        }
        remainder = buffer.subarray(offset);
    });

    readStream.on('end', () => {
        // currentPos = stats.size;
        console.log('end of file');
        endCallback();
    });
}

globalThis.processData= processData;
globalThis.processDataOnce= processDataOnce;
// // test
// processDataOnce('stream.log', (size,payload)=>{
//     console.log({size,payload});
//     // const event = clientPackers[OperationFunctions.indexOf('RESET')].unpack(payload);
// }, ()=>{
//     console.log('start game?')
// });