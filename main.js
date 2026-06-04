// POLYFDOS — The War for Love
// 1v1 board game on an hourglass grid: two triangles meeting at the Heart.
// Player 1's tribe starts at the top base, Player 2's tribe at the bottom base.
// Each player commands 7 archetypes — Lover, Warrior, Sage, Fool, Traitor, Guardian, Dreamer.
// Each archetype has a Good quality and a Bad quality; Bad qualities are powerful but usually cost the character.
// First character to reach the Heart wins. If all your characters are exiled, you lose.

// ============================================================
// CONSTANTS
// ============================================================

const BOARD_SIZE = 7;          // 7x7 square grid
const HEART_R = 4, HEART_C = 4;  // the centre cell — The Heart

// Named pieces — the seven archetypes that must be killed to clear the way for the Soldier's Crown.
const TYPES = ['LOVER', 'WARRIOR', 'SAGE', 'FOOL', 'TRAITOR', 'GUARDIAN', 'DREAMER'];
const SIDES = ['P1', 'P2'];
const PIECES_PER_SIDE = TYPES.length + 1;   // 7 named + 1 Soldier = 8

// Each player has the 7 named pieces and 1 Soldier (the banner-bearer).
function allChars() {
  const all = [];
  for (const s of SIDES) {
    for (const t of TYPES) all.push(`${s}_${t}`);
    all.push(`${s}_SOLDIER`);
  }
  return all;
}
const CHARS = allChars();

const sideOf = id => id.startsWith('P1_') ? 'P1' : 'P2';
const typeOf = id => id.slice(3);              // after "P1_" or "P2_"
const otherSide = s => (s === 'P1' ? 'P2' : 'P1');

// Each character has ONE movement pattern. No good/bad choice.
const CHAR_DEFS = {
  LOVER:    { name: 'The Lover',    icon: '♥', tag: 'The Beloved — your crown-piece.',
              move: 'Moves 1 cell — only toward the Heart. Captures by displacement. She is the only piece that can win the game.' },
  WARRIOR:  { name: 'The Warrior',  icon: '⚔', tag: 'Steady and close at hand.',
              move: 'Moves 1 cell in any of the 8 directions. Captures by displacement.' },
  SAGE:     { name: 'The Sage',     icon: '✦', tag: 'Sees along the diagonals.',
              move: 'Moves any number of cells diagonally. Stops at the first piece; captures it if it is an enemy.' },
  TRAITOR:  { name: 'The Traitor',  icon: '⚯', tag: 'Stalks the straight lines.',
              move: 'Moves any number of cells orthogonally. Stops at the first piece; captures it if it is an enemy.' },
  FOOL:     { name: 'The Fool',     icon: '◊', tag: 'Jumps where no one expects.',
              move: 'Moves in an L-shape (2 + 1). Jumps over anything; captures by landing.' },
  GUARDIAN: { name: 'The Guardian', icon: '⚜', tag: 'A short, fierce queen.',
              move: 'Moves up to 2 cells in a straight line in any of the 8 directions. Captures by landing.' },
  DREAMER:  { name: 'The Dreamer',  icon: '☾', tag: 'Quick, but harmless.',
              move: 'Moves up to 3 cells in a straight line in any direction. Cannot capture — must end on an empty cell.' },
  SOLDIER:  { name: 'The Soldier',  icon: '⚑', tag: 'The vanguard — a pawn that pushes the line.',
              move: 'Moves 1 cell straight forward. Captures 1 cell diagonally forward. Cannot retreat.' },
};

const PHASE = {
  SETUP:       'setup',          // before play — each side arranges its home row
  PLAY:        'play',
  CHAR_PICKED: 'char_picked',
  TARGETING:   'targeting',
  GUARDIAN_2:  'guardian_target',
  OVER:        'over',
};

// ============================================================
// 7x7 SQUARE GRID UTILITIES
// ============================================================

function isValidCell(r, c) {
  return Number.isInteger(r) && Number.isInteger(c) && r >= 1 && r <= BOARD_SIZE && c >= 1 && c <= BOARD_SIZE;
}

// World position: cell (r, c) lays on a regular grid centred at the origin.
// Row 1 sits at z = -3 (P1's home, nearest the camera). Row 7 at z = +3.
function worldPos(r, c) {
  return { x: c - (BOARD_SIZE + 1) / 2, z: r - (BOARD_SIZE + 1) / 2 };
}

function allCells() {
  const out = [];
  for (let r = 1; r <= BOARD_SIZE; r++)
    for (let c = 1; c <= BOARD_SIZE; c++)
      out.push([r, c]);
  return out;
}

// 8-neighbour adjacency (orthogonal + diagonal) on the square grid.
function neighborsOf(r, c) {
  const ns = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (isValidCell(nr, nc)) ns.push([nr, nc]);
    }
  }
  return ns;
}

// Chebyshev distance from a cell to the Heart at (4, 4).
const distToHeart = (r, c) => Math.max(Math.abs(r - HEART_R), Math.abs(c - HEART_C));

// The Sacred Ring: the 5 cells forming a "+" centred on the Heart —
// the Heart itself plus its 4 orthogonal neighbours.
// No move may travel more than 1 cell whose DESTINATION is in this ring.
const inSacredRing = (r, c) =>
  (r === HEART_R && Math.abs(c - HEART_C) <= 1) ||
  (c === HEART_C && Math.abs(r - HEART_R) <= 1);

// A move from (r, c) → (r', c') is "toward Heart" if Chebyshev distance to the Heart strictly decreases.
function isTowardHeart(r1, c1, r2, c2) {
  return distToHeart(r2, c2) < distToHeart(r1, c1);
}

// Is at least one of the same side's other pieces on a cell adjacent to (r, c)?
function hasAdjacentFriend(state, id) {
  const p = state.pos[id];
  if (!p || p === 'EXILED') return false;
  const side = sideOf(id);
  for (const [nr, nc] of neighborsOf(p.r, p.c)) {
    const occ = charAt(state, nr, nc);
    if (occ && occ !== id && sideOf(occ) === side) return true;
  }
  return false;
}

// Count own-side pieces adjacent to (r, c) on the board (used by the AI).
function escortCount(state, id) {
  const p = state.pos[id];
  if (!p || p === 'EXILED') return 0;
  const side = sideOf(id);
  let n = 0;
  for (const [nr, nc] of neighborsOf(p.r, p.c)) {
    const occ = charAt(state, nr, nc);
    if (occ && occ !== id && sideOf(occ) === side) n++;
  }
  return n;
}

// Filter neighbours to only those strictly closer to the Heart.
function upNeighbors(r, c) {
  const d = distToHeart(r, c);
  return neighborsOf(r, c).filter(([nr, nc]) => distToHeart(nr, nc) < d);
}

// ============================================================
// GAME STATE
// ============================================================

