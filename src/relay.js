const WebSocket = require("ws");
const { URL } = require('url');
const server = new WebSocket.Server({ port: 3000 });

server.on("connection", (socket, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const room = url.searchParams.get('room') || 'default';
  socket.room = room;

  socket.on("message", msg => {
    // broadcast to everyone else
    server.clients.forEach(client => {
      if (client !== socket && client.readyState === WebSocket.OPEN && client.room==socket.room) {
        // client.send(msg.toString());
        client.send(msg);
      }
    });
  });
});

console.log('Relay server started at port 3000')