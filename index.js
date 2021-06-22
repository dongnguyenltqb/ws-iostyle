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

function onMessage(msg) {
  try {
    msg = JSON.parse(msg);
    let {event} = msg;
    let handleFuncs = this.handleFunc.get(event);
    if (handleFuncs?.length > 0)
      for (let listener of handleFuncs) {
        if (listener.event == msg.event) listener.func(msg.data);
      }
  } catch (err) {
    console.log(err);
  }
}

// Detect and close broken connections?
function heartbeat() {
  this.isAlive = true;
}
setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

function register(event, func) {
  let funcs = this.handleFunc.get(event) || [];
  funcs.push({
    event,
    func,
  });
  this.handleFunc.set(event, funcs);
}

async function init(ws) {
  ws.id = await redis.incr('ws_count');
  ws.rooms = [];
  ws.join = join;
  ws.leave = leave;
  ws.sendTo = sendTo;
  ws.broadcast = broadcast;
  ws.handleFunc = new Map();
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
  ws.on('message', onMessage);

  // Register handle func
  ws.register('join', function (data) {
    for (let roomId of data) ws.join(roomId);
  });
  ws.register('leave', function (data) {
    for (let roomId of data) ws.leave(roomId);
  });

  ws.register('hello', function (data) {
    console.log('Event Hello', data);
  });
  ws.register('goodbye', async function (data) {
    console.log('Event goobye', data);
  });
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
