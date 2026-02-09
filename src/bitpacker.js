// binary-packet-generator.js

class BinaryPacketGenerator {
    constructor(clientId) {
        this.buffer = new ArrayBuffer(1024); // Initial buffer size
        this.view = new DataView(this.buffer);
        this.offset = 0;
        this.littleEndian = true; // Use little-endian for network efficiency
    }
    /**
     * Ensure buffer has enough capacity
     */
    ensureCapacity(additionalBytes) {
        const required = this.offset + additionalBytes;
        if (required > this.buffer.byteLength) {
            // Double the buffer size
            const newSize = Math.max(this.buffer.byteLength * 2, required);
            const newBuffer = new ArrayBuffer(newSize);
            const newView = new Uint8Array(newBuffer);
            newView.set(new Uint8Array(this.buffer));
            this.buffer = newBuffer;
            this.view = new DataView(this.buffer);
        }
    }

    /**
     * Bit packing methods
     */
    writeBits(value, bitCount) {
        // For simplicity, we'll write aligned bytes
        // In a full implementation, you'd want true bit packing
        if (bitCount <= 8) {
            this.writeUint8(value & ((1 << bitCount) - 1));
        } else if (bitCount <= 16) {
            this.writeUint16(value & ((1 << bitCount) - 1));
        } else {
            this.writeUint32(value & ((1 << bitCount) - 1));
        }
    }

    /**
     * Basic data type writers
     */
    writeUint8(value) {
        this.ensureCapacity(1);
        this.view.setUint8(this.offset, value);
        this.offset += 1;
    }

    writeInt8(value) {
        this.ensureCapacity(1);
        this.view.setInt8(this.offset, value);
        this.offset += 1;
    }

    writeUint16(value) {
        this.ensureCapacity(2);
        this.view.setUint16(this.offset, value, this.littleEndian);
        this.offset += 2;
    }

    writeInt16(value) {
        this.ensureCapacity(2);
        this.view.setInt16(this.offset, value, this.littleEndian);
        this.offset += 2;
    }

    writeUint32(value) {
        this.ensureCapacity(4);
        this.view.setUint32(this.offset, value, this.littleEndian);
        this.offset += 4;
    }

    writeInt32(value) {
        this.ensureCapacity(4);
        this.view.setInt32(this.offset, value, this.littleEndian);
        this.offset += 4;
    }

    writeFloat32(value) {
        this.ensureCapacity(4);
        this.view.setFloat32(this.offset, value, this.littleEndian);
        this.offset += 4;
    }

    writeFloat64(value) {
        this.ensureCapacity(8);
        this.view.setFloat64(this.offset, value, this.littleEndian);
        this.offset += 8;
    }

    writeString(str) {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(str);
        this.writeUint16(encoded.length); // Write length prefix
        this.ensureCapacity(encoded.length);
        new Uint8Array(this.buffer, this.offset).set(encoded);
        this.offset += encoded.length;
    }

    writeBuffer(buffer) {
        this.writeUint32(buffer.byteLength);
        this.ensureCapacity(buffer.byteLength);
        new Uint8Array(this.buffer, this.offset).set(new Uint8Array(buffer));
        this.offset += buffer.byteLength;
    }

    /**
     * Create a packet with header and operation Code
     */
    createPacket(opCode, bin, version = 1, clientId, nonce, seqId) {
        const data = bin.buffer;
        // console.log(data.buffer)
        // Reset buffer and write header
        this.reset();

        // Packet header
        this.writeUint8(0xAA); // Start byte
        this.writeUint8(version); // Protocol version
        this.writeUint16(opCode); // operation Code to call on server
        this.writeUint32(data.byteLength); // Data length

        // Write the actual data
        this.writeBuffer(data);

        // Add checksum (simple XOR checksum)
        const packetBuffer = this.getBuffer();
        let checksum = 0;
        const uint8View = new Uint8Array(packetBuffer);
        for (let i = 0; i < uint8View.length; i++) {
            checksum ^= uint8View[i];
        }

        this.writeUint8(checksum);

        return this.getBuffer();
    }

    /**
     * Reset the buffer
     */
    reset() {
        this.offset = 0;
    }

    /**
     * Get the current buffer
     */
    getBuffer() {
        return this.buffer.slice(0, this.offset);
    }
}

// export default BinaryPacketGenerator;

class ServerPacketHandler {
    constructor() {
        this.handlers = new Map();
    }

    registerHandler(opCode, handler) {
        this.handlers.set(opCode, handler);
    }

