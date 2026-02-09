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

// Schema-driven serializer generator for BitWriter / BitReader
// Requires: BitWriter, BitReader (same API as in your examples)
/*const userStateSchema = {
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

/*

SCHEMA HELPERS

const easySchema = inferSchema(fullObject);
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

// Full object definition (dont modify, append only)
const MessageTypes = [
  "GLOBAL",
  "PRIVATE",
];

const chatMessageSchema = inferSchema({
  playerId: 255*255,
  message: "string",
  messageType: "string",
});
applyEnumSchema(chatMessageSchema, 'messageType', MessageTypes);

// sent in initiating/entering/leaving chunks
const snapshotTemplate = {
  id: 255*255,
  frame: 255*255*255*255,
  state: [255,255,255]
};

const snapshotSchema = inferSchema(snapshotTemplate);
snapshotSchema.fields.state.lengthBits = 16;

globalThis.ObjectTemplates = {
  chatMessagePacker: makeSerializer(chatMessageSchema),
  // eventPacker: makeSerializer(eventSchema), // moved in game.js
  // statePacker: makeSerializer(stateSchema), // moved in game.js
  snapshotPacker: makeSerializer(snapshotSchema),
};

// testing
// console.log({snapshotSchema});
/*console.log(
  // game.getLatestState(),
  Array.from(globalThis.ObjectTemplates.statePacker.pack(stateTemplate)),
  globalThis.ObjectTemplates.statePacker.unpack(
    globalThis.ObjectTemplates.statePacker.pack(stateTemplate)
  )
)*/