'use strict';

// ---------------------------------------------------------------------------
// Socket setup
// ---------------------------------------------------------------------------
const socket = io();

let myColor = null;
let gameState = null;
let phaserGame = null;

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------
function show(id)  { document.getElementById(id)?.classList.remove('hidden'); }
function hide(id)  { document.getElementById(id)?.classList.add('hidden'); }
function text(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function updateHUD(state) {
  if (!state?.gameState) return;
  const { gameState: gs, scores, checkState } = state;

  text('score-white', scores.white);
  text('score-black', scores.black);

  const turnEl = document.getElementById('hud-turn-color');
  if (turnEl) {
    turnEl.textContent = gs.turn.toUpperCase();
    turnEl.className = gs.turn;
  }

  const checkEl = document.getElementById('hud-check');
  if (checkEl) {
    const inCheck = (gs.turn === 'white' && checkState?.whiteInCheck) ||
                    (gs.turn === 'black' && checkState?.blackInCheck);
    checkEl.classList.toggle('hidden', !inCheck);
  }
}

// ---------------------------------------------------------------------------
// Socket events
// ---------------------------------------------------------------------------

socket.on('player:joined', ({ color }) => {
  myColor = color;
  const colorInfo = document.getElementById('waiting-color-info');
  if (colorInfo) {
    colorInfo.innerHTML = `You are <span class="color-badge ${color}">${color.toUpperCase()}</span>`;
  }
});

socket.on('game:waiting', () => {
  show('screen-waiting');
  hide('hud');
});

socket.on('game:start', (state) => {
  gameState = state;
  hide('screen-waiting');
  hide('screen-paused');
  show('hud');
  updateHUD(state);
  launchMinigame(state.currentMinigame);
});

socket.on('game:state', (state) => {
  gameState = state;
  updateHUD(state);

  if (state.status === 'paused') {
    show('screen-paused');
  }
});

socket.on('move:update', (state) => {
  gameState = state;
  updateHUD(state);
  hide('screen-paused');

  // Notify the active Phaser scene
  if (phaserGame) {
    const scene = phaserGame.scene.getScene('Minihouse');
    if (scene?.onStateUpdate) scene.onStateUpdate(state);
  }
});

socket.on('game:resumed', (state) => {
  gameState = state;
  hide('screen-paused');
  updateHUD(state);
});

socket.on('player:disconnected', ({ color }) => {
  show('screen-paused');
});

socket.on('game:over', ({ winner, scores }) => {
  hide('hud');
  const el = document.getElementById('gameover-winner');
  if (el) {
    el.textContent = winner.toUpperCase() + ' WINS';
    el.className = 'winner-text ' + winner;
  }
  show('screen-gameover');
});

socket.on('game:rejected', ({ reason }) => {
  hide('screen-waiting');
  show('screen-rejected');
});

socket.on('move:rejected', ({ error, needsPromotion }) => {
  if (needsPromotion) {
    // Should have been caught by client, but handle gracefully
    console.warn('Server asked for promotion');
  } else {
    console.warn('Move rejected:', error);
  }
});

// ---------------------------------------------------------------------------
// Minigame launcher
// ---------------------------------------------------------------------------
function launchMinigame(name) {
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
  }

  if (name === 'minihouse') {
    phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-container',
      backgroundColor: '#0d0d0f',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 900,
        height: 700,
      },
      scene: [MinihouseScene],
    });
  }
}

// ---------------------------------------------------------------------------
// Promotion modal
// ---------------------------------------------------------------------------
let promotionResolve = null;

function askPromotion() {
  return new Promise((resolve) => {
    promotionResolve = resolve;
    show('promotion-modal');
  });
}

document.querySelectorAll('.promo-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const piece = btn.dataset.piece;
    hide('promotion-modal');
    if (promotionResolve) {
      promotionResolve(piece);
      promotionResolve = null;
    }
  });
});

// Expose for scene
window.gameShell = { socket, getMyColor: () => myColor, getGameState: () => gameState, askPromotion };