function createInitialState() {
  // 7 named pieces per side on the back rank, plus 1 Soldier each on row 2/6, centre column.
  const pos = {};
  for (let i = 0; i < 7; i++) {
    pos[`P1_${TYPES[i]}`] = { r: 1, c: i + 1 };
    pos[`P2_${TYPES[i]}`] = { r: 7, c: i + 1 };
  }
  pos['P1_SOLDIER'] = { r: 2, c: 4 };
  pos['P2_SOLDIER'] = { r: 6, c: 4 };
  return {
    pos,
    turn: 'P1',
    phase: PHASE.SETUP,                        // both sides arrange their home row first
    setupSide: 'P1',                           // which side is currently arranging
    selectedChar: null,
    winner: null, winReason: null,
    winningChar: null,
    moveCount: 0,
    exileCount: 0,                            // soft counter, displayed in HUD
  };
}

// Heart is always open in this design — no seal.
function canEnterCell(_state, _r, _c) { return true; }

function charAt(state, r, c) {
  for (const id of CHARS) {
    const p = state.pos[id];
    if (p && typeof p === 'object' && p.r === r && p.c === c) return id;
  }
  return null;
}

function isEmpty(state, r, c) {
  return isValidCell(r, c) && !charAt(state, r, c);
}

function isOnBoard(state, id) {
  return state.pos[id] && state.pos[id] !== 'EXILED';
}

function canMove(state, id) {
  return isOnBoard(state, id) && sideOf(id) === state.turn;
}

// ============================================================
// LEGAL MOVES
// ============================================================

// ============================================================
// LEGAL MOVES — chess-style, one pattern per character
// ============================================================
//
// Every legal move has the shape: { kind: 'move' | 'capture', dest: [r,c], targetChar?: id }
// 'capture' moves remove the enemy on `dest` (an enemy piece is at that cell).
// 'move' moves require the destination to be empty.

// The Lover is sacred — she cannot be captured by enemies. All other pieces are
// capturable per normal combat rules.
function isCapturableBy(targetId, capturingSide, state) {
  if (sideOf(targetId) === capturingSide) return false;
  if (typeOf(targetId) === 'LOVER') return false;
  return true;
}

// Walk in a straight line from (r, c) in direction (dr, dc) for up to `maxSteps` cells.
// Stops at the first piece; produces a 'capture' if it's an enemy.
// If `noCapture` is true, the walker stops one cell before any piece (no capture allowed).
function rayMoves(state, id, r, c, dr, dc, maxSteps, noCapture = false) {
  const out = [];
  const ownSide = sideOf(id);
  let nr = r + dr, nc = c + dc;
  let steps = 0;
  while (isValidCell(nr, nc) && steps < maxSteps) {
    const occupant = charAt(state, nr, nc);
    if (!occupant) {
      if (canEnterCell(state, nr, nc)) out.push({ kind: 'move', dest: [nr, nc] });
    } else {
      if (!noCapture && isCapturableBy(occupant, ownSide, state) && canEnterCell(state, nr, nc)) {
        out.push({ kind: 'capture', dest: [nr, nc], targetChar: occupant });
      }
      break;
    }
    nr += dr; nc += dc;
    steps++;
  }
  return out;
}

function legalMoves(state, id) {
  const p = state.pos[id];
  if (!p || p === 'EXILED') return [];
  const { r, c } = p;
  const type = typeOf(id);
  const ownSide = sideOf(id);
  const out = [];

  if (type === 'LOVER') {
    // 1 cell — only toward the Heart (strictly decreases Chebyshev distance).
    const cur = distToHeart(r, c);
    for (const [nr, nc] of neighborsOf(r, c)) {
      if (distToHeart(nr, nc) >= cur) continue;
      if (!canEnterCell(state, nr, nc)) continue;
      const occ = charAt(state, nr, nc);
      if (!occ) out.push({ kind: 'move', dest: [nr, nc] });
      else if (isCapturableBy(occ, ownSide, state)) out.push({ kind: 'capture', dest: [nr, nc], targetChar: occ });
    }
    return out;
  }

  if (type === 'WARRIOR') {
    // King — 1 cell in any of 8 directions
    for (const [nr, nc] of neighborsOf(r, c)) {
      if (!canEnterCell(state, nr, nc)) continue;
      const occ = charAt(state, nr, nc);
      if (!occ) out.push({ kind: 'move', dest: [nr, nc] });
      else if (isCapturableBy(occ, ownSide, state)) out.push({ kind: 'capture', dest: [nr, nc], targetChar: occ });
    }
    return out;
  }

  if (type === 'SAGE') {
    // Bishop — any cells along the 4 diagonals
    for (const [dr, dc] of [[-1,-1],[-1,+1],[+1,-1],[+1,+1]]) {
      out.push(...rayMoves(state, id, r, c, dr, dc, BOARD_SIZE));
    }
    return out;
  }

  if (type === 'TRAITOR') {
    // Rook — any cells along the 4 orthogonals
    for (const [dr, dc] of [[-1,0],[+1,0],[0,-1],[0,+1]]) {
      out.push(...rayMoves(state, id, r, c, dr, dc, BOARD_SIZE));
    }
    return out;
  }

  if (type === 'FOOL') {
    // Knight — L-shape jumps (2 + 1)
    const jumps = [[-2,-1],[-2,+1],[-1,-2],[-1,+2],[+1,-2],[+1,+2],[+2,-1],[+2,+1]];
    for (const [dr, dc] of jumps) {
      const nr = r + dr, nc = c + dc;
      if (!isValidCell(nr, nc)) continue;
      if (!canEnterCell(state, nr, nc)) continue;
      const occ = charAt(state, nr, nc);
      if (!occ) out.push({ kind: 'move', dest: [nr, nc] });
      else if (isCapturableBy(occ, ownSide, state)) out.push({ kind: 'capture', dest: [nr, nc], targetChar: occ });
    }
    return out;
  }

  if (type === 'GUARDIAN') {
    // Up to 2 cells in a straight line (8 directions). Captures by landing.
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,+1],[0,-1],[0,+1],[+1,-1],[+1,0],[+1,+1]]) {
      out.push(...rayMoves(state, id, r, c, dr, dc, 2));
    }
    return out;
  }

  if (type === 'DREAMER') {
    // Up to 3 cells in a straight line (8 directions). Pacifist — no capture.
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,+1],[0,-1],[0,+1],[+1,-1],[+1,0],[+1,+1]]) {
      out.push(...rayMoves(state, id, r, c, dr, dc, 3, /* noCapture */ true));
    }
    return out;
  }

  if (type === 'SOLDIER') {
    // Chess pawn: 1 cell straight forward (toward the enemy's home). Captures 1 cell diagonally forward.
    const forward = ownSide === 'P1' ? +1 : -1;
    const nr = r + forward;
    if (isValidCell(nr, c) && !charAt(state, nr, c)) {
      out.push({ kind: 'move', dest: [nr, c] });
    }
    for (const dc of [-1, +1]) {
      const nc = c + dc;
      if (!isValidCell(nr, nc)) continue;
      const occ = charAt(state, nr, nc);
      if (occ && isCapturableBy(occ, ownSide, state)) {
        out.push({ kind: 'capture', dest: [nr, nc], targetChar: occ });
      }
    }
    return out;
  }

  return out;
}

