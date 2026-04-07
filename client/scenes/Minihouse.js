'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CELL = 90;           // px per cell
const BOARD_OFFSET_X = 90; // left margin
const BOARD_OFFSET_Y = 40; // top margin
const COLS = 6;
const ROWS = 6;

const PIECE_SYMBOLS = {
  king:   { white: 'wK', black: 'bK' },
  queen:  { white: 'wQ', black: 'bQ' },
  rook:   { white: 'wR', black: 'bR' },
  bishop: { white: 'wB', black: 'bB' },
  knight: { white: 'wN', black: 'bN' },
  pawn:   { white: 'wP', black: 'bP' },
};

const COLOR_LIGHT   = 0xf0ead6;
const COLOR_DARK    = 0x2a1f3d;
const COLOR_SELECT  = 0xff4d6d;
const COLOR_LEGAL   = 0x4dffb4;
const COLOR_CHECK   = 0xff4d6d;
const COLOR_LASTMOVE = 0xffd166;

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
class MinihouseScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Minihouse' });
    this.selected     = null;   // { r, c } or { handPiece, color }
    this.legalMoves   = [];
    this.boardGraphics = null;
    this.pieceImages   = [];
    this.handGraphics  = null;
    this.handItems     = [];
    this.lastMove      = null;  // { from, to } for highlight
  }

  // ── Preload ───────────────────────────────────────────────────────────────
  preload() {
    const baseUrl = 'https://upload.wikimedia.org/wikipedia/commons';
    const pieces = {
      wK: '/4/42/Chess_klt45.svg', wQ: '/1/15/Chess_qlt45.svg',
      wR: '/7/72/Chess_rlt45.svg', wB: '/b/b1/Chess_blt45.svg',
      wN: '/7/70/Chess_nlt45.svg', wP: '/4/45/Chess_plt45.svg',
      bK: '/f/f0/Chess_kdt45.svg', bQ: '/4/47/Chess_qdt45.svg',
      bR: '/f/ff/Chess_rdt45.svg', bB: '/9/98/Chess_bdt45.svg',
      bN: '/e/ef/Chess_ndt45.svg', bP: '/c/c7/Chess_pdt45.svg'
    };

    Object.entries(pieces).forEach(([key, path]) => {
      this.load.svg(key, baseUrl + path, { width: CELL, height: CELL });
    });
  }

  // ── Create ────────────────────────────────────────────────────────────────
  create() {
    this.boardGraphics = this.add.graphics();
    this.handGraphics  = this.add.graphics();

    // File / rank labels
    this.createLabels();

    // Board click handler
    this.input.on('pointerdown', this.handleClick, this);

    // Initial render
    const state = window.gameShell.getGameState();
    if (state?.gameState) this.renderAll(state);
  }

  // ── State update (called from main.js) ───────────────────────────────────
  onStateUpdate(state) {
    this.selected = null;
    this.legalMoves = [];
    this.renderAll(state);
  }

  // ── Full render ───────────────────────────────────────────────────────────
  renderAll(state) {
    if (!state?.gameState) return;
    this.renderBoard(state);
    this.renderPieces(state.gameState.board, state.gameState.turn, state.checkState);
    this.renderHands(state.gameState.hands);
  }

  // ── Board squares ─────────────────────────────────────────────────────────
  renderBoard(state) {
    const g = this.boardGraphics;
    g.clear();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = BOARD_OFFSET_X + c * CELL;
        const y = BOARD_OFFSET_Y + r * CELL;

        let color = (r + c) % 2 === 0 ? COLOR_LIGHT : COLOR_DARK;

        // Last move highlight
        if (this.lastMove) {
          const { from, to } = this.lastMove;
          if ((from && from.r === r && from.c === c) || (to.r === r && to.c === c)) {
            color = COLOR_LASTMOVE;
          }
        }

        // Selection highlight
        if (this.selected?.r === r && this.selected?.c === c) {
          color = COLOR_SELECT;
        }

        // Legal move dots
        const isLegal = this.legalMoves.some(m => m.r === r && m.c === c);

        g.fillStyle(color, 1);
        g.fillRect(x, y, CELL, CELL);

        // Legal move indicator
        if (isLegal) {
          const hasTarget = state.gameState?.board[r][c] !== null;
          if (hasTarget) {
            // Ring around occupied legal square
            g.lineStyle(4, COLOR_LEGAL, 0.9);
            g.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
          } else {
            g.fillStyle(COLOR_LEGAL, 0.45);
            g.fillCircle(x + CELL / 2, y + CELL / 2, 14);
          }
        }

        // Grid lines
        g.lineStyle(1, 0x000000, 0.15);
        g.strokeRect(x, y, CELL, CELL);
      }
    }
  }

  // ── Piece rendering ───────────────────────────────────────────────────────
  renderPieces(board, turn, checkState) {
    // Destroy old image objects
    this.pieceImages.forEach(img => img.destroy());
    this.pieceImages = [];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (!cell) continue;

        const x = BOARD_OFFSET_X + c * CELL + CELL / 2;
        const y = BOARD_OFFSET_Y + r * CELL + CELL / 2;

        const textureKey = PIECE_SYMBOLS[cell.piece]?.[cell.color];
        if (!textureKey) continue;

        const img = this.add.image(x, y, textureKey).setDisplaySize(CELL * 0.8, CELL * 0.8);

        // Check highlight glow for king
        if (cell.piece === 'king') {
          if (cell.color === 'white' && checkState?.whiteInCheck) img.setTint(0xff4d6d);
          if (cell.color === 'black' && checkState?.blackInCheck) img.setTint(0xff4d6d);
        }

        this.pieceImages.push(img);
      }
    }
  }

  // ── Hand rendering ────────────────────────────────────────────────────────
  renderHands(hands) {
    const g = this.handGraphics;
    g.clear();
    this.handItems.forEach(item => item.destroy());
    this.handItems = [];

    const myColor = window.gameShell.getMyColor();

    // White hand at bottom, black hand at top
    this.renderHandPanel(hands.white, 'white', 620, myColor === 'white');
    this.renderHandPanel(hands.black, 'black', 10,  myColor === 'black');
  }

  renderHandPanel(hand, color, panelY, isMe) {
    if (!hand || hand.length === 0) return;

    // Count pieces
    const counts = {};
    hand.forEach(p => { counts[p] = (counts[p] || 0) + 1; });

    const g = this.handGraphics;
    const panelX = BOARD_OFFSET_X + COLS * CELL + 20;
    const panelW = 160;
    const panelH = 60;

    // Panel background
    g.fillStyle(color === 'white' ? 0xf0ead6 : 0x2a1f3d, 0.15);
    g.fillRoundedRect(panelX, panelY, panelW, panelH, 6);
    g.lineStyle(1, color === 'white' ? 0xf0ead6 : 0x4dffb4, 0.4);
    g.strokeRoundedRect(panelX, panelY, panelW, panelH, 6);

    // Label
    const labelColor = color === 'white' ? '#f0ead6' : '#4dffb4';
    const label = this.add.text(panelX + 8, panelY + 4, isMe ? 'YOUR HAND' : 'OPPONENT', {
      fontSize: '9px', color: labelColor, alpha: 0.6,
    });
    this.handItems.push(label);

    // Pieces
    let ix = panelX + 8;
    let pieceIdx = 0;
    Object.entries(counts).forEach(([piece, count]) => {
      const textureKey = PIECE_SYMBOLS[piece]?.[color];
      const isSelected = this.selected?.handPiece === piece && this.selected?.color === color;
      const canInteract = isMe;

      // Highlight if selected
      if (isSelected) {
        g.fillStyle(COLOR_SELECT, 0.4);
        g.fillRoundedRect(ix - 2, panelY + 18, 32, 36, 4);
      }

      if (!textureKey) return;

      const pt = this.add.image(ix + 14, panelY + 36, textureKey).setDisplaySize(32, 32);

      if (count > 1) {
        const ct = this.add.text(ix + 18, panelY + 38, `×${count}`, {
          fontSize: '10px', color: labelColor, stroke: '#000', strokeThickness: 2
        }).setDepth(1);
        this.handItems.push(ct);
      }

      // Store metadata for click detection
      pt.setInteractive();
      pt.on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        if (canInteract) this.selectHandPiece(piece, color);
      });

      this.handItems.push(pt);
      ix += 36;
      pieceIdx++;
    });
  }

  // ── Labels ────────────────────────────────────────────────────────────────
  createLabels() {
    const files = ['a','b','c','d','e','f'];
    const ranks = ['1','2','3','4','5','6'];

    for (let c = 0; c < COLS; c++) {
      this.add.text(
        BOARD_OFFSET_X + c * CELL + CELL / 2,
        BOARD_OFFSET_Y + ROWS * CELL + 6,
        files[c],
        { fontSize: '12px', color: '#6b6b80', fontFamily: 'Space Mono' }
      ).setOrigin(0.5, 0);
    }

    for (let r = 0; r < ROWS; r++) {
      this.add.text(
        BOARD_OFFSET_X - 18,
        BOARD_OFFSET_Y + r * CELL + CELL / 2,
        ranks[ROWS - 1 - r],
        { fontSize: '12px', color: '#6b6b80', fontFamily: 'Space Mono' }
      ).setOrigin(0.5, 0.5);
    }
  }

  // ── Click handling ────────────────────────────────────────────────────────
  handleClick(pointer) {
    const state = window.gameShell.getGameState();
    if (!state?.gameState || state.status !== 'playing') return;

    const myColor = window.gameShell.getMyColor();
    if (state.gameState.turn !== myColor) return;

    // Convert pointer to board coords
    const c = Math.floor((pointer.x - BOARD_OFFSET_X) / CELL);
    const r = Math.floor((pointer.y - BOARD_OFFSET_Y) / CELL);

    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) {
      // Clicked outside board — deselect
      this.deselect();
      return;
    }

    const clickedCell = state.gameState.board[r][c];

    // ── Case 1: hand piece selected → try to drop ──────────────────────────
    if (this.selected?.handPiece) {
      const isLegalDrop = this.legalMoves.some(m => m.r === r && m.c === c);
      if (isLegalDrop) {
        window.gameShell.socket.emit('drop:request', {
          piece: this.selected.handPiece,
          to: { r, c },
        });
        this.lastMove = { from: null, to: { r, c } };
        this.deselect();
      } else {
        // Clicked elsewhere — deselect or re-select if own piece
        if (clickedCell?.color === myColor) {
          this.selectBoardPiece(r, c);
        } else {
          this.deselect();
        }
      }
      return;
    }

    // ── Case 2: board piece selected → try to move ─────────────────────────
    if (this.selected && 'r' in this.selected) {
      const isLegal = this.legalMoves.some(m => m.r === r && m.c === c);
      if (isLegal) {
        this.doMove(this.selected, { r, c }, state);
        return;
      }
      // Clicked another own piece → re-select
      if (clickedCell?.color === myColor) {
        this.selectBoardPiece(r, c);
        return;
      }
      this.deselect();
      return;
    }

    // ── Case 3: nothing selected → select own piece ────────────────────────
    if (clickedCell?.color === myColor) {
      this.selectBoardPiece(r, c);
    }
  }

  async doMove(from, to, state) {
    const movingPiece = state.gameState.board[from.r][from.c];
    const isPromotion =
      movingPiece?.piece === 'pawn' &&
      ((movingPiece.color === 'white' && to.r === 0) ||
       (movingPiece.color === 'black' && to.r === 5));

    let promotion = undefined;
    if (isPromotion) {
      promotion = await window.gameShell.askPromotion();
    }

    window.gameShell.socket.emit('move:request', { from, to, promotion });
    this.lastMove = { from, to };
    this.deselect();
  }

  selectBoardPiece(r, c) {
    this.selected = { r, c };
    this.legalMoves = [];

    window.gameShell.socket.once('query:legalMovesResult', ({ r: qr, c: qc, moves }) => {
      if (this.selected?.r === qr && this.selected?.c === qc) {
        this.legalMoves = moves;
        const state = window.gameShell.getGameState();
        if (state) this.renderAll(state);
      }
    });
    window.gameShell.socket.emit('query:legalMoves', { r, c });
  }

  selectHandPiece(piece, color) {
    this.selected = { handPiece: piece, color };
    this.legalMoves = [];

    window.gameShell.socket.once('query:legalDropsResult', ({ piece: qp, drops }) => {
      if (this.selected?.handPiece === qp) {
        this.legalMoves = drops;
        const state = window.gameShell.getGameState();
        if (state) this.renderAll(state);
      }
    });
    window.gameShell.socket.emit('query:legalDrops', { piece });
  }

  deselect() {
    this.selected = null;
    this.legalMoves = [];
    const state = window.gameShell.getGameState();
    if (state) this.renderAll(state);
  }
}

// Expose to main.js
window.MinihouseScene = MinihouseScene;