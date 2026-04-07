'use strict';

const BOARD_SIZE = 6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function opponent(color) {
  return color === 'white' ? 'black' : 'white';
}

function cloneBoard(board) {
  return board.map(row => row.map(cell => (cell ? { ...cell } : null)));
}

function cloneState(state) {
  return {
    board: cloneBoard(state.board),
    hands: {
      white: [...state.hands.white],
      black: [...state.hands.black],
    },
    turn: state.turn,
    status: state.status,
    winner: state.winner,
  };
}

// ---------------------------------------------------------------------------
// Initial board
// ---------------------------------------------------------------------------

/**
 * Starting layout (6x6, indices [row][col], row 0 = rank 1, col 0 = file a)
 *
 * White: King a1(r5,c0), Pawn a2(r4,c0), Rook b1(r5,c1), Knight c1(r5,c2), Bishop d1(r5,c3)
 * Black: King f6(r0,c5), Pawn f5(r1,c5), Rook e6(r0,c4), Knight d6(r0,c3), Bishop c6(r0,c2)
 */
function createInitialBoard() {
  const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

  // White pieces
  board[5][0] = { piece: 'king',   color: 'white' };
  board[4][0] = { piece: 'pawn',   color: 'white' };
  board[5][1] = { piece: 'rook',   color: 'white' };
  board[5][2] = { piece: 'knight', color: 'white' };
  board[5][3] = { piece: 'bishop', color: 'white' };

  // Black pieces
  board[0][5] = { piece: 'king',   color: 'black' };
  board[1][5] = { piece: 'pawn',   color: 'black' };
  board[0][4] = { piece: 'rook',   color: 'black' };
  board[0][3] = { piece: 'knight', color: 'black' };
  board[0][2] = { piece: 'bishop', color: 'black' };

  return board;
}

function createInitialGameState() {
  return {
    board: createInitialBoard(),
    hands: { white: [], black: [] },
    turn: 'white',
    status: 'playing',
    winner: null,
  };
}

// ---------------------------------------------------------------------------
// Raw move generation (ignores check)
// ---------------------------------------------------------------------------

function getPawnMoves(board, r, c, color) {
  const moves = [];
  const dir = color === 'white' ? -1 : 1; // white moves up (decreasing row), black moves down

  const nr = r + dir;
  if (inBounds(nr, c) && !board[nr][c]) {
    moves.push({ r: nr, c });
  }

  // Captures
  for (const dc of [-1, 1]) {
    const nc = c + dc;
    if (inBounds(nr, nc) && board[nr][nc] && board[nr][nc].color === opponent(color)) {
      moves.push({ r: nr, c: nc });
    }
  }

  return moves;
}

function getRookMoves(board, r, c, color) {
  const moves = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dr, dc] of dirs) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      if (board[nr][nc]) {
        if (board[nr][nc].color === opponent(color)) moves.push({ r: nr, c: nc });
        break;
      }
      moves.push({ r: nr, c: nc });
      nr += dr; nc += dc;
    }
  }
  return moves;
}

function getBishopMoves(board, r, c, color) {
  const moves = [];
  const dirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
  for (const [dr, dc] of dirs) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      if (board[nr][nc]) {
        if (board[nr][nc].color === opponent(color)) moves.push({ r: nr, c: nc });
        break;
      }
      moves.push({ r: nr, c: nc });
      nr += dr; nc += dc;
    }
  }
  return moves;
}

function getKnightMoves(board, r, c, color) {
  const moves = [];
  const offsets = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
  for (const [dr, dc] of offsets) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc) && (!board[nr][nc] || board[nr][nc].color === opponent(color))) {
      moves.push({ r: nr, c: nc });
    }
  }
  return moves;
}

function getKingMoves(board, r, c, color) {
  const moves = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && (!board[nr][nc] || board[nr][nc].color === opponent(color))) {
        moves.push({ r: nr, c: nc });
      }
    }
  }
  return moves;
}