function hasAnyLegalMove(state, side) {
  for (const id of CHARS) {
    if (sideOf(id) !== side || !isOnBoard(state, id)) continue;
    if (legalMoves(state, id).length) return true;
  }
  return false;
}

function allOnBoardForSide(state, side) {
  return CHARS.filter(id => sideOf(id) === side && isOnBoard(state, id));
}

// ============================================================
// APPLY MOVE
// ============================================================

function exileChar(state, id) { state.pos[id] = 'EXILED'; }
function moveChar(state, id, r, c) { state.pos[id] = { r, c }; }

// THE LOTUS — the 8 cells immediately around the Heart. Win condition geometry.
const LOTUS_CELLS = (() => {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    out.push([HEART_R + dr, HEART_C + dc]);
  }
  return out;
})();

function isInLotus(r, c) {
  return Math.abs(r - HEART_R) <= 1 && Math.abs(c - HEART_C) <= 1 && !(r === HEART_R && c === HEART_C);
}

// Count how many of `side`'s pieces are on the 8 lotus cells (not the Heart itself).
function countEscorts(state, side) {
  let n = 0;
  for (const id of CHARS) {
    if (sideOf(id) !== side || !isOnBoard(state, id)) continue;
    const p = state.pos[id];
    if (isInLotus(p.r, p.c)) n++;
  }
  return n;
}

function applyMove(state, id, move) {
  if (move.kind === 'capture') {
    exileChar(state, move.targetChar);
    state.exileCount = (state.exileCount || 0) + 1;
  }
  moveChar(state, id, move.dest[0], move.dest[1]);

  state.moveCount++;
  state.selectedChar = null;

  // Switch turn before checking Embrace / Silence — both belong to the player about to move.
  state.turn = otherSide(state.turn);
  state.phase = PHASE.PLAY;

  // THE EMBRACE — at the start of your turn, your Lover stands on the Heart AND at least
  // 2 of your other pieces stand on the 8 lotus cells around her.
  const meLoverId = `${state.turn}_LOVER`;
  const lp = state.pos[meLoverId];
  if (lp && lp !== 'EXILED' && lp.r === HEART_R && lp.c === HEART_C) {
    const escorts = countEscorts(state, state.turn);
    if (escorts >= 2) {
      state.winner = state.turn; state.winReason = 'embrace'; state.winningChar = meLoverId;
      state.phase = PHASE.OVER; return;
    }
  }

  // THE SIEGE — the player about to move has no legal moves. By the rules of PYAAR this
  // almost always means their combat pieces are all gone and only the Lover remains, trapped.
  // The army opposite has won the siege.
  if (!hasAnyLegalMove(state, state.turn)) {
    state.winner = otherSide(state.turn);
    state.winReason = 'siege';
    state.phase = PHASE.OVER;
    return;
  }

  // SAFETY TURN LIMIT — only fires if both sides somehow lock into endless shuffling.
  // In a balanced game this never triggers; here as belt-and-suspenders for AI loops.
  if (state.moveCount >= 100) {
    const score = (side) => {
      const lp = state.pos[`${side}_LOVER`];
      if (!lp || lp === 'EXILED') return -1000;
      const dist = distToHeart(lp.r, lp.c);
      const atHeart = dist === 0 ? 1000 : 0;
      const escorts = countEscorts(state, side);
      return atHeart + (10 - dist) * 5 + escorts * 4;
    };
    const s1 = score('P1'), s2 = score('P2');
    state.winner = (s1 === s2) ? otherSide(state.turn) : (s1 > s2 ? 'P1' : 'P2');
    state.winReason = 'unresolved';
    state.phase = PHASE.OVER;
  }
}

// ============================================================
// 3D SCENE
// ============================================================

let scene, camera, renderer, controls, raycaster, pointer;
let boardGroup, cellMeshes = {};
let pieceObjs = {};
let heartTile, heartLight, heartFloater;
let highlightSet = new Set();
let pieceHighlightSet = new Set();
let animations = [];
let inputLocked = false;
let gameState;
let aiEnabled = true;          // Player 2 is the computer by default

// Exile trays sit OUTSIDE the hourglass, one for each side.
const EXILE_P1_X = -4.6;     // left tray (P1)
const EXILE_P2_X = +4.6;     // right tray (P2)
const EXILE_Z    = 0;        // centered vertically

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0814);
  scene.fog = new THREE.Fog(0x0a0814, 22, 55);

  camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  // Camera defaults to Player 1's side — your pieces sit big in the foreground.
  camera.position.set(0, 8.5, -8.5);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas: document.getElementById('game-canvas'),
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 18;
  controls.maxPolarAngle = Math.PI * 0.42;
  controls.rotateSpeed = 0.6;
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xfff2d8, 0.55);
  sun.position.set(5, 14, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;   sun.shadow.camera.bottom = -10;
  sun.shadow.camera.near = 1;   sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6688ff, 0.2);
  rim.position.set(-6, 8, -5);
  scene.add(rim);
  heartLight = new THREE.PointLight(0xff2548, 2.4, 10, 1.8);
  heartLight.position.set(0, 1.0, 0);
  scene.add(heartLight);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  boardGroup = new THREE.Group();
  scene.add(boardGroup);

  buildBoard();

  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
}

