// CLient side
let sendNonce = 0;
const nonceSize = 0xFF; // 8-bit wrap-around

function buildSecuredPacket(payload) {
  sendNonce = (sendNonce + 1) & nonceSize;
  const packet = new Uint8Array(payload.length + 1);
  packet[0] = sendNonce;
  packet.set(payload, 1);

  return packet;
}

class SecuredClient {
  lastNonce = 0;
  windowMask = 0; // 32-bit sliding window

  constructor(id) {
    this.id = id;
  }

  isValidNonce(nonce) {
    const delta = (nonce - this.lastNonce) & nonceSize; // handle wrap-around 0–255

    if (delta === 0) {
      console.log(`[exact duplicate]`)
      return false; // exact duplicate
    }

    if (delta < 128) {
      // nonce ahead, slide window forward
      this.windowMask = (this.windowMask << delta) | 1;
      this.lastNonce = nonce;
      return true;
    } else {
      // nonce behind, within window?
      const behind = (this.lastNonce - nonce) & nonceSize;
      if (behind >= 32) {
        console.log(`[too old, replay]`)
        return false; // too old, replay
      }
      const bit = 1 << behind;
      if (this.windowMask & bit) {
        console.log(`[already seen]`)
        return false; // already seen
      }
      this.windowMask |= bit;
      return true;
    }
  }

  processPayload(rawPacket, fn, errfn) {
    const nonce = rawPacket[0];
    if (!this.isValidNonce(nonce)) {
      // console.log('nonce is invalid for this client! duplicate/replay attack detected!')
      errfn('ALREADY_LOGGED_IN');
      return; // drop duplicate/replay
    }

    const payload = rawPacket.subarray(1);
    // console.log('Client ID ', this.id, ' processed successfully!');

    return fn(payload);
  }
}

/*
// from client
broadcast(buildPacketWithNonce([1,2,3,4,5]))

// from server
if(client.id != clientId) return;
const payload = client.processPayload(rawPacket);

*/

// Check which environment we are in and attach functions to the appropriate global scope
if (typeof window !== 'undefined') {
  // We are in a browser
  window.buildSecuredPacket = buildSecuredPacket;
  window.SecuredClient = SecuredClient;
} else if (typeof global !== 'undefined') {
  // We are in Node.js (CommonJS environment check)
  global.buildSecuredPacket = buildSecuredPacket;
  global.SecuredClient = SecuredClient;
}