function getRawMoves(board, r, c) {
  const cell = board[r][c];
  if (!cell) return [];
  const { piece, color } = cell;
  switch (piece) {
    case 'pawn':   return getPawnMoves(board, r, c, color);
    case 'rook':   return getRookMoves(board, r, c, color);
    case 'bishop': return getBishopMoves(board, r, c, color);
    case 'knight': return getKnightMoves(board, r, c, color);
    case 'king':   return getKingMoves(board, r, c, color);
    default:       return [];
  }
}

// ---------------------------------------------------------------------------
// Check detection
// ---------------------------------------------------------------------------

function findKing(board, color) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c]?.piece === 'king' && board[r][c]?.color === color) return { r, c };
    }
  }
  return null;
}

function isSquareAttackedBy(board, r, c, attackerColor) {
  for (let sr = 0; sr < BOARD_SIZE; sr++) {
    for (let sc = 0; sc < BOARD_SIZE; sc++) {
      if (board[sr][sc]?.color === attackerColor) {
        const moves = getRawMoves(board, sr, sc);
        if (moves.some(m => m.r === r && m.c === c)) return true;
      }
    }
  }
  return false;
}

function isInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return false;
  return isSquareAttackedBy(board, king.r, king.c, opponent(color));
}

// ---------------------------------------------------------------------------
// Apply move / drop (returns new board)
// ---------------------------------------------------------------------------

function applyMove(state, from, to, promotion) {
  const newState = cloneState(state);
  const { board, hands } = newState;
  const moving = board[from.r][from.c];
  const target = board[to.r][to.c];

  // Capture → add to hand (reverts promoted pawn back to pawn)
  if (target) {
    hands[moving.color].push('pawn'); // all captured pieces revert to pawn per minihouse rules... 
    // Actually: only promoted pawns revert. Normal pieces stay as-is.
    // We need to track "isPromoted" flag. Let's handle properly:
    hands[moving.color][hands[moving.color].length - 1] = target.isPromoted ? 'pawn' : target.piece;
  }

  board[to.r][to.c] = { piece: moving.piece, color: moving.color };
  board[from.r][from.c] = null;

  // Pawn promotion (white reaches row 0, black reaches row 5)
  const promotionRow = moving.color === 'white' ? 0 : 5;
  if (moving.piece === 'pawn' && to.r === promotionRow) {
    board[to.r][to.c] = { piece: promotion, color: moving.color, isPromoted: true };
  }

  return newState;
}

function applyDrop(state, piece, to) {
  const newState = cloneState(state);
  const { board, hands } = newState;
  const color = state.turn;

  // Remove one instance from hand
  const idx = hands[color].indexOf(piece);
  hands[color].splice(idx, 1);

  board[to.r][to.c] = { piece, color };
  return newState;
}

// ---------------------------------------------------------------------------
// Legal move validation
// ---------------------------------------------------------------------------

function isPromotion(board, from, to) {
  const cell = board[from.r][from.c];
  if (!cell || cell.piece !== 'pawn') return false;
  return (cell.color === 'white' && to.r === 0) || (cell.color === 'black' && to.r === 5);
}

function getLegalMoves(state, r, c) {
  const cell = state.board[r][c];
  if (!cell || cell.color !== state.turn) return [];

  const rawMoves = getRawMoves(state.board, r, c);
  return rawMoves.filter(to => {
    const needsPromotion = isPromotion(state.board, { r, c }, to);
    // For filtering check exposure, test with any valid promotion piece
    const testPromotion = needsPromotion ? 'rook' : undefined;
    const newState = applyMove(state, { r, c }, to, testPromotion);
    return !isInCheck(newState.board, cell.color);
  });
}