function buildBoard() {
  // Dark wooden base plate — enough to frame the 7x7 grid plus the two side exile trays.
  const baseW = 12.5, baseD = 8.5;
  const baseGeom = new THREE.BoxGeometry(baseW, 0.45, baseD);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x140d05, roughness: 0.92, metalness: 0.04,
  });
  const base = new THREE.Mesh(baseGeom, baseMat);
  base.position.set(0, -0.25, 0);
  base.receiveShadow = true;
  base.castShadow = true;
  boardGroup.add(base);

  // Thin gold inlay rim along the very edge
  const rimGeom = new THREE.BoxGeometry(baseW + 0.18, 0.03, baseD + 0.18);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x7c5418, roughness: 0.4, metalness: 0.85,
    emissive: 0x180c02, emissiveIntensity: 0.18,
  });
  const rim = new THREE.Mesh(rimGeom, rimMat);
  rim.position.set(0, -0.018, 0);
  rim.receiveShadow = true;
  boardGroup.add(rim);

  // 49 square tiles (checkerboard) with a 3x3 crimson Sacred Ring around the Heart.
  for (const [r, c] of allCells()) {
    const isHeart = (r === HEART_R && c === HEART_C);
    let color, emissive = 0x000000, emI = 0;
    if (isHeart) {
      color = 0x4a0a18; emissive = 0xff2244; emI = 0.9;
    } else {
      // Indian palette: saffron/marigold on Player 1's side, peacock-indigo on Player 2's, sandalwood on the middle row.
      const inP1Side = r < HEART_R;
      const inP2Side = r > HEART_R;
      const light = (r + c) % 2 === 0;
      if (inP1Side)       color = light ? 0xe2a445 : 0x8a3e1a;   // saffron · maroon
      else if (inP2Side)  color = light ? 0x6c9cb4 : 0x1f3a5a;   // peacock · deep indigo
      else                color = light ? 0xc7a878 : 0x5e4424;   // sandalwood · teak
    }
    const geom = new THREE.BoxGeometry(0.95, 0.12, 0.95);
    const mat = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: emI,
      roughness: 0.55, metalness: 0.08,
    });
    const tile = new THREE.Mesh(geom, mat);
    const wp = worldPos(r, c);
    tile.position.set(wp.x, 0.07, wp.z);
    tile.receiveShadow = true;
    tile.castShadow = true;
    tile.userData = {
      kind: 'cell', r, c,
      baseColor: color, baseEmissive: emissive, baseEmissiveI: emI,
    };
    boardGroup.add(tile);
    cellMeshes[`${r},${c}`] = tile;
    if (isHeart) heartTile = tile;
  }

  // Gold rail around the 7x7 playing area
  const half = BOARD_SIZE / 2;
  drawRail(-half, -half, +half, -half, 0.08, 0xd4a64e);
  drawRail(+half, -half, +half, +half, 0.08, 0xd4a64e);
  drawRail(+half, +half, -half, +half, 0.08, 0xd4a64e);
  drawRail(-half, +half, -half, -half, 0.08, 0xd4a64e);
  // Corner studs
  drawCornerStud(-half, -half, 0xffd070);
  drawCornerStud(+half, -half, 0xffd070);
  drawCornerStud(-half, +half, 0xcfd9ee);
  drawCornerStud(+half, +half, 0xcfd9ee);

  // Floating heart sigil over the centre
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, 0.18);
  heartShape.bezierCurveTo(0, 0.32, 0.18, 0.32, 0.18, 0.14);
  heartShape.bezierCurveTo(0.18, 0, 0, -0.1, 0, -0.22);
  heartShape.bezierCurveTo(0, -0.1, -0.18, 0, -0.18, 0.14);
  heartShape.bezierCurveTo(-0.18, 0.32, 0, 0.32, 0, 0.18);
  const heartGeom = new THREE.ExtrudeGeometry(heartShape, {
    depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2,
  });
  const heartMat = new THREE.MeshStandardMaterial({
    color: 0xff2244, emissive: 0xff3355, emissiveIntensity: 1.0,
    roughness: 0.3, metalness: 0.4,
  });
  const heartCentre = worldPos(HEART_R, HEART_C);
  heartFloater = new THREE.Mesh(heartGeom, heartMat);
  heartFloater.position.set(heartCentre.x, 1.05, heartCentre.z);
  heartFloater.rotation.x = Math.PI;
  heartFloater.castShadow = true;
  heartFloater.userData = { kind: 'deco' };
  boardGroup.add(heartFloater);
  animations.push({ update: now => {
    heartFloater.position.y = 1.05 + Math.sin(now * 0.0015) * 0.08;
    heartFloater.rotation.y = now * 0.0006;
    return false;
  }});

  // Two exile trays — one per side, off to the left and right of the board.
  buildExileTray(EXILE_P1_X, EXILE_Z, 'P1', 0xd4a64e);
  buildExileTray(EXILE_P2_X, EXILE_Z, 'P2', 0x8aa4c4);
}

function drawRail(x1, z1, x2, z2, thickness = 0.06, hex = 0xd4a64e) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz) + 0.1;
  const geom = new THREE.BoxGeometry(len, 0.13, thickness);
  const mat = new THREE.MeshStandardMaterial({
    color: hex, roughness: 0.35, metalness: 0.85,
    emissive: 0x1a0e04, emissiveIntensity: 0.18,
  });
  const rail = new THREE.Mesh(geom, mat);
  rail.position.set((x1 + x2) / 2, 0.065, (z1 + z2) / 2);
  rail.rotation.y = -Math.atan2(dz, dx);
  rail.receiveShadow = true;
  rail.castShadow = true;
  boardGroup.add(rail);
}

function drawCornerStud(x, z, hex = 0xffd070) {
  const geom = new THREE.SphereGeometry(0.13, 16, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: hex, roughness: 0.25, metalness: 0.95,
    emissive: 0x180a02, emissiveIntensity: 0.3,
  });
  const stud = new THREE.Mesh(geom, mat);
  stud.position.set(x, 0.14, z);
  stud.castShadow = true;
  boardGroup.add(stud);
}

function buildExileTray(cx, cz, label, accentHex) {
  // Dark recessed tray to receive the fallen
  const trayW = 1.6, trayD = 5.6;
  const trayGeom = new THREE.BoxGeometry(trayW, 0.06, trayD);
  const trayMat = new THREE.MeshStandardMaterial({
    color: 0x0c0810, roughness: 0.95, metalness: 0.03,
  });
  const tray = new THREE.Mesh(trayGeom, trayMat);
  tray.position.set(cx, 0.03, cz);
  tray.receiveShadow = true;
  boardGroup.add(tray);

  // Bronze frame around the tray (a hollow rectangle)
  const ringW = trayW + 0.18, ringD = trayD + 0.18;
  const shape = new THREE.Shape();
  shape.moveTo(-ringW / 2, -ringD / 2);
  shape.lineTo(ringW / 2, -ringD / 2);
  shape.lineTo(ringW / 2, ringD / 2);
  shape.lineTo(-ringW / 2, ringD / 2);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-trayW / 2, -trayD / 2);
  hole.lineTo(trayW / 2, -trayD / 2);
  hole.lineTo(trayW / 2, trayD / 2);
  hole.lineTo(-trayW / 2, trayD / 2);
  hole.closePath();
  shape.holes.push(hole);
  const borderGeom = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
  borderGeom.rotateX(-Math.PI / 2);
  const borderMat = new THREE.MeshStandardMaterial({
    color: accentHex, roughness: 0.45, metalness: 0.8,
    emissive: 0x1a0e04, emissiveIntensity: 0.18,
  });
  const border = new THREE.Mesh(borderGeom, borderMat);
  border.position.set(cx, 0.06, cz);
  border.receiveShadow = true;
  boardGroup.add(border);
}

// ============================================================
// PIECE FACTORIES — 7 distinct silhouettes × 2 colour schemes
// ============================================================

function rebuildPieces() {
  for (const id in pieceObjs) {
    boardGroup.remove(pieceObjs[id].group);
    disposeObject(pieceObjs[id].group);
  }
  pieceObjs = {};
  for (const id of CHARS) {
    const side = sideOf(id), type = typeOf(id);
    const group = buildPieceMesh(type, side);
    group.userData.id = id;                      // full id, including soldier suffix
    const p = gameState.pos[id];
    if (p === 'EXILED') {
      placeAtExile(group, id);
    } else {
      const wp = worldPos(p.r, p.c);
      group.position.set(wp.x, 0.13, wp.z);
      if (side === 'P2') group.rotation.y = Math.PI;
    }
    boardGroup.add(group);
    pieceObjs[id] = { group, side, type };
  }
}

