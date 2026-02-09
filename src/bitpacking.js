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

function deepEqual(a, b, seen = new WeakMap()) {
  if (a === b) return true;

  if (a == null || b == null) return false; // handles null/undefined
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  // Dates
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  // RegExps
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;

  // Fast array path (avoids expensive Object.keys/includes)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      console.log('array length not the same');
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], seen)) {
        console.log('array value not the same');
        return false;
      }
    }
    return true;
  }

  // Handle circular references
  if (seen.has(a)) return seen.get(a) === b;
  seen.set(a, b);

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key], seen)) return false;
  }

  return true;
}

const flatten = (obj, prefix = '', delimiter = '.') => {
  return Object.keys(obj).reduce((acc, key) => {
    const pre = prefix.length ? prefix + delimiter : '';
    const value = obj[key];

    if (value && typeof value === 'object' && !Date.prototype.isPrototypeOf(value)) {
      // Recursively flatten arrays and objects
      Object.assign(acc, flatten(value, pre + key, delimiter));
    } else {
      acc[pre + key] = value;
    }
    return acc;
  }, {});
};

const unflatten = (data, delimiter = '.') => {
  const result = {};
  for (const key in data) {
    const parts = key.split(delimiter);
    parts.reduce((acc, part, index) => {
      const isNextNumber = !isNaN(parts[index + 1]);
      const value = data[key];

      if (index === parts.length - 1) {
        acc[part] = value;
      } else {
        // If the next segment is a number, create an array, else an object
        if (!acc[part]) {
          acc[part] = isNextNumber ? [] : {};
        }
      }
      return acc[part];
    }, result);
  }
  return result;
};

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





// Schema-driven serializer generator for BitWriter / BitReader
// Requires: BitWriter, BitReader (same API as in your examples)
/*
const schema = {
  type: "object",
  fields: {
    user: {
      type: "object",
      fields: {
        id: { type: "uint32" },
        name: { type: "string" },
        active: { type: "bool" },
        score: { type: "float32" },
        tags: { type: "bits", flags: ["admin", "premium", "verified"]}, // returns array of tag names
        preferences: {
          type: "object",
          fields: {
            theme: { type: "enum", values: ["dark", "light"] },
            notifications: { type: "bool" },
            language: { type: "enum", values: ["en", "fr", "jp"] }
          }
        }
      }
    },

    timestamp: { type: "uint32" },

    events: {
      type: "array",
      lengthBits: 8, // up to 255 events
      items: {
        type: "union",
        order: ["login", "purchase", "logout"], // forced variant order
        variants: {
          login: { type: "object", fields: { success: { type: "bool" } } },
          purchase: { type: "object", fields: { amount: { type: "float32" } } },
          logout: { type: "object", fields: { reason: { type: "string" } } }
        }
      }
    },

    metadata: {
      type: "object",
      fields: {
        version: { type: "string" },
        nullField: { type: "nullable", inner: { type: "null" } }, // presence bit -> null or undefined
        emptyArray: { type: "array", lengthBits: 8, items: { type: "string" } }
      }
    }
  }
};*/


// ****************************************************************************
// *  The generated serializer is flexible: change schema to alter encoding.  *
// ****************************************************************************
//  Notes:
// - 'bits' returns an array of flag names. Set `asMask: true` on the bits schema to return numeric mask.
// - Adjust `lengthBits` for arrays if you need larger/smaller length ranges.
// - Enum bit-size is auto-calculated.
// - Union variant tag order must be stable for packing/unpacking.
// - If you want a specialized version check gameStatePacker2.js where schema is easier but it doesnt support strings
//
// Supports:
// - Primitive Data, nested arrays of objects, strings, enums
//
// Limitations:
// - floats are inaccurate when unpacked, it is best for 4 decimals to toFixed(4)

/*const user = {
  "user": {
    "id": 12345,
    // "name": "Alice Johnson",
    "active": true,
    "score": 95.5,
    "bin": Array.from(new Uint8Array([1,2,3,4,5,6,7,8,9,10])),
    "tags": [
      "admin",
      "premium",
      "verified"
    ],
    "preferences": {
      "theme": "dark",
      "notifications": false,
      "language": "en"
    }
  },
  "timestamp": 1697395200,
  "events": [
    {
      "type": "login",
      "success": true
    },
    {
      "type": "purchase",
      "amount": 29.85
    },
    {
      "type": "logout",
      "reason": "timeout"
    }
  ],
  "metadata": {
    // "version": "1.0.0",
    "nullField": null,
    "emptyArray": []
  }
};
*/
/*SCHEMA HELPERS

const easySchema = inferSchema(user);
applyEnumSchema(easySchema, 'theme', ["dark", "light"]);
applyEnumSchema(easySchema, 'language', ["en","fr","jp"]);

console.log({easySchema});

LIMITATIONS:

it cannot do:

- enum value sets (["dark", "light"]), you have to do this manually otherwise it will default to {type: "string"}
- union variant ordering guarantees
- max array lengths
- signed vs unsigned integers
- string encoding rules

You have to manually modify these rules after inferring
*/

/*const schema = inferSchema(user);
applyEnumSchema(schema, 'theme', ["dark", "light"]);
applyEnumSchema(schema, 'language', ["en","fr","jp"]);
console.log(schema.fields.user.fields)

// ----------------- Usage example -----------------

const serializer = makeSerializer(schema);

const packed = serializer.pack(user);         // user is your JS object
console.log(packed);
console.log("from:", JSON.stringify(user).length);
console.log("bytes:", packed.length)
console.log(`Reduction: ${(1-(packed.length/JSON.stringify(user).length)).toFixed(2)*100}%`);

const unpacked = serializer.unpack(packed);  // returns reconstructed object
// console.log(user);
console.log(unpacked);
console.log('Data preserved: ', deepEqual(unpacked, user));

console.time('benchmark 10k packed');
for (var i = 0; i < 10000; i++) {
    const packed = serializer.pack(user);         // user is your JS object
    const unpacked = serializer.unpack(packed);  // returns reconstructed object
}
console.timeEnd('benchmark 10k packed');

// Multiple type of objects one schema
(()=>{
    const events = [
      {type: 'CHANGE_TARGET', playerId: 65025, targetId: 65025 },
      {type: 'REMOVE_TARGET', playerId: 65025 },
      {type: 'MOVE', tileX: 255, tileY: 255, playerId: 65025 },
      {type: 'ATTACK', playerId: 65025 },
      {type: 'SKILL', playerId: 65025 },
      {type: 'EQUIP', playerId: 65025, itemId: 65025 },
      {type: 'USE_ITEM', playerId: 65025, itemId: 65025 },
      {type: 'PICK_ITEM', playerId: 65025, itemId: 65025},
      {type: 'INCREASE_ATTRIBUTE', playerId: 65025, attributeId: 255, amount: 255 },
    ];

    const eventSchema = inferSchema(events).items;

    // console.log(eventSchema);

    const event = {type: 'CHANGE_TARGET', playerId: 123, targetId: 321};
    const eventSerializer = makeSerializer(eventSchema);
    const packed = eventSerializer.pack(event);         // user is your JS object
    // console.log({packed})
    const unpacked = eventSerializer.unpack(packed);  // returns reconstructed object
    console.log({unpacked})
})();*/


globalThis.inferSchema = inferSchema;
globalThis.applyEnumSchema = applyEnumSchema;
globalThis.makeSerializer = makeSerializer;
globalThis.deepEqual = deepEqual;
