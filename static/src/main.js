import { Car } from './car.js';
import { GameMap } from './map.js';
import { Obstacle } from './Obstacle.js';
import { Target } from './Target.js';
import { generateMaze, generateBorder } from './mapGenerator.js';
import * as db from './db.js';
import { followPath, aStar } from './autopilot/index.js';
import { CONTROL_API_URL, TELEMETRY_API_URL } from './config.js';

// 1 Pixel entspricht dieser Anzahl Zentimeter
const CM_PER_PX = 2;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const dropdown = document.getElementById('obstacleSize');
const removeCheckbox = document.getElementById('removeMode');
const generateMazeBtn = document.getElementById('generateMaze');
const calcPathBtn = document.getElementById('calcPathBtn');
const toggleHitboxesBtn = document.getElementById('toggleHitboxes');
const findCarBtn = document.getElementById('findCarBtn');
const canvasContainer = document.getElementById('canvasContainer');
const saveMapCsvBtn = document.getElementById('saveMapCsv');
const loadMapCsvInput = document.getElementById('loadMapCsv');
const loadMapCsvBtn = document.getElementById('loadMapCsvBtn');
const newMapBtn = document.getElementById('newMapBtn');
const currentFileEl = document.getElementById('currentFile');
const redEl = document.getElementById('redLength');
const greenEl = document.getElementById('greenLength');
const blueLeft1El = document.getElementById('blueLeft1');
const blueLeft2El = document.getElementById('blueLeft2');
const blueRight1El = document.getElementById('blueRight1');
const blueRight2El = document.getElementById('blueRight2');
const blueBackEl = document.getElementById('blueBack');
const speedEl = document.getElementById('speed');
const rpmEl = document.getElementById('rpm');
const gyroEl = document.getElementById('gyro');
const cellCmInput = document.getElementById('gridCellCm');
const widthCmInput = document.getElementById('gridWidth');
const heightCmInput = document.getElementById('gridHeight');

let zoomMode = false;
let zoomScale = 1;
let translateX = 0;
let translateY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let lastLoadedMapName = '';

const TELEMETRY_INTERVAL = 500; // ms
let lastTelemetry = 0;

const CONTROL_POLL_INTERVAL = 200; // ms

async function pollControl() {
  try {
    const res = await fetch(CONTROL_API_URL);
    if (!res.ok) return;
    const data = await res.json();
    if (data.action) car.setKeysFromAction(data.action);
  } catch (err) {
    console.error('pollControl failed', err);
  }
}

function sendTelemetry(front, rear, left, right) {
  fetch(TELEMETRY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      speed: car.speed,
      rpm: car.rpm,
      gyro: car.gyro,
      pos_x: car.posX,
      pos_y: car.posY,
      distances: { front, rear, left, right },
    }),
  }).catch((err) => console.error('sendTelemetry failed', err));
}

let CELL_SIZE = parseFloat(cellCmInput.value) / CM_PER_PX;
const initialWidthCm = parseFloat(widthCmInput.value);
const initialHeightCm = parseFloat(heightCmInput.value);
const initialCols = Math.max(1, Math.round(initialWidthCm / parseFloat(cellCmInput.value)));
const initialRows = Math.max(1, Math.round(initialHeightCm / parseFloat(cellCmInput.value)));
let gameMap = new GameMap(initialCols, initialRows, CELL_SIZE);
let previewSize;
updateObstacleOptions();
const params = new URLSearchParams(window.location.search);
const csvMapUrl = params.get('map');
const editorMode = params.has('editor');
if (!editorMode) {
  const e1 = document.getElementById('editorTools');
  const e2 = document.getElementById('editorTools2');
  if (e1) e1.style.display = 'none';
  if (e2) e2.style.display = 'none';
}
if (csvMapUrl) {
  db.loadMapCsvUrl(csvMapUrl).then((gm) => {
    gameMap = gm;
    CELL_SIZE = gameMap.cellSize;
    obstacles = gameMap.obstacles;
    targetMarker = gameMap.target;
    cellCmInput.value = Math.round(gameMap.cellSize * CM_PER_PX);
    updateObstacleOptions();
    refreshCarObjects();
    pathCells = [];
    widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
    heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
    resizeCanvas();
    lastLoadedMapName = csvMapUrl.split('/').pop().replace(/\.csv$/i, '');
    const nameInput = document.getElementById('mapName');
    if (nameInput) nameInput.value = lastLoadedMapName;
    if (currentFileEl) currentFileEl.textContent = lastLoadedMapName + '.csv';
    alert(`Map "${lastLoadedMapName}.csv" erfolgreich geladen.`);
  });
}
let obstacles = gameMap.obstacles;
previewSize = dropdown.value === 'target' ? CELL_SIZE : parseInt(dropdown.value) * CELL_SIZE;
let showHitboxes = false;
let isDragging = false;
let dragX = 0;
let dragY = 0;
let targetMarker = gameMap.target;
let pathCells = [];

