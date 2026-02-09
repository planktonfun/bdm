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

globalThis.ServerPacketHandler = ServerPacketHandler;
globalThis.BinaryPacketGenerator = BinaryPacketGenerator;