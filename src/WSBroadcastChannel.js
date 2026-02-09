class WSBroadcastChannel {
  constructor(name, url = "ws://localhost:3000") {
    this.name = name;
    this.url = url;
    this.ws = new WebSocket(`${url}/?room=${encodeURIComponent(name)}`);
    this._onmessage = null;
    this._queue = []; // store messages until ready

    this.ws.addEventListener("open", () => {
      // flush queued messages
      while (this._queue.length > 0) {
        this.ws.send(this._queue.shift());
      }
    });

    this.ws.addEventListener("message", async (e) => {
      let data = e.data;

      if(e.data instanceof Blob) {
        data = new Uint8Array(await e.data.arrayBuffer());
      }
      // try { data = JSON.parse(data); } catch {}
      if (this._onmessage) {
        this._onmessage({ data });
      }
    });
  }

  postMessage(message) {
    // const msg = typeof message === "string" ? message : JSON.stringify(message);
    const msg = message;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this._queue.push(msg); // buffer until open
    }
  }

  set onmessage(handler) {
    this._onmessage = handler;
  }

  get onmessage() {
    return this._onmessage;
  }

  close() {
    this.ws.close();
  }
}