function getLegalDrops(state, piece) {
  const color = state.turn;
  const drops = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (state.board[r][c]) continue;

      // Pawns can't be dropped on first or last rank
      if (piece === 'pawn') {
        if (color === 'white' && r === 0) continue;
        if (color === 'black' && r === 5) continue;
        if (color === 'white' && r === 5) continue; // own back rank
        if (color === 'black' && r === 0) continue;
      }

      const newState = applyDrop(state, piece, { r, c });

      // Drop can't leave own king in check
      if (isInCheck(newState.board, color)) continue;

      // Drop can't deliver immediate checkmate (crazyhouse rule)
      if (isCheckmate(newState)) continue;

      drops.push({ r, c });
    }
  }
  return drops;
}

// ---------------------------------------------------------------------------
// Checkmate / stalemate
// ---------------------------------------------------------------------------

function hasAnyLegalMove(state) {
  const color = state.turn;

  // Check board moves
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (state.board[r][c]?.color === color) {
        if (getLegalMoves(state, r, c).length > 0) return true;
      }
    }
  }

  // Check drops
  const uniquePieces = [...new Set(state.hands[color])];
  for (const piece of uniquePieces) {
    if (getLegalDrops(state, piece).length > 0) return true;
  }

  return false;
}

function isCheckmate(state) {
  return isInCheck(state.board, state.turn) && !hasAnyLegalMove(state);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate and apply a board move.
 * Returns { ok, state, error, needsPromotion }
 */
function handleMove(state, from, to, promotion) {
  if (state.status !== 'playing') return { ok: false, error: 'Game not in progress' };

  const cell = state.board[from.r]?.[from.c];
  if (!cell) return { ok: false, error: 'No piece at source' };
  if (cell.color !== state.turn) return { ok: false, error: 'Not your turn' };

  const legal = getLegalMoves(state, from.r, from.c);
  const isLegal = legal.some(m => m.r === to.r && m.c === to.c);
  if (!isLegal) return { ok: false, error: 'Illegal move' };

  const needsPromotion = isPromotion(state.board, from, to);
  if (needsPromotion && !promotion) {
    return { ok: false, needsPromotion: true, error: 'Promotion piece required' };
  }

  const validPromotions = ['rook', 'bishop', 'knight'];
  if (needsPromotion && !validPromotions.includes(promotion)) {
    return { ok: false, error: 'Invalid promotion piece (no queens in Minihouse!)' };
  }

  let newState = applyMove(state, from, to, promotion);
  newState.turn = opponent(state.turn);

  // Check for checkmate after move
  if (isCheckmate(newState)) {
    newState.status = 'finished';
    newState.winner = state.turn; // the player who just moved wins
  }

  return { ok: true, state: newState };
}

/**
 * Validate and apply a drop.
 * Returns { ok, state, error }
 */
function handleDrop(state, piece, to) {
  if (state.status !== 'playing') return { ok: false, error: 'Game not in progress' };

  const color = state.turn;
  if (!state.hands[color].includes(piece)) return { ok: false, error: 'Piece not in hand' };

  const legal = getLegalDrops(state, piece);
  const isLegal = legal.some(m => m.r === to.r && m.c === to.c);
  if (!isLegal) return { ok: false, error: 'Illegal drop' };

  let newState = applyDrop(state, piece, to);
  newState.turn = opponent(color);

  if (isCheckmate(newState)) {
    newState.status = 'finished';
    newState.winner = color;
  }

  return { ok: true, state: newState };
}

/**
 * Get all legal destinations for a piece at (r,c), plus legal drop squares for hand pieces.
 */
function getLegalMovesForClient(state, r, c) {
  return getLegalMoves(state, r, c);
}

function getLegalDropsForClient(state, piece) {
  return getLegalDrops(state, piece);
}

function getCheckState(state) {
  return {
    whiteInCheck: isInCheck(state.board, 'white'),
    blackInCheck: isInCheck(state.board, 'black'),
  };
}

module.exports = {
  createInitialGameState,
  handleMove,
  handleDrop,
  getLegalMovesForClient,
  getLegalDropsForClient,
  getCheckState,
  isCheckmate,
};