function computeExileSlot(side, idx) {
  // 14 slots per tray: 2 columns × 7 rows
  const baseX = side === 'P1' ? EXILE_P1_X : EXILE_P2_X;
  const col = idx % 2;                          // 0 or 1
  const row = Math.floor(idx / 2);              // 0..6
  const x = baseX + (col === 0 ? -0.4 : +0.4);
  const z = EXILE_Z - 2.4 + row * 0.8;
  return { x, y: 0.1, z, rotY: side === 'P1' ? Math.PI / 2 : -Math.PI / 2, scale: 0.66 };
}

function exileIndexOfChar(id) {
  const side = sideOf(id);
  let idx = 0;
  for (const other of CHARS) {
    if (sideOf(other) !== side) continue;
    if (other === id) break;
    if (gameState.pos[other] === 'EXILED') idx++;
  }
  return idx;
}

function placeAtExile(group, id) {
  const slot = computeExileSlot(sideOf(id), exileIndexOfChar(id));
  group.position.set(slot.x, slot.y, slot.z);
  group.scale.setScalar(slot.scale);
  group.rotation.y = slot.rotY;
}

function disposeObject(obj) {
  obj.traverse?.(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) m.dispose?.();
    }
  });
}

// ============================================================
// HIGHLIGHTS
// ============================================================

function clearHighlights() {
  for (const key of highlightSet) {
    const tile = cellMeshes[key];
    if (!tile) continue;
    tile.material.color.setHex(tile.userData.baseColor);
    tile.material.emissive.setHex(tile.userData.baseEmissive);
    tile.material.emissiveIntensity = tile.userData.baseEmissiveI;
  }
  highlightSet.clear();
  for (const id of pieceHighlightSet) {
    const obj = pieceObjs[id];
    if (!obj) continue;
    obj.group.position.y = Math.min(obj.group.position.y, 0.13);
  }
  pieceHighlightSet.clear();
}

function highlightCells(cells, kind /* 'good' | 'bad' */) {
  const emColor = kind === 'good' ? 0x40ff84 : 0xff4060;
  for (const [r, c] of cells) {
    const tile = cellMeshes[`${r},${c}`];
    if (!tile) continue;
    tile.material.color.setHex(kind === 'good' ? 0x2a8a4e : 0x8a2a3e);
    tile.material.emissive.setHex(emColor);
    tile.material.emissiveIntensity = 1.0;
    highlightSet.add(`${r},${c}`);
  }
}

function highlightPieces(ids, kind) {
  for (const id of ids) {
    const obj = pieceObjs[id];
    if (!obj) continue;
    obj.group.position.y = 0.4;
    pieceHighlightSet.add(id);
  }
}

// ============================================================
// INPUT
// ============================================================

function onPointerDown(event) {
  if (inputLocked || gameState.phase === PHASE.OVER) return;
  if (event.button !== undefined && event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hittables = [];
  for (const id in pieceObjs) {
    pieceObjs[id].group.traverse(c => { if (c.isMesh) hittables.push(c); });
  }
  for (const key in cellMeshes) hittables.push(cellMeshes[key]);

  const hits = raycaster.intersectObjects(hittables, false);
  // Clicking off the board: do NOT auto-cancel — keep the selection so the player can try again.
  if (!hits.length) return;

  for (const hit of hits) {
    let obj = hit.object;
    while (obj && !obj.userData?.kind) obj = obj.parent;
    if (!obj) continue;
    if (obj.userData.kind === 'piece') {
      handleClickOnPiece(obj.userData.id);
      return;
    }
    if (obj.userData.kind === 'cell') {
      handleClickOnCell(obj.userData.r, obj.userData.c);
      return;
    }
    if (obj.userData.kind === 'deco') {
      handleClickOnCell(HEART_R, HEART_C);
      return;
    }
  }
}

function handleClickOnPiece(id) {
  if (gameState.phase === PHASE.OVER) return;
  if (gameState.phase === PHASE.SETUP) { handleSetupClick(id); return; }
  if (gameState.phase === PHASE.PLAY) {
    if (canMove(gameState, id)) selectChar(id);
    return;
  }
  // TARGETING: clicking on the selected piece is a no-op; clicking a different own
  // piece re-selects; clicking an enemy that is a legal capture executes the capture.
  if (gameState.phase === PHASE.TARGETING) {
    if (id === gameState.selectedChar) return;
    const moves = legalMoves(gameState, gameState.selectedChar);
    const capture = moves.find(m => m.kind === 'capture' && m.targetChar === id);
    if (capture) { executeMove(gameState.selectedChar, capture); return; }
    if (canMove(gameState, id)) selectChar(id);
  }
}

// During SETUP: clicking your own home-row piece selects it (it lifts); clicking a
// second own home-row piece swaps the two; clicking the same piece deselects it.
// Soldier and the opponent are not touchable during setup.
function handleSetupClick(id) {
  const side = sideOf(id);
  if (side !== gameState.setupSide) return;
  if (typeOf(id) === 'SOLDIER') return;
  const p = gameState.pos[id];
  if (!p || p.r !== (side === 'P1' ? 1 : 7)) return;

  // Toggle off
  if (gameState.selectedChar === id) {
    liftPiece(id, false);
    gameState.selectedChar = null;
    updateAll();
    return;
  }
  // First pick
  if (!gameState.selectedChar) {
    gameState.selectedChar = id;
    liftPiece(id, true);
    updateAll();
    return;
  }
  // Second pick — swap positions of the two named pieces
  const a = gameState.selectedChar;
  const b = id;
  const pa = gameState.pos[a], pb = gameState.pos[b];
  gameState.pos[a] = { r: pb.r, c: pb.c };
  gameState.pos[b] = { r: pa.r, c: pa.c };
  liftPiece(a, false);
  gameState.selectedChar = null;
  // Animate both into their new homes
  animatePieceTo(a, false);
  animatePieceTo(b, false);
  updateAll();
}

function liftPiece(id, up) {
  const obj = pieceObjs[id];
  if (!obj) return;
  obj.group.position.y = up ? 0.55 : 0.13;
}

// Randomly shuffle the seven named pieces of a side along their home row.
function shuffleHomeRow(side) {
  const r = (side === 'P1') ? 1 : 7;
  const ids = TYPES.map(t => `${side}_${t}`).filter(id => {
    const p = gameState.pos[id];
    return p && p.r === r;
  });
  const cols = ids.map(id => gameState.pos[id].c).slice();
  // Fisher-Yates
  for (let i = cols.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cols[i], cols[j]] = [cols[j], cols[i]];
  }
  ids.forEach((id, i) => { gameState.pos[id] = { r, c: cols[i] }; });
  ids.forEach(id => animatePieceTo(id, false));
}