    async read(arrBuffer) {
        // 1. Create a DataView for multi-byte parsing (endian-safe)
        const view = new DataView(arrBuffer);

        // 2. Create a Uint8Array to access individual bytes (for checksum/slicing)
        const bytes = new Uint8Array(arrBuffer);

        // Parse header using DataView
        const startByte = view.getUint8(0);
        const version = view.getUint8(1);
        const opCode = view.getUint16(2, true); // true = little-endian
        const dataLength = view.getUint32(4, true);

        // 3. Verify checksum using the Uint8Array view
        let checksum = 0;
        for (let i = 0; i < bytes.length - 1; i++) {
            checksum ^= bytes[i];
        }

        if (checksum !== bytes[bytes.length - 1]) {
            console.error("Calculated:", checksum, "Received:", bytes[bytes.length - 1]);
            throw new Error('Checksum failed!');
        }

        // 4. Extract data (returns a new arrayBuffer)
        const data = new Uint8Array(arrBuffer.slice(8 + 4, 8 + 4 + dataLength));
        // const data = arrBuffer.slice(8 + 4);
        // console.log({ startByte, version, opCode, dataLength, data });

        return { startByte, version, opCode, dataLength, data };
    }

    async process(opCode, data) {
        // // Find and call handler
        const handler = this.handlers.get(opCode);
        if (handler === undefined) {
          return true;
            // throw new Error(`No handler for operation Code: ${opCode}`);
        }

        try {
          // console.log({handler})
            return await handler(opCode, data);
        } catch (error) {
            console.error('Handler error:', error);
            throw new Error(`Handler error`);
        }
    }
}


class BitWriter {
  constructor() {
    this.bytes = [];
    this.current = 0;
    this.bitPos = 0;
  }

  writeBits(value, bits) {
    for (let i = bits - 1; i >= 0; i--) {
      const bit = (value >> i) & 1;
      this.current = (this.current << 1) | bit;
      this.bitPos++;

      if (this.bitPos === 8) {
        this.bytes.push(this.current);
        this.current = 0;
        this.bitPos = 0;
      }
    }
  }

  writeByte(b) {
    this.writeBits(b, 8);
  }

  writeFloat32(f) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, f, false);
    for (const b of new Uint8Array(buf)) {
      this.writeByte(b);
    }
  }

    writeUInt8(f) {
        const buf = new ArrayBuffer(1);
        new DataView(buf).setUint8(0, f);
        for (const b of new Uint8Array(buf)) {
            this.writeByte(b);
        }
    }

    writeUInt16(f) {
        const buf = new ArrayBuffer(2);
        new DataView(buf).setUint16(0, f, false); // false for Big-Endian
        for (const b of new Uint8Array(buf)) {
            this.writeByte(b);
        }
    }

    writeUInt32(f) {
        const buf = new ArrayBuffer(4);
        new DataView(buf).setUint32(0, f, false);
        for (const b of new Uint8Array(buf)) {
          this.writeByte(b);
        }
    }

  writeString(str) {
    const enc = new TextEncoder().encode(str);
    this.writeByte(enc.length);
    for (const b of enc) this.writeByte(b);
  }

  finish() {
    if (this.bitPos > 0) {
      this.bytes.push(this.current << (8 - this.bitPos));
    }
    return new Uint8Array(this.bytes);
  }
}

class BitReader {
  constructor(uint8) {
    this.bytes = uint8;
    this.bytePos = 0;
    this.bitPos = 0;
  }

  readBits(bits) {
    let value = 0;
    for (let i = 0; i < bits; i++) {
      const bit =
        (this.bytes[this.bytePos] >> (7 - this.bitPos)) & 1;

      value = (value << 1) | bit;

      this.bitPos++;
      if (this.bitPos === 8) {
        this.bitPos = 0;
        this.bytePos++;
      }
    }
    return value;
  }

  readByte() {
    return this.readBits(8);
  }

  readFloat32() {
    const buf = new ArrayBuffer(4);
    const arr = new Uint8Array(buf);
    for (let i = 0; i < 4; i++) {
      arr[i] = this.readByte();
    }
    return (new DataView(buf).getFloat32(0, false)).toFixed(4)*1;
  }

  readUInt8() {
        // You can just return the byte directly
        return this.readByte() & 0xFF;
    }

    readUInt16() {
        const buf = new ArrayBuffer(2);
        const arr = new Uint8Array(buf);
        for (let i = 0; i < 2; i++) {
            arr[i] = this.readByte();
        }
        return new DataView(buf).getUint16(0, false); // false for Big-Endian
    }

  readUInt32() {
    const buf = new ArrayBuffer(4);
    const arr = new Uint8Array(buf);
    for (let i = 0; i < 4; i++) {
      arr[i] = this.readByte();
    }
    return new DataView(buf).getUint32(0, false);
  }

  readString() {
    const len = this.readByte();
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = this.readByte();
    }
    return new TextDecoder().decode(arr);
  }
}