function refreshCarObjects() {
  // Only obstacles should block the car. The target is handled
  // separately so the car can pass through it.
  car.objects = obstacles.slice();
}

function respawnTarget() {
  const size = targetMarker ? targetMarker.size : CELL_SIZE;
  for (let i = 0; i < 100; i++) {
    const col = Math.floor(Math.random() * gameMap.cols);
    const row = Math.floor(Math.random() * gameMap.rows);
    const x = col * CELL_SIZE;
    const y = row * CELL_SIZE;
    if (!gameMap.isWithinBounds(x, y, size, size)) continue;
    const temp = new Target(x, y, size);
    const bbox = car.getBoundingBox(car.posX, car.posY);
    const collides =
      obstacles.some((o) => o.intersectsRect(x, y, size, size)) ||
      temp.intersectsRect(bbox.x, bbox.y, bbox.w, bbox.h);
    if (!collides) {
      targetMarker = temp;
      gameMap.target = targetMarker;
      pathCells = [];
      break;
    }
  }
}

const carImage = new Image();
carImage.src = '/static/extracted_foreground.png';
const HOTBOX_WIDTH_CM = 40;
const HOTBOX_HEIGHT_CM = 20;
const car = new Car(ctx, carImage, 0.5, 0, obstacles, {
  startX: 100,
  startY: 100,
  hitboxWidth: HOTBOX_WIDTH_CM / CM_PER_PX,
  hitboxHeight: HOTBOX_HEIGHT_CM / CM_PER_PX,
});
refreshCarObjects();

function updateObstacleOptions() {
  if (!dropdown) return;
  const opts = dropdown.querySelectorAll('option');
  opts.forEach((opt) => {
    if (opt.value === 'target') return;
    const cells = parseInt(opt.value);
    opt.textContent = `${cells}x${cells}`;
  });
  previewSize = dropdown.value === 'target' ? CELL_SIZE : parseInt(dropdown.value) * CELL_SIZE;
}

function resizeCanvas() {
  canvas.width = gameMap.cols * CELL_SIZE;
  canvas.height = gameMap.rows * CELL_SIZE;
  updateTransform();
}

function updateTransform() {
  canvas.style.transform = `translate(${-translateX}px, ${-translateY}px) scale(${zoomScale})`;
}

window.addEventListener('resize', resizeCanvas);

dropdown.addEventListener('change', () => {
  const val = dropdown.value;
  previewSize = val === 'target' ? CELL_SIZE : parseInt(val) * CELL_SIZE;
});

canvas.addEventListener('mousedown', (e) => {
  if (zoomMode) {
    isPanning = true;
    panStartX = e.clientX + translateX;
    panStartY = e.clientY + translateY;
    return;
  }
  if (!editorMode) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  dragX =
    Math.floor(((e.clientX - rect.left) * scaleX) / CELL_SIZE) * CELL_SIZE;
  dragY = Math.floor(((e.clientY - rect.top) * scaleY) / CELL_SIZE) * CELL_SIZE;
  isDragging = true;
});

canvas.addEventListener('mouseup', () => {
  if (zoomMode) {
    isPanning = false;
    return;
  }
  if (!editorMode) return;
  if (!isDragging) return;
  const selected = dropdown.value;

  if (removeCheckbox.checked) {
    if (
      targetMarker &&
      dragX === targetMarker.x &&
      dragY === targetMarker.y &&
      previewSize === targetMarker.radius
    ) {
      targetMarker = null;
      gameMap.target = null;
    }

    const i = obstacles.findIndex((o) => o.x === dragX && o.y === dragY);
    if (i !== -1) obstacles.splice(i, 1);
  } else if (selected === 'target') {
    targetMarker = new Target(dragX, dragY, previewSize);
    gameMap.target = targetMarker;
  } else {
    obstacles.push(new Obstacle(dragX, dragY, previewSize));
  }

  refreshCarObjects();
  pathCells = [];
  isDragging = false;
});

