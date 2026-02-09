const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Function to convert JSON object to binary
function convertJSONToBinary(jsonObject) {
  const jsonString = JSON.stringify(jsonObject);
  return encoder.encode(jsonString);
}

// Function to convert binary data to JSON object
function convertBinaryToJSON(binaryData) {
  const jsonString = decoder.decode(binaryData);
  return JSON.parse(jsonString);
}

const prependHeader = (h, p) => { const r = new Uint8Array(h.length + p.length); r.set(h); r.set(p, h.length); return r; };
const extractHeader = (framed, headerLength) => {
  const payloadLength = framed.length - headerLength;
  const header  = framed.subarray(0, headerLength);
  const payload = framed.subarray(headerLength);
  return { header, payload };
};

const prependOneByteHeader = (h, p) => {return prependHeader(new Uint8Array([h]), p);};
const extractOneByteHeader = (p) => { return extractHeader(p,1); };

function packFixedArray(arrays) {
  const count = arrays.length;
  if (count === 0) return new Uint8Array(0);
  const chunkSize = arrays[0].length;
  if (!arrays.every(a => a.length === chunkSize)) {
    throw new Error("All chunks must have same length");
  }
  if (chunkSize > 0xFF) throw new Error("chunkSize > 255");
  const result = new Uint8Array(1 + count * chunkSize);
  result[0] = chunkSize; // 1-byte header
  let off = 1;
  for (const a of arrays) {
    result.set(a, off);
    off += chunkSize;
  }
  return result;
}

function unpackFixedArray(packed) {
  if (packed.length === 0) return [];
  const chunkSize = packed[0];
  const totalData = packed.length - 1;
  if (chunkSize === 0 || totalData % chunkSize !== 0) {
    throw new Error("invalid packed format");
  }
  const count = totalData / chunkSize;
  const out = [];
  let off = 1;
  for (let i = 0; i < count; i++) {
    out.push(packed.slice(off, off + chunkSize));
    off += chunkSize;
  }
  return out;
}

function packDynamicArray(arrays) {
  // 1 byte per header entry for length
  const headerSize = arrays.length;
  const totalData = arrays.reduce((a, b) => a + b.length, 0);
  const result = new Uint8Array(1 + headerSize + totalData);

  // write number of arrays at start (1 byte)
  result[0] = arrays.length;

  let dataOffset = 1 + headerSize;

  // write lengths (1 byte each)
  for (let i = 0; i < arrays.length; i++) {
    const arr = arrays[i];
    // Check if array length fits in 1 byte (max 255)
    if (arr.length > 0xFF) {
      throw new Error(`Array length ${arr.length} exceeds maximum 255`);
    }
    result[1 + i] = arr.length;
    result.set(arr, dataOffset);
    dataOffset += arr.length;
  }

  return result;
}

function unpackDynamicArray(packed) {
  const count = packed[0]; // number of arrays (1 byte)
  const lengths = [];

  // read lengths (1 byte each)
  for (let i = 0; i < count; i++) {
    lengths.push(packed[1 + i]);
  }

  let dataOffset = 1 + count;
  const arrays = [];
  for (const len of lengths) {
    arrays.push(packed.slice(dataOffset, dataOffset + len));
    dataOffset += len;
  }
  return arrays;
}

function packGameState(schema, gameState) {
    // Calculate total size and create buffer
    const totalBits = schema.reduce((sum, field) =>
        sum + Math.ceil(Math.log2(field.maxValue + 1)), 0);
    const buffer = new Uint8Array(Math.ceil(totalBits / 8));
    let bitPos = 0;

    for (const field of schema) {
        const bits = Math.ceil(Math.log2(field.maxValue + 1));
        let value = gameState[field.name];
        let bitsLeft = bits;

        while (bitsLeft > 0) {
            const byteIndex = bitPos >> 3; // Math.floor(bitPos / 8)
            const bitOffset = bitPos & 7;  // bitPos % 8
            const bitsToWrite = Math.min(8 - bitOffset, bitsLeft);

            const valuePart = (value >> (bitsLeft - bitsToWrite)) & ((1 << bitsToWrite) - 1);
            buffer[byteIndex] |= valuePart << (8 - bitOffset - bitsToWrite);

            bitPos += bitsToWrite;
            bitsLeft -= bitsToWrite;
        }
    }
    return buffer.buffer;
}

function unpackGameState(buffer, schema) {
    const bytes = new Uint8Array(buffer);
    const result = {};
    let bitPos = 0;

    for (const field of schema) {
        const bits = Math.ceil(Math.log2(field.maxValue + 1));
        let value = 0;
        let bitsLeft = bits;

        while (bitsLeft > 0) {
            const byteIndex = bitPos >> 3;
            const bitOffset = bitPos & 7;
            const bitsToRead = Math.min(8 - bitOffset, bitsLeft);

            const valuePart = (bytes[byteIndex] >> (8 - bitOffset - bitsToRead)) & ((1 << bitsToRead) - 1);
            value = (value << bitsToRead) | valuePart;

            bitPos += bitsToRead;
            bitsLeft -= bitsToRead;
        }
        result[field.name] = value;
    }
    return result;
}

