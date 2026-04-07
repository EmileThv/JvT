'use strict';

const minihouse = require('./minigames/minihouse');

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

let session = {
  players: { white: null, black: null }, // socket IDs
  status: 'waiting',                      // waiting | playing | paused | finished
  currentMinigame: 'minihouse',
  scores: { white: 0, black: 0 },
  gameState: null,
};

function resetSession() {
  session = {
    players: { white: null, black: null },
    status: 'waiting',
    currentMinigame: 'minihouse',
    scores: { white: 0, black: 0 },
    gameState: null,
  };
}

// ---------------------------------------------------------------------------
// Player management
// ---------------------------------------------------------------------------

function getPlayerColor(socketId) {
  if (session.players.white === socketId) return 'white';
  if (session.players.black === socketId) return 'black';
  return null;
}

function playerCount() {
  return (session.players.white ? 1 : 0) + (session.players.black ? 1 : 0);
}

/**
 * Try to add a player. Returns { ok, color, reason }
 */
function addPlayer(socketId) {
  if (!session.players.white) {
    session.players.white = socketId;
    return { ok: true, color: 'white' };
  }
  if (!session.players.black) {
    session.players.black = socketId;
    return { ok: true, color: 'black' };
  }
  return { ok: false, reason: 'full' };
}

/**
 * Remove a player (disconnect). Returns their color.
 */
function removePlayer(socketId) {
  const color = getPlayerColor(socketId);
  if (color) {
    session.players[color] = null;
    if (session.status === 'playing') {
      session.status = 'paused';
    }
    // If both players gone, reset
    if (!session.players.white && !session.players.black) {
      resetSession();
    }
  }
  return color;
}

/**
 * Reconnect a player to their old color slot if it's empty.
 * (Since there's no auth, we just fill whichever slot is open — 
 *  works fine for 2 dedicated friends.)
 */
function reconnectPlayer(socketId) {
  if (!session.players.white) {
    session.players.white = socketId;
    if (session.players.black) session.status = 'playing';
    return { color: 'white', resumed: session.status === 'playing' };
  }
  if (!session.players.black) {
    session.players.black = socketId;
    if (session.players.white) session.status = 'playing';
    return { color: 'black', resumed: session.status === 'playing' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Game start
// ---------------------------------------------------------------------------

function startCurrentMinigame() {
  if (session.currentMinigame === 'minihouse') {
    session.gameState = minihouse.createInitialGameState();
  }
  session.status = 'playing';
}

// ---------------------------------------------------------------------------
// Move / drop delegation
// ---------------------------------------------------------------------------

function handleMove(socketId, from, to, promotion) {
  const color = getPlayerColor(socketId);
  if (!color) return { ok: false, error: 'Not a player' };
  if (session.status !== 'playing') return { ok: false, error: 'Game not active' };

  if (session.currentMinigame === 'minihouse') {
    const result = minihouse.handleMove(session.gameState, from, to, promotion);
    if (result.ok) {
      session.gameState = result.state;
      if (result.state.status === 'finished') {
        session.status = 'finished';
        session.scores[result.state.winner]++;
      }
    }
    return result;
  }

  return { ok: false, error: 'Unknown minigame' };
}

function handleDrop(socketId, piece, to) {
  const color = getPlayerColor(socketId);
  if (!color) return { ok: false, error: 'Not a player' };
  if (session.status !== 'playing') return { ok: false, error: 'Game not active' };

  if (session.currentMinigame === 'minihouse') {
    const result = minihouse.handleDrop(session.gameState, piece, to);
    if (result.ok) {
      session.gameState = result.state;
      if (result.state.status === 'finished') {
        session.status = 'finished';
        session.scores[result.state.winner]++;
      }
    }
    return result;
  }

  return { ok: false, error: 'Unknown minigame' };
}

function getLegalMoves(socketId, r, c) {
  const color = getPlayerColor(socketId);
  if (!color || session.status !== 'playing') return [];
  if (session.currentMinigame === 'minihouse') {
    return minihouse.getLegalMovesForClient(session.gameState, r, c);
  }
  return [];
}

function getLegalDrops(socketId, piece) {
  const color = getPlayerColor(socketId);
  if (!color || session.status !== 'playing') return [];
  if (session.currentMinigame === 'minihouse') {
    return minihouse.getLegalDropsForClient(session.gameState, piece);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Serialise state for clients
// ---------------------------------------------------------------------------

function getClientState() {
  const checkState = session.gameState
    ? minihouse.getCheckState(session.gameState)
    : { whiteInCheck: false, blackInCheck: false };

  return {
    status: session.status,
    currentMinigame: session.currentMinigame,
    scores: session.scores,
    players: {
      white: !!session.players.white,
      black: !!session.players.black,
    },
    gameState: session.gameState,
    checkState,
  };
}

module.exports = {
  addPlayer,
  removePlayer,
  reconnectPlayer,
  playerCount,
  getPlayerColor,
  startCurrentMinigame,
  handleMove,
  handleDrop,
  getLegalMoves,
  getLegalDrops,
  getClientState,
  getSession: () => session,
};