function makeSerializer(schema) {
  function writeField(bw, value, s) {
    if (typeof s === "string") s = { type: s };

    switch (s.type) {
      case "bool":
        bw.writeBits(value ? 1 : 0, 1);
        break;

      case "uint8":
        bw.writeUInt8(value & 0xFF);
        break;

      case "uint16":
        bw.writeUInt16(value & 0xFFFF);
        break;

      case "uint32":
        bw.writeUInt32(value >>> 0);
        break;

      case "int32":
        // store as 32-bit signed
        bw.writeUInt32(value >>> 0);
        break;

      case "float32":
        bw.writeFloat32(value);
        break;

      case "string":
        bw.writeString(value ?? "");
        break;

      case "bits": // bitmask from flags array e.g. {type:'bits', flags:['a','b']}
        {
          let mask = 0;
          for (let i = 0; i < s.flags.length; i++) {
            if (Array.isArray(value) ? value.includes(s.flags[i]) : !!(value & (1 << i))) {
              mask |= (1 << i);
            }
          }
          // write mask in the minimum number of bits
          const bits = s.bits ?? s.flags.length;
          bw.writeBits(mask, bits);
        }
        break;

      case "enum":
        {
          // s.values = array of strings
          const idx = s.values.indexOf(value);
          const count = s.values.length;
          const bits = Math.max(1, Math.ceil(Math.log2(count)));
          bw.writeBits(Math.max(0, idx), bits);
        }
        break;

      case "array":
        {
          const lenBits = s.lengthBits ?? 16;
          const arr = value || [];
          bw.writeBits(arr.length, lenBits);
          for (let i = 0; i < arr.length; i++) writeField(bw, arr[i], s.items);
        }
        break;

      case "object":
        {
          const fields = s.fields || {};
          for (const key of Object.keys(fields)) {
            writeField(bw, value?.[key], fields[key]);
          }
        }
        break;

      case "union":
        {
          // s.variants is an object mapping tag->schema
          // s.order optional array to define tag order
          const order = s.order ?? Object.keys(s.variants);
          const tag = value?.type;
          const idx = order.indexOf(tag);
          const tagBits = Math.max(1, Math.ceil(Math.log2(order.length)));
          bw.writeBits(Math.max(0, idx), tagBits);
          const variantSchema = s.variants[tag] || s.variants[order[idx]];
          // variant may be object fields or primitive
          if (variantSchema.type === "object") {
            writeField(bw, value, variantSchema);
          } else {
            // for simple variants, pass value property (like amount or reason)
            writeField(bw, value[tag] ?? value.value ?? value, variantSchema);
          }
        }
        break;

      case "nullable":
        {
          // write 1 if value is null (or missing?), then if inner present write it
          // semantics: presenceBit=1 means value is null; presenceBit=0 means not-null and encode inner
          const isNull = value === null;
          bw.writeBits(isNull ? 1 : 0, 1);
          if (!isNull) {
            // when inner is {type:'null'} we do nothing
            if (s.inner && s.inner.type !== "null") writeField(bw, value, s.inner);
          }
        }
        break;

      case "null":
        // nothing to write; presence handled by nullable wrapper
        break;

      default:
        throw new Error("unsupported type: " + s.type);
    }
  }

  function readField(br, s) {
    if (typeof s === "string") s = { type: s };

    switch (s.type) {
      case "bool":
        return !!br.readBits(1);

      case "uint8":
        return br.readUInt8();
        break;

      case "uint16":
        return br.readUInt16();
        break;

      case "uint32":
        return br.readUInt32();

      case "int32":
        return br.readUInt32() | 0;

      case "float32":
        return br.readFloat32();

      case "string":
        return br.readString();

      case "bits":
        {
          const bits = s.bits ?? s.flags.length;
          const mask = br.readBits(bits);
          // return array of flag names that are set, by default
          if (s.asMask) return mask;
          const arr = [];
          for (let i = 0; i < s.flags.length; i++) {
            if ((mask >> i) & 1) arr.push(s.flags[i]);
          }
          return arr;
        }

      case "enum":
        {
          const count = s.values.length;
          const bits = Math.max(1, Math.ceil(Math.log2(count)));
          const idx = br.readBits(bits);
          return s.values[idx] ?? s.values[0];
        }

      case "array":
        {
          const lenBits = s.lengthBits ?? 16;
          const len = br.readBits(lenBits);
          const out = [];
          for (let i = 0; i < len; i++) out.push(readField(br, s.items));
          return out;
        }

      case "object":
        {
          const out = {};
          const fields = s.fields || {};
          for (const key of Object.keys(fields)) {
            out[key] = readField(br, fields[key]);
          }
          return out;
        }

      case "union":
        {
          const order = s.order ?? Object.keys(s.variants);
          const tagBits = Math.max(1, Math.ceil(Math.log2(order.length)));
          const idx = br.readBits(tagBits);
          const tag = order[idx];
          const variantSchema = s.variants[tag];
          if (!variantSchema) return { type: tag };
          if (variantSchema.type === "object") {
            const obj = readField(br, variantSchema);
            obj.type = tag;
            return obj;
          } else {
            // read single value variant
            const val = readField(br, variantSchema);
            return { type: tag, [tag]: val };
          }
        }

      case "nullable":
        {
          const isNull = !!br.readBits(1);
          if (isNull) return null;
          if (s.inner && s.inner.type !== "null") return readField(br, s.inner);
          return undefined;
        }

      case "null":
        return null;

      default:
        throw new Error("unsupported type: " + s.type);
    }
  }

  return {
    pack(obj) {
      const bw = new BitWriter();
      writeField(bw, obj, schema);
      return bw.finish();
    },

    unpack(uint8) {
      const br = new BitReader(uint8);
      return readField(br, schema);
    }
  };
}

