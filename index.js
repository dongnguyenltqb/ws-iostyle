require('dotenv').config();
const Redis = require('ioredis');
const http = require('http');
const WebSocket = require('ws');

const server = http.createServer();
const wss = new WebSocket.Server({
  noServer: true,
  path: '/websocket',
});

const redis = new Redis();
const messageSubscriber = new Redis();
const messagePublisher = new Redis();
const nodeName = Math.random().toString(32);

// Socket.IO style
function join(roomId) {
  if (this.rooms.indexOf(roomId) < 0) {
    this.rooms.push(roomId);
  }
  console.log('current zoom:', this.id, this.rooms);
}
// Leave room
function leave(roomId) {
  this.rooms = this.rooms.filter((r) => r !== roomId);
}

// Send Message To Room (include sender)
function sendTo(roomId, data, local) {
  if (local) return;
  messagePublisher
    .publish(
      channelName,
      JSON.stringify({
        nodeName,
        data: {
          roomId,
          message: data,
        },
      }),
    )
    .catch((err) => {
      console.log(err);
    });
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN && ws.rooms.indexOf(roomId) > 0) {
      client.send(data);
    }
  });
}

// Broadcast message
function broadcast(data, local) {
  if (local) return;
  console.log('Broadcast Msg', data);
  messagePublisher
    .publish(
      channelName,
      JSON.stringify({
        nodeName,
        data: {
          message: data,
        },
      }),
    )
    .catch((err) => {
      console.log(err);
    });

  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Detect and close broken connections?
function heartbeat() {
  this.isAlive = true;
}
setInterval(function ping() {
  this.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

function register(event, func) {
  this.handleFunc.push({
    event,
    func,
  });
}

async function init(ws) {
  ws.id = await redis.incr('ws_count');
  ws.rooms = [];
  ws.join = join;
  ws.leave = leave;
  ws.sendTo = sendTo;
  ws.broadcast = broadcast;
  ws.handleFunc = [];
  ws.register = register;
  ws.join(ws.id);
}

wss.sendTo = sendTo;
wss.broadcast = broadcast;
// Handle connection
wss.on('connection', async function connection(ws) {
  // Set ID
  await init(ws);
  // Heartbeat
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  // Send welcome message
  ws.broadcast("Hello i'm " + ws.id);
  // Handle Message
  ws.on('message', function (msg) {
    msg = JSON.parse(msg);
    for (let listener of this.handleFunc) {
      if (listener.event == msg.event) listener.func(msg.data);
    }
  });
  // Register handle func
  ws.register('hello', function (data) {
    console.log('Event Hello', data);
  });
  ws.register('goodbye', async function (data) {
    console.log('Event goobye', data);
  });
  // Close connection
});

server.on('upgrade', async function (request, socket, head) {
  // do something with request
  wss.handleUpgrade(request, socket, head, function done(ws) {
    wss.emit('connection', ws);
  });
});

// Pub/Sub channel
const channelName = 'wsChan';
messageSubscriber.subscribe(channelName);
messageSubscriber.on('message', async (channel, message) => {
  if (channel == channelName)
    try {
      message = JSON.parse(message);
      let {nodeName, data} = message;
      if (message !== nodeName) {
        if (data.roomId) {
          wss.sendTo(roomId, data.message);
        } else {
          wss.broadcast(data.message, true);
        }
      }
    } catch (err) {
      console.log(err);
    }
});

server.listen(process.env.WS_PORT);
console.log('Server is listening on port : ', process.env.WS_PORT);

module.exports = wss;