// Called by the "Begin Game" button. Confirms the current side's arrangement
// and either passes to the next side or starts play.
function confirmSetup() {
  if (gameState.phase !== PHASE.SETUP) return;
  if (gameState.selectedChar) {
    liftPiece(gameState.selectedChar, false);
    gameState.selectedChar = null;
  }
  if (gameState.setupSide === 'P1') {
    if (aiEnabled) {
      // Computer auto-arranges its home row
      shuffleHomeRow('P2');
      gameState.setupSide = null;
      gameState.phase = PHASE.PLAY;
    } else {
      gameState.setupSide = 'P2';
    }
  } else {
    gameState.setupSide = null;
    gameState.phase = PHASE.PLAY;
  }
  updateAll();
  if (gameState.phase === PHASE.PLAY) maybeTriggerAI();
}

function handleClickOnCell(r, c) {
  if (gameState.phase !== PHASE.TARGETING) return;
  const moves = legalMoves(gameState, gameState.selectedChar);
  const match = moves.find(m => m.dest[0] === r && m.dest[1] === c);
  if (!match) return;
  executeMove(gameState.selectedChar, match);
}

function selectChar(id) {
  cancelToPlay();
  if (!canMove(gameState, id)) return;
  gameState.selectedChar = id;
  const obj = pieceObjs[id];
  if (obj) obj.group.position.y = 0.55;
  const moves = legalMoves(gameState, id);
  if (!moves.length) {
    // Selected a piece with nowhere to go — keep it selected but show nothing.
    gameState.phase = PHASE.CHAR_PICKED;
    updateAll();
    return;
  }
  gameState.phase = PHASE.TARGETING;
  // Cells get green highlights, capture targets get red glow on the piece itself.
  const cellDests = moves.filter(m => m.kind === 'move').map(m => m.dest);
  const captureTargets = moves.filter(m => m.kind === 'capture').map(m => m.targetChar);
  if (cellDests.length)    highlightCells(cellDests, 'good');
  if (captureTargets.length) highlightPieces(captureTargets, 'bad');
  updateAll();
}

function cancelToPlay() {
  if (gameState && gameState.selectedChar) {
    const obj = pieceObjs[gameState.selectedChar];
    if (obj && obj.group.position.y > 0.2) obj.group.position.y = 0.13;
  }
  clearHighlights();
  gameState.selectedChar = null;
  if (gameState.phase !== PHASE.OVER) gameState.phase = PHASE.PLAY;
  updateAll();
}

// ============================================================
// EXECUTE MOVE + ANIMATIONS
// ============================================================

function executeMove(id, move) {
  inputLocked = true;
  clearHighlights();
  const sel = pieceObjs[id];
  if (sel && sel.group.position.y > 0.2) sel.group.position.y = 0.13;

  const capturedId = move.kind === 'capture' ? move.targetChar : null;

  applyMove(gameState, id, move);

  if (capturedId) animateExileOf(capturedId);
  animatePieceTo(id, false);

  setTimeout(() => {
    inputLocked = false;
    updateAll();
    if (gameState.phase === PHASE.OVER) {
      showWinBanner();
    } else {
      maybeTriggerAI();
    }
  }, 720);
}

function animatePieceTo(id, exileAfter) {
  const obj = pieceObjs[id];
  if (!obj) return;
  const dest = gameState.pos[id];
  if (dest === 'EXILED') {
    animateExile(obj.group, id);
    return;
  }
  const wp = worldPos(dest.r, dest.c);
  arcTo(obj.group, new THREE.Vector3(wp.x, 0.13, wp.z), 500);
  if (exileAfter) {
    setTimeout(() => animateExile(obj.group, id), 520);
  }
}

function animateExileOf(id) {
  const obj = pieceObjs[id];
  if (!obj) return;
  animateExile(obj.group, id);
}

function animateExile(group, id) {
  const slot = computeExileSlot(sideOf(id), exileIndexOfChar(id));
  const start = performance.now();
  const fromPos = group.position.clone();
  const fromScale = group.scale.x;
  const fromRotY = group.rotation.y;
  const duration = 600;
  animations.push({
    update: now => {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 2*t*t : -1 + (4-2*t)*t;
      group.position.x = fromPos.x + (slot.x - fromPos.x) * e;
      group.position.z = fromPos.z + (slot.z - fromPos.z) * e;
      group.position.y = fromPos.y + Math.sin(t * Math.PI) * 1.8;
      group.scale.setScalar(fromScale + (slot.scale - fromScale) * e);
      group.rotation.y = fromRotY + (slot.rotY - fromRotY) * e;
      return t >= 1;
    },
    onComplete: () => {
      group.position.set(slot.x, slot.y, slot.z);
      group.scale.setScalar(slot.scale);
      group.rotation.y = slot.rotY;
    },
  });
}

function arcTo(group, dest, duration) {
  const from = group.position.clone();
  const start = performance.now();
  animations.push({
    update: now => {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 2*t*t : -1 + (4-2*t)*t;
      group.position.x = from.x + (dest.x - from.x) * e;
      group.position.z = from.z + (dest.z - from.z) * e;
      group.position.y = from.y + (dest.y - from.y) * e + Math.sin(t * Math.PI) * 0.55;
      return t >= 1;
    },
    onComplete: () => { group.position.copy(dest); },
  });
}

// ============================================================
// UI
// ============================================================

const $ = id => document.getElementById(id);

function updateAll() {
  updatePhaseBanner();
  updateSetupButtons();
  updateTurn();
  updateRoster();
  updateCharPanel();
}

function updatePhaseBanner() {
  const banner = $('phase-banner');
  if (!banner) return;
  const title = banner.querySelector('.phase-title');
  const sub = banner.querySelector('.phase-sub');
  if (gameState.phase === PHASE.OVER) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  if (gameState.phase === PHASE.SETUP) {
    const who = gameState.setupSide === 'P1' ? 'Player 1' : 'Player 2';
    title.textContent = `${who} — arrange your characters`;
    sub.textContent = 'Click two of your back-row pieces to swap them. Press Begin Game when done.';
    return;
  }
  if (gameState.phase === PHASE.TARGETING) {
    title.textContent = 'Choose a destination';
    sub.textContent = 'Click a green cell, or a red enemy to capture them.';
  } else if (gameState.phase === PHASE.CHAR_PICKED) {
    title.textContent = 'This piece has no legal move';
    sub.textContent = 'Click another of your pieces, or Cancel.';
  } else {
    title.textContent = `${gameState.turn === 'P1' ? 'Player 1' : 'Player 2'} to move`;
    sub.textContent = 'Click one of your characters.';
  }
}

// Show/hide the setup-only buttons (Begin Game, Shuffle Mine).
function updateSetupButtons() {
  const inSetup = gameState.phase === PHASE.SETUP;
  const begin = $('btn-begin');
  const shuffle = $('btn-shuffle');
  if (begin) begin.classList.toggle('hidden', !inSetup);
  if (shuffle) shuffle.classList.toggle('hidden', !inSetup);
}

