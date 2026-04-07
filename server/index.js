'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const gameState = require('./gameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, '../client')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // ── Join attempt ──────────────────────────────────────────────────────────
  const join = gameState.addPlayer(socket.id);

  if (!join.ok) {
    socket.emit('game:rejected', { reason: join.reason });
    socket.disconnect(true);
    return;
  }

  const color = join.color;
  socket.emit('player:joined', { color, playerId: socket.id });
  console.log(`  → ${color} assigned to ${socket.id}`);

  // Tell both clients the updated state
  io.emit('game:state', gameState.getClientState());

  // If both players are now connected, start the game
  if (gameState.playerCount() === 2) {
    gameState.startCurrentMinigame();
    io.emit('game:start', gameState.getClientState());
    console.log('  → Game started!');
  } else {
    socket.emit('game:waiting', { message: 'Waiting for opponent...' });
  }

  // ── Move request ──────────────────────────────────────────────────────────
  socket.on('move:request', ({ from, to, promotion }) => {
    const result = gameState.handleMove(socket.id, from, to, promotion);
    if (result.ok) {
      io.emit('move:update', gameState.getClientState());
      if (result.state?.status === 'finished') {
        io.emit('game:over', { winner: result.state.winner, scores: gameState.getClientState().scores });
      }
    } else {
      socket.emit('move:rejected', { error: result.error, needsPromotion: result.needsPromotion });
    }
  });

  // ── Drop request ──────────────────────────────────────────────────────────
  socket.on('drop:request', ({ piece, to }) => {
    const result = gameState.handleDrop(socket.id, piece, to);
    if (result.ok) {
      io.emit('move:update', gameState.getClientState());
      if (result.state?.status === 'finished') {
        io.emit('game:over', { winner: result.state.winner, scores: gameState.getClientState().scores });
      }
    } else {
      socket.emit('drop:rejected', { error: result.error });
    }
  });

  // ── Legal moves query (for UI highlighting) ───────────────────────────────
  socket.on('query:legalMoves', ({ r, c }) => {
    const moves = gameState.getLegalMoves(socket.id, r, c);
    socket.emit('query:legalMovesResult', { r, c, moves });
  });

  socket.on('query:legalDrops', ({ piece }) => {
    const drops = gameState.getLegalDrops(socket.id, piece);
    socket.emit('query:legalDropsResult', { piece, drops });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const lostColor = gameState.removePlayer(socket.id);
    console.log(`[-] Socket disconnected: ${socket.id} (was ${lostColor})`);
    if (lostColor) {
      io.emit('player:disconnected', { color: lostColor });
      io.emit('game:state', gameState.getClientState());
    }
  });

  // ── Reconnect attempt (explicit ping after page reload) ───────────────────
  socket.on('player:reconnect', () => {
    const reconnect = gameState.reconnectPlayer(socket.id);
    if (reconnect) {
      socket.emit('player:joined', { color: reconnect.color, playerId: socket.id });
      io.emit('game:state', gameState.getClientState());
      if (reconnect.resumed) {
        io.emit('game:resumed', gameState.getClientState());
      }
    } else {
      socket.emit('game:rejected', { reason: 'full' });
    }
  });
});

// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`🎮 Server running on http://localhost:${PORT}`);
});