function deepEqual(obj1, obj2) {
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
      if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
          return false;
      }
  }

  return true;
}

function inferSchema(value) {
  if (value === null) {
    return { type: "null" };
  }

  if (Array.isArray(value)) {
    return inferArray(value);
  }

  switch (typeof value) {
    case "boolean":
      return { type: "bool" };

    case "number":
      return Number.isInteger(value)
        ? inferInteger(value)
        : { type: "float32" };

    case "string":
      return { type: "string" };

    case "object":
      return inferObject(value);

    default:
      return { type: "unknown" };
  }
}

function inferInteger(val) {
  if(val <= 255) {
    return { type: "uint8" };
  }

  if(val <= 255*255) {
    return { type: "uint16" };
  }

  return { type: "uint32" };
}

function inferObject(obj) {
  const fields = {};

  for (const [key, val] of Object.entries(obj)) {
    if (val === null) {
      fields[key] = {
        type: "nullable",
        inner: { type: "null" }
      };
    } else {
      fields[key] = inferSchema(val);
    }
  }

  return {
    type: "object",
    fields
  };
}

function inferArray(arr) {
  // empty array → default string array
  if (arr.length === 0) {
    return {
      type: "array",
      lengthBits: 8,
      items: { type: "string" }
    };
  }

  // array of strings → bits (flags)
  if (arr.every(v => typeof v === "string")) {
    return {
      type: "bits",
      flags: [...new Set(arr)]
    };
  }

  // array of objects with "type" discriminator → union
  if (
    arr.every(
      v => typeof v === "object" && v !== null && typeof v.type === "string"
    )
  ) {
    const variants = {};
    const order = [];

    for (const item of arr) {
      if (!variants[item.type]) {
        const clone = { ...item };
        delete clone.type;
        variants[item.type] = inferObject(clone);
        order.push(item.type);
      }
    }

    return {
      type: "array",
      lengthBits: 8,
      items: {
        type: "union",
        order,
        variants
      }
    };
  }

  // fallback: homogeneous array
  return {
    type: "array",
    lengthBits: 8,
    items: inferSchema(arr[0])
  };
}

function setNestedProperty(obj, propertyName, newValue, options = {}) {
    const {
        overwriteAllOccurrences = false, // Set to true to update all occurrences
        createIfMissing = false // Set to true to create the property if it doesn't exist
    } = options;

    let found = false;

    function traverse(currentObj, path = []) {
        // Base case: not an object or null
        if (typeof currentObj !== 'object' || currentObj === null) {
            return;
        }

        // Check if property exists on current object
        if (currentObj.hasOwnProperty(propertyName)) {
            currentObj[propertyName] = newValue;
            found = true;

            // If we only want to update the first occurrence, we could return here
            if (!overwriteAllOccurrences) {
                return; // Comment this line to update all occurrences
            }
        }

        // Recursively traverse all properties
        for (const key in currentObj) {
            if (currentObj.hasOwnProperty(key)) {
                traverse(currentObj[key], [...path, key]);
            }
        }
    }

    traverse(obj);

    // If property wasn't found and we want to create it
    if (!found && createIfMissing) {
        obj[propertyName] = newValue;
        found = true;
    }

    return found;
}

function applyEnumSchema(schema, propertyName, enumArray) {
    return setNestedProperty(schema, propertyName,
        { type: "enum", values: enumArray },
        { overwriteAllOccurrences:true }
    );
}


globalThis.makeSerializer = makeSerializer;
globalThis.ServerPacketHandler = ServerPacketHandler;
globalThis.BinaryPacketGenerator = BinaryPacketGenerator;
globalThis.deepEqual = deepEqual;
globalThis.inferSchema = inferSchema;
globalThis.applyEnumSchema = applyEnumSchema;