function updateTurn() {
  const el = $('turn-indicator');
  if (gameState.phase === PHASE.OVER) {
    el.textContent = 'Game over';
    el.className = '';
  } else if (gameState.phase === PHASE.SETUP) {
    const who = gameState.setupSide === 'P1' ? 'Player 1' : 'Player 2';
    el.textContent = `${who} · Setup`;
    el.className = gameState.setupSide === 'P1' ? 'turn-p1' : 'turn-p2';
  } else {
    el.textContent = gameState.turn === 'P1' ? 'Player 1' : 'Player 2';
    el.className = gameState.turn === 'P1' ? 'turn-p1' : 'turn-p2';
  }
  $('move-count').textContent = `Move ${gameState.moveCount} / 100`;
  // HUD line: Embrace progress per side. Each side wins when their Lover is on the Heart
  // and at least 2 of their other pieces are in the 8 surrounding cells.
  const hs = $('heart-state');
  if (hs) {
    const fmt = (side) => {
      const lover = `${side}_LOVER`;
      const p = gameState.pos[lover];
      const atHeart = p.r === HEART_R && p.c === HEART_C;
      const esc = countEscorts(gameState, side);
      return atHeart ? `❀ at Heart · ${esc} / 2 escorts` : `${distToHeart(p.r, p.c)} cells from Heart`;
    };
    hs.textContent = `P1 ${fmt('P1')}  ·  P2 ${fmt('P2')}`;
    hs.className = 'heart-state';
  }
}

function updateRoster() {
  const p1Alive = allOnBoardForSide(gameState, 'P1').length;
  const p2Alive = allOnBoardForSide(gameState, 'P2').length;
  const p1El = $('hero-p1');
  const p2El = $('hero-p2');
  if (p1El) { p1El.textContent = `${p1Alive} / ${PIECES_PER_SIDE} alive`; p1El.className = 'hero-name'; }
  if (p2El) { p2El.textContent = `${p2Alive} / ${PIECES_PER_SIDE} alive`; p2El.className = 'hero-name'; }
  const e1 = $('exile-count-p1');
  const e2 = $('exile-count-p2');
  if (e1) e1.textContent = `${PIECES_PER_SIDE - p1Alive} fallen`;
  if (e2) e2.textContent = `${PIECES_PER_SIDE - p2Alive} fallen`;
}

function updateCharPanel() {
  const panel = $('char-panel');
  const id = gameState.selectedChar;
  if (!id || gameState.phase === PHASE.OVER || gameState.phase === PHASE.SETUP) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');
  const type = typeOf(id);
  const def = CHAR_DEFS[type];
  const side = sideOf(id);
  $('char-icon').textContent = def.icon;
  $('char-name').textContent = def.name;
  $('char-tag').textContent = def.tag;

  const status = $('char-status');
  status.textContent = side === 'P1' ? "Player 1's character" : "Player 2's character";
  status.className = side === 'P1' ? 'char-status hero-p1' : 'char-status hero-p2';

  const desc = $('char-movement-desc');
  if (desc) {
    desc.textContent = def.move;
    if (typeOf(id) === 'LOVER') {
      desc.textContent += '  ❀ Crown-piece: bring her to the Heart with 3 escorts around her to win.';
    }
  }
}

function showWinBanner() {
  const banner = $('win-banner');
  const text = $('win-text');
  const sub = $('win-subtext');
  const w = gameState.winner;
  const r = gameState.winReason;
  const playerName = w === 'P1' ? 'Player 1' : 'Player 2';

  if (r === 'embrace') {
    text.textContent = `❀ ${playerName} wins · The Embrace`;
    sub.textContent = 'Their Lover stands on the Heart, ringed by two companions.';
  } else if (r === 'siege') {
    text.textContent = `⚔ ${playerName} wins · The Siege`;
    sub.textContent = 'The opposing Lover stands alone — her companions fallen, her path closed.';
  } else if (r === 'unresolved') {
    text.textContent = `❀ ${playerName} wins · Closer to the Heart`;
    sub.textContent = 'The hundred-turn limit fell. The army nearer the Embrace takes the day.';
  }
  banner.classList.remove('hidden');
}

function hideWinBanner() { $('win-banner').classList.add('hidden'); }

// ============================================================
// CAMERA / RENDER LOOP / NEW GAME
// ============================================================

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  if (animations.length) {
    const remaining = [];
    for (const a of animations) {
      const done = a.update(now);
      if (done) a.onComplete?.();
      else remaining.push(a);
    }
    animations = remaining;
  }
  const HEART_KEY = `${HEART_R},${HEART_C}`;
  if (heartTile && !highlightSet.has(HEART_KEY)) {
    heartTile.material.emissiveIntensity = 0.7 + Math.sin(now * 0.003) * 0.3;
  }
  if (heartLight) heartLight.intensity = 1.9 + Math.sin(now * 0.003) * 0.5;
  if (heartFloater) heartFloater.visible = true;
  for (const key of highlightSet) {
    if (key === HEART_KEY) continue;
    const tile = cellMeshes[key];
    if (!tile) continue;
    tile.material.emissiveIntensity = 0.6 + Math.sin(now * 0.006) * 0.45;
  }
  for (const id of pieceHighlightSet) {
    const obj = pieceObjs[id];
    if (!obj) continue;
    obj.group.position.y = 0.4 + Math.sin(now * 0.005 + id.length) * 0.04;
  }
  controls.update();
  renderer.render(scene, camera);
}

function newGame() {
  cancelToPlay();
  hideWinBanner();
  gameState = createInitialState();
  rebuildPieces();
  updateAll();
  // (Initial turn is always P1, so this is a no-op unless someone changes it.)
  maybeTriggerAI();
}

function flipBoard() {
  const tgt = controls.target;
  const off = camera.position.clone().sub(tgt);
  off.x = -off.x;
  off.z = -off.z;
  camera.position.copy(tgt).add(off);
  controls.update();
}

// ============================================================
// COMPUTER OPPONENT (plays as P2)
// ============================================================

function cloneState(s) {
  return {
    pos: JSON.parse(JSON.stringify(s.pos)),
    turn: s.turn,
    phase: s.phase,
    selectedChar: null,
    winner: null, winReason: null, winningChar: null,
    moveCount: s.moveCount,
    exileCount: s.exileCount || 0,
  };
}

// Piece values for AI material counting.
const PIECE_VALUE = {
  // The Lover is the crown-piece — without her there is no Embrace, so she is most valuable.
  LOVER: 40,
  // Everyone else is graded by combat utility.
  TRAITOR: 5,    // rook
  GUARDIAN: 4,   // short queen
  SAGE: 3,       // bishop
  FOOL: 3,       // knight
  SOLDIER: 3,    // pawn-like
  DREAMER: 2,    // pacifist scout
  WARRIOR: 2,    // king-like short-range
};

