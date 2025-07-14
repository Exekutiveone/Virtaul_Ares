import { Car } from './car.js';
import { GameMap } from './map.js';
import { Obstacle } from './Obstacle.js';
import { Target } from './Target.js';
import { generateMaze, generateBorder } from './mapGenerator.js';
import * as db from './db.js';
import { followPath, aStar, sendAction } from './autopilot/index.js';
import { CONTROL_API_URL, TELEMETRY_API_URL } from './config.js';

// 1 Pixel entspricht dieser Anzahl Zentimeter
const CM_PER_PX = 2;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const typeSelect = document.getElementById('drawType');
const sizeInput = document.getElementById('squareSize');
const removeCheckbox = document.getElementById('removeMode');
const generateMazeBtn = document.getElementById('generateMaze');
const calcPathBtn = document.getElementById('calcPathBtn');
const toggleHitboxesBtn = document.getElementById('toggleHitboxes');
const findCarBtn = document.getElementById('findCarBtn');
const canvasContainer = document.getElementById('canvasContainer');
const slamCheckbox = document.getElementById('slamMode');
const slamCanvas = document.getElementById('slamCanvas');
const slamCtx = slamCanvas.getContext('2d');
let slamMode = false;
let prevCarRect = null;
const saveMapCsvBtn = document.getElementById('saveMapCsv');
const overwriteCsvBtn = document.getElementById('overwriteMapCsv');
const connectCornersBtn = document.getElementById('connectCorners');
const loadMapCsvInput = document.getElementById('loadMapCsv');
const loadMapCsvBtn = document.getElementById('loadMapCsvBtn');
const sequenceSelect = document.getElementById('sequenceSelect');
const runSequenceBtn = document.getElementById('runSequenceBtn');
const controlModeSelect = document.getElementById('controlMode');
let controlMode = controlModeSelect ? controlModeSelect.value : 'wasd';
let mouseTarget = null;
const keyMap = {
  w: 'ArrowUp',
  a: 'ArrowLeft',
  s: 'ArrowDown',
  d: 'ArrowRight',
};
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
const params = new URLSearchParams(window.location.search);
const csvMapUrl = params.get('map');
const editorMode = params.has('editor');

if (controlModeSelect) {
  controlModeSelect.addEventListener('change', () => {
    controlMode = controlModeSelect.value;
    car.autopilot = controlMode === 'mouse';
  });
}

if (slamCheckbox) {
  if (!editorMode) slamCheckbox.parentElement.style.display = 'none';
  slamCheckbox.addEventListener('change', () => {
    slamMode = slamCheckbox.checked;
    if (slamMode) {
      slamCanvas.width = canvas.width;
      slamCanvas.height = canvas.height;
      slamCanvas.style.display = 'block';
      slamCtx.fillStyle = 'rgba(128,128,128,0.5)';
      slamCtx.fillRect(0, 0, slamCanvas.width, slamCanvas.height);
      prevCarRect = null;
      revealCar();
    } else {
      slamCanvas.style.display = 'none';
      slamCtx.clearRect(0, 0, slamCanvas.width, slamCanvas.height);
      prevCarRect = null;
    }
  });
}