canvas.addEventListener('mousemove', (e) => {
  if (zoomMode && isPanning) {
    translateX = panStartX - e.clientX;
    translateY = panStartY - e.clientY;
    updateTransform();
    return;
  }
  if (!editorMode) return;
  if (!isDragging) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  dragX =
    Math.floor(((e.clientX - rect.left) * scaleX) / CELL_SIZE) * CELL_SIZE;
  dragY = Math.floor(((e.clientY - rect.top) * scaleY) / CELL_SIZE) * CELL_SIZE;
});

canvas.addEventListener('wheel', (e) => {
  if (!zoomMode) return;
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  zoomScale = Math.max(0.5, Math.min(5, zoomScale * factor));
  updateTransform();
});

function drawGrid() {
  ctx.strokeStyle = '#ddd';
  for (let x = 0; x <= canvas.width; x += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  for (const o of obstacles) {
    o.draw(ctx);
    if (showHitboxes && typeof o.drawHitbox === 'function') o.drawHitbox(ctx);
  }
  if (targetMarker) {
    targetMarker.draw(ctx);
  }
  if (pathCells.length) {
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 3;
    ctx.beginPath();
    pathCells.forEach((p, i) => {
      const px = p.x * CELL_SIZE + CELL_SIZE / 2;
      const py = p.y * CELL_SIZE + CELL_SIZE / 2;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
  if (isDragging && dropdown.value !== 'target' && !removeCheckbox.checked) {
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.strokeRect(dragX, dragY, previewSize, previewSize);
  }
  car.showHitbox = showHitboxes;
  car.update(canvas.width, canvas.height);
  if (targetMarker) {
    const bboxCurrent = car.getBoundingBox(car.posX, car.posY);
    if (
      targetMarker.intersectsRect(
        bboxCurrent.x,
        bboxCurrent.y,
        bboxCurrent.w,
        bboxCurrent.h,
      )
    ) {
      respawnTarget();
    }
  }

  redEl.textContent = Math.round(car.redConeLength);
  greenEl.textContent = Math.round(car.greenConeLength);
  const bl1 = car.drawKegel(65, 7, 150, -Math.PI / 2, 'blue', 8);
  const bl2 = car.drawKegel(72, 7, 150, -Math.PI / 2, 'blue', 8);
  const br1 = car.drawKegel(91, 7, 150, -Math.PI / 2, 'blue', 8);
  const br2 = car.drawKegel(97, 7, 150, -Math.PI / 2, 'blue', 8);
  const bb = car.drawKegel(143, 37, 150, 0, 'blue', 8);
  blueLeft1El.textContent = Math.round(bl1);
  blueLeft2El.textContent = Math.round(bl2);
  blueRight1El.textContent = Math.round(br1);
  blueRight2El.textContent = Math.round(br2);
  blueBackEl.textContent = Math.round(bb);
  speedEl.textContent = Math.round(car.speed);
  rpmEl.textContent = Math.round(car.rpm);
  gyroEl.textContent = car.gyro.toFixed(1);

  const now = Date.now();
  if (now - lastTelemetry >= TELEMETRY_INTERVAL) {
    const front = Math.round(car.redConeLength);
    const rear = Math.round(bb);
    const left = Math.round(Math.min(bl1, bl2));
    const right = Math.round(Math.min(br1, br2));
    sendTelemetry(front, rear, left, right);
    lastTelemetry = now;
  }

  requestAnimationFrame(loop);
}

function loadMapFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  db.loadMapFile(file).then((obj) => {
    gameMap = GameMap.fromJSON(obj);
    CELL_SIZE = gameMap.cellSize;
    obstacles = gameMap.obstacles;
    targetMarker = gameMap.target;
    refreshCarObjects();
    pathCells = [];
    widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
    heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
    resizeCanvas();
  });
}

function loadMapCsv(e) {
  const file = e.target.files[0];
  if (!file) return;
  db.loadMapCsvFile(file).then((gm) => {
    gameMap = gm;
    CELL_SIZE = gameMap.cellSize;
    obstacles = gameMap.obstacles;
    targetMarker = gameMap.target;
    refreshCarObjects();
    pathCells = [];
    widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
    heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
    cellCmInput.value = Math.round(gameMap.cellSize * CM_PER_PX);
    resizeCanvas();
    lastLoadedMapName = file.name.replace(/\.csv$/i, '');
    document.getElementById('mapName').value = lastLoadedMapName;
    if (currentFileEl) currentFileEl.textContent = file.name;
    alert(`Map "${file.name}" erfolgreich geladen.`);
  });
}

if (editorMode) {
  generateMazeBtn.addEventListener('click', () =>
    generateMaze(gameMap, respawnTarget),
  );

  loadMapCsvBtn.addEventListener('click', () => loadMapCsvInput.click());
  saveMapCsvBtn.addEventListener('click', () => {
    const nameInput = document.getElementById('mapName');
    let n = nameInput.value.trim();
    if (!n && lastLoadedMapName) {
      n = lastLoadedMapName;
      nameInput.value = n;
    }
    if (!n) {
      n = db.getDefaultMapName();
      nameInput.value = n;
    }
    const csv = db.serializeCsvMap(gameMap);
    db.downloadMapCsv(gameMap, n + '.csv');
    db.uploadCsvMap(n, csv);
    lastLoadedMapName = n;
    if (currentFileEl) currentFileEl.textContent = n + '.csv';
  });
  loadMapCsvInput.addEventListener('change', loadMapCsv);

  newMapBtn.addEventListener('click', () => {
    const wCm = parseFloat(widthCmInput.value);
    const hCm = parseFloat(heightCmInput.value);
    const cm = parseFloat(cellCmInput.value);
    if (isNaN(wCm) || isNaN(hCm) || wCm <= 0 || hCm <= 0) {
      alert('Invalid size');
      return;
    }
    const newCell = isNaN(cm) ? CELL_SIZE : cm / CM_PER_PX;
    CELL_SIZE = newCell;
    const cellCm = isNaN(cm) ? CELL_SIZE * CM_PER_PX : cm;
    const cols = Math.max(1, Math.round(wCm / cellCm));
    const rows = Math.max(1, Math.round(hCm / cellCm));
    gameMap = new GameMap(cols, rows, CELL_SIZE);
    obstacles = gameMap.obstacles;
    targetMarker = null;
    refreshCarObjects();
    resizeCanvas();
    pathCells = [];
    generateBorder(gameMap, respawnTarget);
    updateObstacleOptions();
    lastLoadedMapName = '';
    if (currentFileEl) currentFileEl.textContent = '';
  });
}

calcPathBtn.addEventListener('click', () => {
  if (!targetMarker) return;
  const start = {
    x: Math.floor((car.posX + car.imgWidth / 2) / CELL_SIZE),
    y: Math.floor((car.posY + car.imgHeight / 2) / CELL_SIZE),
  };
  const goal = {
    x: Math.floor(targetMarker.x / CELL_SIZE),
    y: Math.floor(targetMarker.y / CELL_SIZE),
  };
  start.x = Math.min(start.x, gameMap.cols - 2);
  start.y = Math.min(start.y, gameMap.rows - 2);
  goal.x = Math.min(goal.x, gameMap.cols - 2);
  goal.y = Math.min(goal.y, gameMap.rows - 2);
  pathCells = aStar(start, goal, gameMap);
  followPath(car, pathCells, CELL_SIZE);
});

toggleHitboxesBtn.addEventListener('click', () => {
  showHitboxes = !showHitboxes;
  car.showHitbox = showHitboxes;
  toggleHitboxesBtn.textContent = showHitboxes
    ? 'Hitboxen verstecken'
    : 'Hitboxen anzeigen';
});

function centerOnCar(radiusCm = 500) {
  const diameterPx = (radiusCm * 2) / CM_PER_PX;
  const cw = canvasContainer.clientWidth;
  const ch = canvasContainer.clientHeight;
  zoomScale = Math.min(cw / diameterPx, ch / diameterPx);
  const viewW = cw / zoomScale;
  const viewH = ch / zoomScale;
  const carX = car.posX + car.imgWidth / 2;
  const carY = car.posY + car.imgHeight / 2;
  translateX = carX - viewW / 2;
  translateY = carY - viewH / 2;
  translateX = Math.max(0, Math.min(translateX, canvas.width - viewW));
  translateY = Math.max(0, Math.min(translateY, canvas.height - viewH));
  zoomMode = true;
  updateTransform();
}

findCarBtn.addEventListener('click', () => centerOnCar(500));

carImage.onload = () => {
  resizeCanvas();
  updateObstacleOptions();
  setInterval(pollControl, CONTROL_POLL_INTERVAL);
  pollControl();
  loop();
};