// Score the resulting position from `side`'s point of view. Bigger = better.
// The Lover cannot be captured — material balance is purely about combat reach and
// the Embrace formation: Lover toward Heart, escorts gathered in the lotus.
function positionScore(state, side) {
  let s = 0;
  let myLoverP = null, enLoverP = null;
  let myLotus = 0, enLotus = 0;

  for (const id of CHARS) {
    if (!isOnBoard(state, id)) continue;
    const p = state.pos[id];
    if (typeOf(id) !== 'LOVER') {
      const v = PIECE_VALUE[typeOf(id)];
      if (sideOf(id) === side) s += v; else s -= v;
    }
    if (typeOf(id) === 'LOVER') {
      if (sideOf(id) === side) myLoverP = p; else enLoverP = p;
    }
    if (isInLotus(p.r, p.c)) {
      if (sideOf(id) === side) myLotus++; else enLotus++;
    }
  }

  // Drive your own Lover toward the Heart hard — and reward escort buildup that creates
  // a near-Embrace threat. The combination ranks "Lover near Heart with escorts" highest.
  if (myLoverP) {
    const d = distToHeart(myLoverP.r, myLoverP.c);
    s -= d * 14;
    if (d === 0) s += 200;    // Lover on Heart — one step from Embrace
    if (d === 0 && myLotus >= 1) s += 400;   // Lover on Heart + 1 escort — Embrace next turn (if it holds)
  }
  if (enLoverP) {
    const d = distToHeart(enLoverP.r, enLoverP.c);
    s += d * 14;
    if (d === 0) s -= 220;
    if (d === 0 && enLotus >= 1) s -= 440;   // urgent: disrupt enemy near-Embrace
  }

  // Escort presence in the lotus.
  s += myLotus * 20;
  s -= enLotus * 22;

  // Block the enemy lotus — every cell in the lotus that's occupied by anyone other than
  // an enemy escort blocks them. So put your own pieces in their would-be escort spots.
  // (This is already counted by `myLotus` above; here we emphasise denial via the diff.)

  return s;
}

function scoreCandidate(state, side, c) {
  const copy = cloneState(state);
  applyMove(copy, c.id, c.move);

  // Immediate win / loss
  if (copy.winner === side) return 1e9;
  if (copy.winner && copy.winner !== side) return -1e9;

  return positionScore(copy, side) + Math.random() * 0.1;
}

// Score considering opponent's best reply (2-ply lookahead).
// After our candidate move, what is our score after the opponent's best response?
function scoreCandidate2Ply(state, side, c) {
  const copy = cloneState(state);
  applyMove(copy, c.id, c.move);
  if (copy.winner === side) return 1e9;
  if (copy.winner && copy.winner !== side) return -1e9;
  if (copy.phase !== PHASE.PLAY) return positionScore(copy, side);

  // Opponent's best reply: minimise our score
  const enemy = otherSide(side);
  const enCands = [];
  for (const id of CHARS) {
    if (sideOf(id) !== enemy || !isOnBoard(copy, id)) continue;
    for (const m of legalMoves(copy, id)) enCands.push({ id, move: m });
  }
  if (!enCands.length) return 1e9;            // we leave them in Siege → we win

  let worst = Infinity;
  for (const ec of enCands) {
    const after = cloneState(copy);
    applyMove(after, ec.id, ec.move);
    if (after.winner === enemy) return -1e9;  // they win on reply
    if (after.winner === side)  { worst = Math.min(worst, 1e9); continue; }
    const sc = positionScore(after, side);
    if (sc < worst) worst = sc;
  }
  return worst + Math.random() * 0.1;
}

function aiPickMove(state, side) {
  const cands = [];
  for (const id of CHARS) {
    if (sideOf(id) !== side || !isOnBoard(state, id)) continue;
    for (const m of legalMoves(state, id)) cands.push({ id, move: m });
  }
  if (!cands.length) return null;

  // Use 2-ply when the branching factor is small enough to afford it (most of the game).
  // Threshold tuned so a typical move stays well under 50ms.
  const useDeep = cands.length <= 60;
  let best = null, bestScore = -Infinity;
  for (const c of cands) {
    const s = useDeep ? scoreCandidate2Ply(state, side, c) : scoreCandidate(state, side, c);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return best;
}

function maybeTriggerAI() {
  if (!aiEnabled) return;
  if (gameState.phase !== PHASE.PLAY) return;
  if (gameState.turn !== 'P2') return;
  if (inputLocked) return;
  inputLocked = true;

  // "Computer is thinking…" cue
  const banner = $('phase-banner');
  if (banner) {
    banner.classList.remove('hidden');
    banner.querySelector('.phase-title').textContent = 'Computer is thinking…';
    banner.querySelector('.phase-sub').textContent = '';
  }

  setTimeout(() => {
    const choice = aiPickMove(gameState, 'P2');
    if (!choice) { inputLocked = false; updateAll(); return; }
    const obj = pieceObjs[choice.id];
    if (obj) obj.group.position.y = 0.4;
    // Show the destination so the player sees what's coming.
    const kind = choice.move.kind === 'capture' ? 'bad' : 'good';
    highlightCells([choice.move.dest], kind);
    setTimeout(() => {
      if (obj) obj.group.position.y = 0.13;
      clearHighlights();
      inputLocked = false;
      executeMove(choice.id, choice.move);
    }, 700);
  }, 550);
}

function toggleAI() {
  aiEnabled = !aiEnabled;
  const btn = $('btn-mode');
  if (btn) btn.textContent = aiEnabled ? 'vs Computer ✓' : 'Hot‑seat';
  // If the toggle put us in a state where AI should now move, do it
  maybeTriggerAI();
}

// ============================================================
// BOOT
// ============================================================

function boot() {
  initScene();
  gameState = createInitialState();
  rebuildPieces();
  updateAll();
  tick();

  $('btn-new')?.addEventListener('click', newGame);
  $('btn-flip')?.addEventListener('click', flipBoard);
  $('btn-mode')?.addEventListener('click', toggleAI);
  $('btn-rules')?.addEventListener('click', () => $('rules-panel')?.classList.remove('hidden'));
  $('btn-close-rules')?.addEventListener('click', () => $('rules-panel')?.classList.add('hidden'));
  $('btn-banner-new')?.addEventListener('click', newGame);
  $('btn-cancel')?.addEventListener('click', cancelToPlay);
  $('btn-begin')?.addEventListener('click', confirmSetup);
  $('btn-shuffle')?.addEventListener('click', () => {
    if (gameState.phase !== PHASE.SETUP) return;
    if (gameState.selectedChar) { liftPiece(gameState.selectedChar, false); gameState.selectedChar = null; }
    shuffleHomeRow(gameState.setupSide);
    updateAll();
  });
  $('rules-panel')?.addEventListener('click', e => {
    if (e.target.id === 'rules-panel') e.currentTarget.classList.add('hidden');
  });

  // Mobile side-panel collapse toggle
  $('btn-panel-toggle')?.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('panel-collapsed');
    const btn = $('btn-panel-toggle');
    if (btn) btn.textContent = collapsed ? '☰' : '×';
  });

}

boot();