class GameStateCompressor {

  static convertSchema(gameSchema) {
    const schema = [];

    const writeField = (value, max) => {
        schema.push({name: value, maxValue: max});
    };

    for (const [key, max] of Object.entries(gameSchema)) {
      if (typeof max === "object") {
        for (const [subKey, subMax] of Object.entries(max)) {
          writeField(`${key}.${subKey}`, subMax);
        }
      } else {
        writeField(key, max);
      }
    }

    return schema;
  }

  static convertState(gameState) {
    const schema = {};

    const writeField = (value, max) => {
        schema[value] = max;
    };

    for (const [key, max] of Object.entries(gameState)) {
      if (typeof max === "object") {
        for (const [subKey, subMax] of Object.entries(max)) {
          writeField(`${key}.${subKey}`, subMax);
        }
      } else {
        writeField(key, max);
      }
    }

    return schema;
  }

  static compress(gameState, gameSchema) {
    // Define your game schema - no bit calculations!
    // const schema = [
    //     { name: "health", maxValue: 100 },    // 0-100 (7 bits)
    //     { name: "mana", maxValue: 100 },      // 0-100 (7 bits)
    //     { name: "keyLocation", maxValue: 15 }, // 0-15 (4 bits)
    //     { name: "hasKey", maxValue: 1 },      // boolean (1 bit)
    //     { name: "difficulty", maxValue: 3 },  // 0-3 (2 bits)
    //     { name: "coins", maxValue: 1000 }     // 0-1000 (10 bits)
    // ];

    const schema = GameStateCompressor.convertSchema(gameSchema);
    const state = GameStateCompressor.convertState(gameState);
    return new Uint8Array(packGameState(schema, state));
  }

  static decompress(buffer, gameSchema) {

    const decompressed = unpackGameState(buffer, GameStateCompressor.convertSchema(gameSchema));

    const result = {};
    for (const [key, max] of Object.entries(gameSchema)) {
      if (typeof max === "object") {
        result[key] = {};
        for (const [subKey, subMax] of Object.entries(max)) {
          result[key][subKey] = decompressed[`${key}.${subKey}`];
        }
      } else {
        const val = decompressed[key];
        result[key] = max === 1 ? val === 1 : val;
      }
    }

    return result;
  }

  static deepEqual(obj1, obj2) {
      if (obj1 === obj2) {
          return true;
      }

      if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
          return false;
      }

      const keys1 = Object.keys(obj1);
      const keys2 = Object.keys(obj2);

      if (keys1.length !== keys2.length) {
          return false;
      }

      for (const key of keys1) {
          if (!keys2.includes(key) || !this.deepEqual(obj1[key], obj2[key])) {
              return false;
          }
      }

      return true;
  }
}


// Check which environment we are in and attach functions to the appropriate global scope
if (typeof window !== 'undefined') {
  // We are in a browser
  window.encoder = encoder;
  window.decoder = decoder;
  window.convertJSONToBinary = convertJSONToBinary;
  window.convertBinaryToJSON = convertBinaryToJSON;
  window.prependHeader = prependHeader;
  window.extractHeader = extractHeader;
  window.prependOneByteHeader = prependOneByteHeader;
  window.extractOneByteHeader = extractOneByteHeader;
  window.packFixedArray = packFixedArray;
  window.unpackFixedArray = unpackFixedArray;
  window.packDynamicArray = packDynamicArray;
  window.unpackDynamicArray = unpackDynamicArray;
  window.packGameState = packGameState;
  window.unpackGameState = unpackGameState;
  window.GameStateCompressor = GameStateCompressor;
} else if (typeof global !== 'undefined') {
  // We are in Node.js (CommonJS environment check)
  global.encoder = encoder;
  global.decoder = decoder;
  global.convertJSONToBinary = convertJSONToBinary;
  global.convertBinaryToJSON = convertBinaryToJSON;
  global.prependHeader = prependHeader;
  global.extractHeader = extractHeader;
  global.prependOneByteHeader = prependOneByteHeader;
  global.extractOneByteHeader = extractOneByteHeader;
  global.packFixedArray = packFixedArray;
  global.unpackFixedArray = unpackFixedArray;
  global.packDynamicArray = packDynamicArray;
  global.unpackDynamicArray = unpackDynamicArray;
  global.packGameState = packGameState;
  global.unpackGameState = unpackGameState;
  global.GameStateCompressor = GameStateCompressor;
}