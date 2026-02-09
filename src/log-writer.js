const fs = require('fs'); // for openSync
const BUCKET_SIZE = 64 * 1024;
const slab = Buffer.allocUnsafe(BUCKET_SIZE);
const fileName = 'stream.log';
const fd = fs.openSync(fileName, 'a');
let currentOffset = 0;

function fastWriteBinary(binaryMsg) {
    const payloadBuf = Buffer.from(binaryMsg);
    // LOGIC: Total Size = 4 (Size Header) + Payload
    const messageSize = 4 + payloadBuf.length;
    const msg = Buffer.allocUnsafe(messageSize);

    // 1. Write the "Size Header" so the reader knows the boundary
    msg.writeUInt32LE(messageSize, 0);
    payloadBuf.copy(msg, 4);

    // 1. Handle "Giant" messages that exceed the total BUCKET_SIZE
    if (msg.length > BUCKET_SIZE) {
        // or you can ignore big messages
        flushToDisk(); // Clear current slab first to maintain order
        fs.writeSync(fd, msg); // Write giant message directly to disk
        return msg;
    }

    // BATCHING LOGIC: Flush to disk if full
    if (currentOffset + msg.length > BUCKET_SIZE) {
        flushToDisk();
    }

    msg.copy(slab, currentOffset);
    currentOffset += msg.length;

    return msg;
}

function flushToDisk() {
    if (currentOffset > 0) {
        fs.writeSync(fd, slab, 0, currentOffset);
        fs.fsyncSync(fd); // Forces OS to flush hardware cache to disk
        currentOffset = 0;
    }
}

process.on('exit', () => {
    flushToDisk();
    fs.closeSync(fd);
});

globalThis.fastWriteBinary = fastWriteBinary;
globalThis.flushToDisk = flushToDisk;
/*
// test
let i = 0;
setInterval(()=>{
    fastWriteBinary(new Uint8Array([++i%255,2,3,4]));
}, 1000/60);

// periodically write it to file
setInterval(flushToDisk, 1000/10); // this could be a tick rate or something*/