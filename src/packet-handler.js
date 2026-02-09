
const {
    chatMessagePacker,
    eventPacker,
    snapshotPacker,
} = ObjectTemplates;

// Define function IDs
const OperationFunctions = [
    'BLANK',
    'CHAT_MESSAGE',
    'SERVER_EVENT',
    'PLAYER_EVENT',
    'RESET',
];

// Send/Response Mapping
const clientPackers = [
    {},
    chatMessagePacker,
    eventPacker,
    eventPacker,
    snapshotPacker,
];

const responsePackers = clientPackers;

const sp = new ServerPacketHandler();
const bc = new WSBroadcastChannel("sandbox",
    // "wss://redesigned-space-acorn-p7gg54wjw5f6xj7-3000.app.github.dev"
);

globalThis.sp=sp;
globalThis.bc=bc;
globalThis.OperationFunctions=OperationFunctions;
globalThis.clientPackers=clientPackers;
globalThis.responsePackers=responsePackers;

let loggingEnabled = true;
const originalLog = console.log;
function setLogging(enabled) {
  loggingEnabled = enabled;
  console.log = enabled ? originalLog : function() {};
}

setLogging(true); // disable console.log

async function processOperation(opCode, data) {
    await sp.process(opCode, data);
    return true;
}

// Handle incoming messages
globalThis.totalBytesRecieved = 0;
globalThis.totalRecievedCount = 0;
globalThis.totalBytesSent = 1; // 1 to prevent division by zero error
globalThis.totalSentCount = 1; // 1 to prevent division by zero error

bc.onmessage = async (event) => {
  // console.log("received:", event);
  // console.log("receivedBytes:", event.data.byteLength);

  const packet = event.data.buffer;
  const response = await sp.read(packet);
  const {opCode, data} = response;

  // QUESTION: Should it be broadcasted to other players?
  // ANSWER: mixed, there are events that are private and public

  // console.log(`[RECIEVED] packet ${OperationFunctions[opCode]}`);
  await processOperation(opCode, data);

  totalRecievedCount++;
  totalBytesRecieved += event.data.byteLength;
  // console.log("Total bytes recieved: ", totalBytesRecieved);
};

async function sendPacket(operationName, payload) {
    const opCode = OperationFunctions.indexOf(operationName);

    if(opCode == -1) {
        throw new Error(`Operation Unknown ${operationName}`);
    }

    const bp = new BinaryPacketGenerator();
    const serializer = clientPackers[opCode];
    const packed = serializer.pack(payload);         // user is your JS object
    // console.log({packed});

    // if(!deepEqual(serializer.unpack(packed), payload) && opCode != 4) {
    if(!deepEqual(serializer.unpack(packed), payload)) {
        if(globalThis.writeTextFile) {
            writeTextFile('compA.log', JSON.stringify(payload, null,2));
            writeTextFile('compB.log', JSON.stringify(serializer.unpack(packed), null,2));
        }
        console.log(payload, serializer.unpack(packed));
        // console.log(payload.state.grid, serializer.unpack(packed).state.grid);
        throw new Error(`Unknown schema/payload for function ID: ${opCode}`)
        return;
    }

    // console.log(`Reduction: ${(1-(packed.length/JSON.stringify(payload).length)).toFixed(2)*100}% ${packed.length} bytes`);

    const packet = bp.createPacket(opCode, packed);
    bc.postMessage(packet);
    // cb(unpacked);

    // return unpacked;

    totalSentCount++;
    totalBytesSent += packet.byteLength;
    // console.log("Total bytes sent: ", totalBytesSent);
}

function make(bytes) {
  const k = hash(bytes);
  if (seenPackets.has(k)) return null;
  seenPackets.add(k);
  return bytes;
}

function hash(bytes) {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

globalThis.make = make;
globalThis.seenPackets = new Set();
globalThis.events = [];
globalThis.sendPacket=sendPacket;