window.addEventListener('keydown', (e) => {
  if (controlMode !== 'wasd') return;
  const k = keyMap[e.key.toLowerCase()];
  if (k) {
    e.preventDefault();
    car.keys[k] = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (controlMode !== 'wasd') return;
  const k = keyMap[e.key.toLowerCase()];
  if (k) {
    e.preventDefault();
    car.keys[k] = false;
  }
});

let zoomMode = false;
let zoomScale = 1;
let translateX = 0;
let translateY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

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

async function loadSequences() {
  if (!sequenceSelect) return;
  sequenceSelect.innerHTML = '';
  const res = await fetch('/api/sequences');
  if (!res.ok) return;
  const list = await res.json();
  for (const s of list) {
    const opt = document.createElement('option');
    opt.value = s.file;
    opt.textContent = s.name;
    opt.dataset.format = s.format || 'csv';
    sequenceSelect.appendChild(opt);
  }
}

function getSensorValue(name) {
  name = name.toLowerCase();
  if (name === 'front' || name === 'red') return car.frontDistance;
  if (name === 'left') return car.leftDistance;
  if (name === 'right') return car.rightDistance;
  if (name === 'back' || name === 'rear') return car.rearDistance;
  return Infinity;
}

function evaluateCondition(val, op, target) {
  switch (op) {
    case '<':
      return val < target;
    case '>':
      return val > target;
    case '<=':
      return val <= target;
    case '>=':
      return val >= target;
    case '==':
      return val == target;
    case '!=':
      return val != target;
  }
  return false;
}

async function runSequence(file, format) {
  if (!file) return;
  const res = await fetch('/static/sequences/' + encodeURIComponent(file));
  if (!res.ok) return;
  const text = await res.text();
  const steps = [];
  const lines = text.trim().split(/\r?\n/);
  for (const line of lines) {
    if (!line) continue;
    const ifMatch = line.match(/^if\s+(\w+)\s*(<=|>=|==|!=|<|>)\s*(\d+(?:\.\d+)?)\s+then\s+(\w+)\s+(\d+(?:\.\d+)?)\s+else\s+(\w+)\s+(\d+(?:\.\d+)?)/i);
    if (ifMatch) {
      const [, sensor, op, val, a1, d1, a2, d2] = ifMatch;
      steps.push({
        condition: { sensor, op, value: parseFloat(val) },
        then: { action: a1, duration: parseFloat(d1) },
        else: { action: a2, duration: parseFloat(d2) },
      });
    } else {
      const forMatch = line.match(/^for\s+(\d+)\s+(\w+)\s+(\d+(?:\.\d+)?)/i);
      if (forMatch) {
        const [, cnt, act, dur] = forMatch;
        steps.push({ action: act, duration: parseFloat(dur), repeat: parseInt(cnt) });
      } else {
        let action, dur;
        if (format === 'csv') {
          [action, dur] = line.split(',');
        } else {
          [action, dur] = line.split(/\s+/);
        }
        dur = parseFloat(dur);
        if (action && !isNaN(dur)) steps.push({ action, duration: dur });
      }
    }
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const step of steps) {
    let curr = step;
    if (step.condition) {
      const val = getSensorValue(step.condition.sensor);
      const target = evaluateCondition(val, step.condition.op, step.condition.value)
        ? step.then
        : step.else;
      curr = target;
    }
    const reps = curr.repeat || 1;
    for (let i = 0; i < reps; i++) {
      await sendAction(car, curr.action);
      await sleep(curr.duration * 1000);
      await sendAction(car, 'stop');
    }
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
const initialCols = Math.max(
  1,
  Math.round(initialWidthCm / parseFloat(cellCmInput.value)),
);
const initialRows = Math.max(
  1,
  Math.round(initialHeightCm / parseFloat(cellCmInput.value)),
);
let gameMap = new GameMap(initialCols, initialRows, CELL_SIZE);
let previewSize;
updateObstacleOptions();
let currentCsvFile = null;
if (!editorMode) {
  const e1 = document.getElementById('editorTools');
  const e2 = document.getElementById('editorTools2');
  if (e1) e1.style.display = 'none';
  if (e2) e2.style.display = 'none';
}
if (csvMapUrl) {
  if (csvMapUrl.startsWith('/static/maps/')) {
    currentCsvFile = decodeURIComponent(
      csvMapUrl.substring('/static/maps/'.length),
    );
    const nameInput = document.getElementById('mapName');
    if (nameInput && !nameInput.value) nameInput.value = currentCsvFile;
  }
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
  });
}
let obstacles = gameMap.obstacles;
previewSize =
  typeSelect.value === 'target'
    ? CELL_SIZE
    : parseInt(sizeInput.value) * CELL_SIZE;
let showHitboxes = false;
let isDragging = false;
let dragX = 0;
let dragY = 0;
let lastPaintX = 0;
let lastPaintY = 0;
let targetMarker = gameMap.target;
let pathCells = [];
let cornerPoints = [];

function renumberCornerPoints() {
  cornerPoints.forEach((p, i) => {
    p.id = i + 1;
  });
}

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
carImage.onload = () => {
  resizeCanvas();
  updateObstacleOptions();
  loadSequences();
  if (runSequenceBtn)
    runSequenceBtn.addEventListener('click', () => {
      const opt = sequenceSelect.options[sequenceSelect.selectedIndex];
      if (opt) runSequence(opt.value, opt.dataset.format);
    });
  setInterval(pollControl, CONTROL_POLL_INTERVAL);
  pollControl();
  loop();
};
carImage.src = '/static/extracted_foreground.png';
const HOTBOX_WIDTH_CM = 40;
const HOTBOX_HEIGHT_CM = 20;
const car = new Car(ctx, carImage, 0.5, 0, obstacles, {
  startX: 100,
  startY: 100,
  hitboxWidth: HOTBOX_WIDTH_CM / CM_PER_PX,
  hitboxHeight: HOTBOX_HEIGHT_CM / CM_PER_PX,
});
car.autopilot = controlMode === 'mouse';
refreshCarObjects();

function updateObstacleOptions() {
  if (!typeSelect || !sizeInput) return;
  const size = parseInt(sizeInput.value);
  sizeInput.value = isNaN(size) ? 1 : Math.max(1, Math.min(25, size));
  previewSize =
    typeSelect.value === 'target'
      ? CELL_SIZE
      : parseInt(sizeInput.value) * CELL_SIZE;
}

function resizeCanvas() {
  canvas.width = gameMap.cols * CELL_SIZE;
  canvas.height = gameMap.rows * CELL_SIZE;
  slamCanvas.width = canvas.width;
  slamCanvas.height = canvas.height;
  if (slamMode) {
    slamCtx.fillStyle = 'rgba(128,128,128,0.5)';
    slamCtx.fillRect(0, 0, slamCanvas.width, slamCanvas.height);
    prevCarRect = null;
    revealCar();
  }
  updateTransform();
}

function updateTransform() {
  canvas.style.transform = `translate(${-translateX}px, ${-translateY}px) scale(${zoomScale})`;
  slamCanvas.style.transform = `translate(${-translateX}px, ${-translateY}px) scale(${zoomScale})`;
}

function paintCell(x, y) {
  if (removeCheckbox.checked) {
    if (
      targetMarker &&
      x === targetMarker.x &&
      y === targetMarker.y &&
      previewSize === targetMarker.radius
    ) {
      targetMarker = null;
      gameMap.target = null;
    }
    const i = obstacles.findIndex((o) => o.x === x && o.y === y);
    if (i !== -1) obstacles.splice(i, 1);
  } else {
    if (
      !obstacles.some((o) => o.x === x && o.y === y && o.size === previewSize)
    ) {
      obstacles.push(new Obstacle(x, y, previewSize));
    }
  }
  refreshCarObjects();
  pathCells = [];
}

function addLine(a, b, size) {
  // convert to cell coordinates so the Bresenham algorithm works with integers
  let x0 = a.x / CELL_SIZE;
  let y0 = a.y / CELL_SIZE;
  const x1 = b.x / CELL_SIZE;
  const y1 = b.y / CELL_SIZE;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    const px = x0 * CELL_SIZE;
    const py = y0 * CELL_SIZE;
    if (!obstacles.some((o) => o.x === px && o.y === py && o.size === size)) {
      obstacles.push(new Obstacle(px, py, size));
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function connectCorners() {
  if (cornerPoints.length < 2) return;
  const size = parseInt(sizeInput.value) * CELL_SIZE;
  const sorted = cornerPoints.slice().sort((a, b) => a.id - b.id);
  for (let i = 1; i < sorted.length; i++) {
    addLine(sorted[i - 1], sorted[i], size);
  }
  cornerPoints = [];
  refreshCarObjects();
  pathCells = [];
}

window.addEventListener('resize', resizeCanvas);

function revealCone(x, y, length, angle, baseWidth) {
  let hit = null;
  slamCtx.save();
  slamCtx.globalCompositeOperation = 'destination-out';
  car.drawKegel(
    x,
    y,
    length,
    angle,
    '#000',
    baseWidth,
    slamCtx,
    (hx, hy) => (hit = { x: hx, y: hy }),
  );
  slamCtx.restore();
  if (hit) {
    slamCtx.fillStyle = 'red';
    slamCtx.beginPath();
    slamCtx.arc(hit.x, hit.y, 3, 0, 2 * Math.PI);
    slamCtx.fill();
  }
}

function revealCar() {
  const bbox = car.getBoundingBox(car.posX, car.posY);
  if (prevCarRect) {
    slamCtx.fillStyle = 'rgba(128,128,128,0.5)';
    slamCtx.fillRect(prevCarRect.x, prevCarRect.y, prevCarRect.w, prevCarRect.h);
  }
  slamCtx.save();
  slamCtx.globalCompositeOperation = 'destination-out';
  slamCtx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
  slamCtx.restore();
  prevCarRect = bbox;
}

function updatePreview() {
  updateObstacleOptions();
}

typeSelect.addEventListener('change', updatePreview);
sizeInput.addEventListener('change', updatePreview);

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
  lastPaintX = dragX;
  lastPaintY = dragY;
  if (typeSelect.value === 'obstacle') paintCell(dragX, dragY);
});

canvas.addEventListener('mouseup', () => {
  if (zoomMode) {
    isPanning = false;
    return;
  }
  if (!editorMode) return;
  if (!isDragging) return;
  const selected = typeSelect.value;

  if (selected === 'target' && !removeCheckbox.checked) {
    targetMarker = new Target(dragX, dragY, previewSize);
    gameMap.target = targetMarker;
    refreshCarObjects();
    pathCells = [];
  } else if (selected === 'corner') {
    if (removeCheckbox.checked) {
      const idx = cornerPoints.findIndex((p) => p.x === dragX && p.y === dragY);
      if (idx !== -1) {
        cornerPoints.splice(idx, 1);
        renumberCornerPoints();
      }
    } else {
      if (!cornerPoints.some((p) => p.x === dragX && p.y === dragY)) {
        cornerPoints.push({ x: dragX, y: dragY, id: cornerPoints.length + 1 });
      }
    }
  }
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
  if (
    typeSelect.value === 'obstacle' &&
    (dragX !== lastPaintX || dragY !== lastPaintY)
  ) {
    paintCell(dragX, dragY);
    lastPaintX = dragX;
    lastPaintY = dragY;
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (controlMode !== 'mouse') return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouseTarget = {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
});

canvas.addEventListener('wheel', (e) => {
  if (!zoomMode) return;
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  zoomScale = Math.max(0.5, Math.min(5, zoomScale * factor));
  updateTransform();
});

function updateMouseFollow() {
  if (!mouseTarget) return;
  if (car.pointInHitbox(mouseTarget.x, mouseTarget.y)) {
    for (const k of Object.keys(car.keys)) car.keys[k] = false;
    car.velocity = 0;
    car.angularVelocity = 0;
    car.acceleration = 0;
    car.angularAcceleration = 0;
    return;
  }
  const cx = car.posX + car.imgWidth / 2;
  const cy = car.posY + car.imgHeight / 2;
  const angle = Math.atan2(mouseTarget.y - cy, mouseTarget.x - cx);
  // Car.rotation describes its back direction, so align the front to the mouse
  let diff = angle - (car.rotation + Math.PI);
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  for (const k of Object.keys(car.keys)) car.keys[k] = false;
  const dist = Math.hypot(mouseTarget.x - cx, mouseTarget.y - cy);
  if (Math.abs(diff) > 0.1) {
    car.keys[diff > 0 ? 'ArrowRight' : 'ArrowLeft'] = true;
  } else if (dist > 10) {
    car.keys.ArrowUp = true;
  } else {
    // Stop immediately when close enough to the target
    car.velocity = 0;
    car.angularVelocity = 0;
    car.acceleration = 0;
    car.angularAcceleration = 0;
  }
}

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
  if (controlMode === 'mouse') updateMouseFollow();
  drawGrid();
  for (const o of obstacles) {
    o.draw(ctx);
    if (showHitboxes && typeof o.drawHitbox === 'function') o.drawHitbox(ctx);
  }
  for (const p of cornerPoints) {
    ctx.fillStyle = 'red';
    ctx.fillRect(p.x, p.y, previewSize, previewSize);
    if (p.id !== undefined) {
      ctx.fillStyle = 'black';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`P${p.id}`, p.x + previewSize / 2, p.y + previewSize / 2);
    }
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
  if (
    isDragging &&
    typeSelect.value === 'obstacle' &&
    !removeCheckbox.checked
  ) {
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
  if (slamMode) {
    revealCar();
    revealCone(18, 40, 700, Math.PI, 6);
    revealCone(45, 40, 400, Math.PI, 140);
    for (const [x, y] of [
      [65, 7],
      [72, 7],
      [91, 7],
      [97, 7],
    ])
      revealCone(x, y, 150, -Math.PI / 2, 8);
    for (const [x, y] of [
      [64, 74],
      [71, 74],
      [90, 74],
      [97, 74],
    ])
      revealCone(x, y, 150, Math.PI / 2, 8);
    revealCone(143, 37, 150, 0, 8);
    revealCone(143, 43, 150, 0, 8);
  }
  car.frontDistance = car.redConeLength;
  car.leftDistance = Math.min(bl1, bl2);
  car.rightDistance = Math.min(br1, br2);
  car.rearDistance = bb;
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
    resizeCanvas();
  });
}

if (editorMode) {
  generateMazeBtn.addEventListener('click', () =>
    generateMaze(gameMap, respawnTarget),
  );
  if (connectCornersBtn)
    connectCornersBtn.addEventListener('click', connectCorners);

  document
    .getElementById('saveMap')
    .addEventListener('click', () => db.downloadMap(gameMap));

  document
    .getElementById('loadMapBtn')
    .addEventListener('click', () =>
      document.getElementById('loadMap').click(),
    );
  document.getElementById('loadMap').addEventListener('change', loadMapFile);
  loadMapCsvBtn.addEventListener('click', () => loadMapCsvInput.click());
  saveMapCsvBtn.addEventListener('click', () => {
    const nameInput = document.getElementById('mapName');
    let n = nameInput.value.trim();
    if (!n) {
      n = db.getDefaultMapName();
      nameInput.value = n;
    }
    const csv = db.serializeCsvMap(gameMap);
    db.downloadMapCsv(gameMap, n + '.csv');
    db.uploadCsvMap(n, csv);
  });
  if (currentCsvFile) {
    overwriteCsvBtn.style.display = 'inline-block';
    overwriteCsvBtn.addEventListener('click', () => {
      const csv = db.serializeCsvMap(gameMap);
      fetch(`/api/csv-maps/${encodeURIComponent(currentCsvFile)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      }).then((res) => {
        if (!res.ok) alert('Fehler beim Speichern');
      });
    });
  } else {
    overwriteCsvBtn.style.display = 'none';
  }
  loadMapCsvInput.addEventListener('change', loadMapCsv);

  document.getElementById('setSizeBtn').addEventListener('click', () => {
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
