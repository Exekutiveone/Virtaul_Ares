import { Car } from './car/car.js';
import { GameMap } from './map/map.js';
import { Obstacle } from './map/Obstacle.js';
import { Target } from './map/Target.js';
import { Waypoint } from './map/Waypoint.js';
import { SpawnPoint } from './map/SpawnPoint.js';
import { generateBorder } from './map/mapGenerator.js';
import { paintCell, addLine, connectCorners } from './mapEditorUtils.js';
import {
  ensureMapList,
  setupControlModeSelect,
  setupSlamCheckbox,
} from './map/management.js';
import * as db from './map/db.js';
import { pollControl, sendTelemetry } from './api/telemetry.js';
import {
  loadSequences,
  runSequence,
  getFormatFromFile,
} from './sequences/runner.js';
import {
  centerOnCar as centerOnCarModule,
  autoFollowCar as autoFollowCarModule,
} from './cameraUtils.js';

function pushMapToServer(gameMap, name = 'map') {
  const data = gameMap.toJSON ? gameMap.toJSON() : gameMap;
  fetch('/api/maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, map: data }),
  }).catch((err) => console.error('pushMapToServer failed', err));
}

// 1 Pixel entspricht dieser Anzahl Zentimeter
const CM_PER_PX = 2;
const DEFAULT_MARKER_SIZE = 20 / CM_PER_PX;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const typeSelect = document.getElementById('drawType');
const sizeInput = document.getElementById('squareSize');
const removeCheckbox = document.getElementById('removeMode');
const toggleHitboxesBtn = document.getElementById('toggleHitboxes');
const findCarBtn = document.getElementById('findCarBtn');
const canvasContainer = document.getElementById('canvasContainer');
const slamCheckbox = document.getElementById('slamMode');
const slamCanvas = document.getElementById('slamCanvas');
const slamCtx = slamCanvas.getContext('2d');
let slamMode = false;
let prevCarRect = null;
// Store all hit locations so repeated scans do not remove markers
const slamHits = [];
const saveMapCsvBtn = document.getElementById('saveMapCsv');
const overwriteCsvBtn = document.getElementById('overwriteMapCsv');
const connectCornersBtn = document.getElementById('connectCorners');
const loadMapCsvInput = document.getElementById('loadMapCsv');
const loadMapCsvBtn = document.getElementById('loadMapCsvBtn');
const sequenceSelect = document.getElementById('sequenceSelect');
const runSequenceBtn = document.getElementById('runSequenceBtn');
const controlModeSelect = document.getElementById('controlMode');
const restartBtn = document.getElementById('restartBtn');
const nextMapBtn = document.getElementById('nextMapBtn');
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
const green2El = document.getElementById('green2Length');
const cam2Slider = document.getElementById('camera2Angle');
const cam2SliderVal = document.getElementById('camera2AngleVal');
const blueLeft1El = document.getElementById('blueLeft1');
const blueLeft2El = document.getElementById('blueLeft2');
const blueRight1El = document.getElementById('blueRight1');
const blueRight2El = document.getElementById('blueRight2');
const blueBackEl = document.getElementById('blueBack');
const speedEl = document.getElementById('speed');
const speedSlider = document.getElementById('speedSlider');
const speedSliderVal = document.getElementById('speedSliderVal');
const rpmEl = document.getElementById('rpm');
const gyroEl = document.getElementById('gyro');
const posXEl = document.getElementById('posX');
const posYEl = document.getElementById('posY');
const slamCoverageEl = document.getElementById('slamCoverage');
const batteryEl = document.getElementById('battery');
const scoreEl = document.getElementById('score');
let score = 0;
let coverageScore = 0;
let coverageInterval = null;
let lastCrash = false;
let batteryDepleted = false;

function updateScoreBoard() {
  if (scoreEl) scoreEl.textContent = score;
}
let mapList = [];
let currentMapIndex = -1;
const cellCmInput = document.getElementById('gridCellCm');
const widthCmInput = document.getElementById('gridWidth');
const heightCmInput = document.getElementById('gridHeight');
const params = new URLSearchParams(window.location.search);
const csvMapUrl = params.get('map');
const editorMode = params.has('editor');

async function initMapList() {
  try {
    const res = await fetch('/api/csv-maps');
    if (!res.ok) return;
    mapList = await res.json();
    if (csvMapUrl) {
      const file = csvMapUrl.startsWith('/static/maps/')
        ? decodeURIComponent(csvMapUrl.substring('/static/maps/'.length))
        : csvMapUrl;
      currentMapIndex = mapList.findIndex((m) => m.file === file);
    }
    if (currentMapIndex === -1 && mapList.length) currentMapIndex = 0;
  } catch (err) {
    console.error('initMapList failed', err);
  }
}

// Immediately start loading the list of available maps.
const mapListReady = initMapList();

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
    car.keys[k];
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
let originalMapData = gameMap.toJSON();
let previewSize;
updateObstacleOptions();
let currentCsvFile = null;
if (!editorMode) {
  const e1 = document.getElementById('editorTools');
  const e2 = document.getElementById('editorTools2');
  if (e1) e1.style.display = 'none';
  if (e2) e2.style.display = 'none';
} else {
  document.querySelectorAll('.cone-display').forEach((el) => {
    el.style.display = 'none';
  });
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
    originalMapData = gm.toJSON();
    CELL_SIZE = gameMap.cellSize;
    obstacles = gameMap.obstacles;
    targetMarker = gameMap.target;
    if (typeof gameMap.startX === 'number') car.startX = gameMap.startX;
    if (typeof gameMap.startY === 'number') car.startY = gameMap.startY;
    spawnMarker = new SpawnPoint(car.startX, car.startY, DEFAULT_MARKER_SIZE);
    waypoints = gameMap.waypoints || [];
    cellCmInput.value = Math.round(gameMap.cellSize * CM_PER_PX);
    updateObstacleOptions();
    refreshCarObjects();
    widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
    heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
    resizeCanvas();
    pushMapToServer(gameMap, currentCsvFile || 'map');
    score = 0;
    coverageScore = 0;
    updateScoreBoard();
  });
}
let obstacles = gameMap.obstacles;
let waypoints = gameMap.waypoints || [];
previewSize = parseInt(sizeInput.value) * CELL_SIZE;
let showHitboxes = false;
let isDragging = false;
let dragX = 0;
let dragY = 0;
let lastPaintX = 0;
let lastPaintY = 0;
let targetMarker = gameMap.target;
let spawnMarker = null;
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

  // Add map boundaries so the car's sensors and collision
  // detection account for the outer margin. Boundaries are
  // represented as simple rectangles with an intersectsRect
  // method so they behave like normal obstacles.
  const width = gameMap.cols * gameMap.cellSize;
  const height = gameMap.rows * gameMap.cellSize;
  const m = gameMap.margin;
  if (m > 0) {
    const bounds = [
      { x: 0, y: 0, w: width, h: m },
      { x: 0, y: height - m, w: width, h: m },
      { x: 0, y: 0, w: m, h: height },
      { x: width - m, y: 0, w: m, h: height },
    ];
    for (const b of bounds) {
      car.objects.push({
        ...b,
        intersectsRect(x, y, w, h) {
          return !(
            x + w < this.x ||
            x > this.x + this.w ||
            y + h < this.y ||
            y > this.y + this.h
          );
        },
      });
    }
  }
}

function respawnTarget() {
  const size = gameMap.target ? gameMap.target.size : DEFAULT_MARKER_SIZE;
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
      break;
    }
  }
}

const carImage = new Image();
carImage.onload = () => {
  resizeCanvas();
  updateObstacleOptions();
  loadSequences(sequenceSelect);
  if (runSequenceBtn)
    runSequenceBtn.addEventListener('click', () => {
      const opt = sequenceSelect.options[sequenceSelect.selectedIndex];
      if (opt) runSequence(car, opt.value, opt.dataset.format);
    });
  setInterval(() => pollControl(car), CONTROL_POLL_INTERVAL);
  pollControl(car);
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
spawnMarker = new SpawnPoint(car.startX, car.startY, DEFAULT_MARKER_SIZE);
refreshCarObjects();

function updateObstacleOptions() {
  if (!typeSelect || !sizeInput) return;
  const size = parseInt(sizeInput.value);
  sizeInput.value = isNaN(size) ? 1 : Math.max(1, Math.min(25, size));
  previewSize = parseInt(sizeInput.value) * CELL_SIZE;
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
    slamHits.length = 0;
    revealCar();
    updateSlamCoverage();
  }
  updateTransform();
}

function updateTransform() {
  canvas.style.transform = `translate(${-translateX}px, ${-translateY}px) scale(${zoomScale})`;
  slamCanvas.style.transform = `translate(${-translateX}px, ${-translateY}px) scale(${zoomScale})`;
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
  if (hit) slamHits.push(hit);
  drawSlamHits();
}

function drawSlamHits() {
  slamCtx.save();
  slamCtx.fillStyle = 'red';
  for (const p of slamHits) {
    slamCtx.beginPath();
    slamCtx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
    slamCtx.fill();
  }
  slamCtx.restore();
}

function revealCar() {
  const bbox = car.getBoundingBox(car.posX, car.posY);
  if (prevCarRect) {
    slamCtx.save();
    slamCtx.globalCompositeOperation = 'destination-out';
    slamCtx.fillRect(
      prevCarRect.x,
      prevCarRect.y,
      prevCarRect.w,
      prevCarRect.h,
    );
    slamCtx.restore();
  }
  slamCtx.save();
  slamCtx.globalCompositeOperation = 'destination-out';
  slamCtx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
  slamCtx.restore();
  prevCarRect = bbox;
  drawSlamHits();
}

function updateSlamCoverage() {
  if (!slamMode || !slamCoverageEl) return;
  const data = slamCtx.getImageData(
    0,
    0,
    slamCanvas.width,
    slamCanvas.height,
  ).data;
  let cleared = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (r === 0 && g === 0 && b === 0 && a === 255) continue;
    total++;
    if (a === 0) cleared++;
  }
  const percent = total ? (cleared / total) * 100 : 0;
  slamCoverageEl.textContent = percent.toFixed(1) + '%';
  const pts = Math.floor(percent);
  if (pts !== coverageScore) {
    score += pts - coverageScore;
    coverageScore = pts;
    updateScoreBoard();
  }
}

function sensorHits(obj, x, y, length, angle) {
  x *= car.scale;
  y *= car.scale;
  length *= car.scale;
  const cx = car.posX + car.imgWidth / 2;
  const cy = car.posY + car.imgHeight / 2;
  const dx = x - car.imgWidth / 2;
  const dy = y - car.imgHeight / 2;
  const rx = dx * Math.cos(car.rotation) - dy * Math.sin(car.rotation);
  const ry = dx * Math.sin(car.rotation) + dy * Math.cos(car.rotation);
  const fx = cx + rx;
  const fy = cy + ry;
  const finalAngle = angle + car.rotation;

  const rect = { x: obj.x, y: obj.y, w: obj.size, h: obj.size };
  const distObj = car.rayRectIntersection(fx, fy, finalAngle, rect);
  if (distObj === Infinity || distObj > length) return false;

  let minDist = length;
  for (const o of car.objects) {
    let d;
    if (o.radius != null) {
      d = car.rayCircleIntersectionDetail(fx, fy, finalAngle, o).dist;
    } else {
      const r = { x: o.x, y: o.y, w: o.w != null ? o.w : o.size, h: o.h != null ? o.h : o.size };
      d = car.rayRectIntersection(fx, fy, finalAngle, r);
    }
    if (d < minDist) minDist = d;
  }

  return distObj <= minDist;
}

function anySensorHits(obj) {
  const sensors = [
    [18, 40, 700, Math.PI],
    [45, 40, 400, Math.PI],
    [45, 40, 400, Math.PI + car.camera2Angle],
    [65, 7, 150, -Math.PI / 2],
    [72, 7, 150, -Math.PI / 2],
    [91, 7, 150, -Math.PI / 2],
    [97, 7, 150, -Math.PI / 2],
    [64, 74, 150, Math.PI / 2],
    [71, 74, 150, Math.PI / 2],
    [90, 74, 150, Math.PI / 2],
    [97, 74, 150, Math.PI / 2],
    [143, 37, 150, 0],
    [143, 43, 150, 0],
  ];
  return sensors.some(([sx, sy, sl, sa]) => sensorHits(obj, sx, sy, sl, sa));
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
  if (typeSelect.value === 'obstacle')
    paintCell(dragX, dragY, {
      removeChecked: removeCheckbox.checked,
      targetMarker,
      previewSize,
      obstacles,
      Obstacle,
      gameMap,
      refreshCarObjects,
    });
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
  } else if (selected === 'waypoint') {
    if (removeCheckbox.checked) {
      const idx = waypoints.findIndex((w) => w.x === dragX && w.y === dragY);
      if (idx !== -1) waypoints.splice(idx, 1);
    } else if (!waypoints.some((w) => w.x === dragX && w.y === dragY)) {
      waypoints.push(new Waypoint(dragX, dragY, previewSize));
    }
    gameMap.waypoints = waypoints;
  } else if (selected === 'start') {
    if (removeCheckbox.checked) {
      spawnMarker = null;
      gameMap.startX = undefined;
      gameMap.startY = undefined;
    } else {
      spawnMarker = new SpawnPoint(dragX, dragY, DEFAULT_MARKER_SIZE);
      gameMap.startX = dragX;
      gameMap.startY = dragY;
      car.startX = dragX;
      car.startY = dragY;
      car.reset();
    }
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
    paintCell(dragX, dragY, {
      removeChecked: removeCheckbox.checked,
      targetMarker,
      previewSize,
      obstacles,
      Obstacle,
      gameMap,
      refreshCarObjects,
    });
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
  for (const w of waypoints) {
    w.draw(ctx);
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
  if (spawnMarker) {
    spawnMarker.draw(ctx);
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
  if (car.crashed && !lastCrash) {
    score -= 10;
    updateScoreBoard();
    lastCrash = true;
  } else if (!car.crashed) {
    lastCrash = false;
  }
  autoFollowCar();
  if (targetMarker && anySensorHits(targetMarker)) {
    score += 100;
    updateScoreBoard();
    targetMarker = null;
    fetch('/api/goal', { method: 'POST' }).catch((err) =>
      console.error('goal notify failed', err),
    );
    nextMap();
  }
  for (const wp of waypoints) {
    if (wp.active && anySensorHits(wp)) {
      wp.active = false;
      score += 10;
      updateScoreBoard();
      fetch('/api/waypoint', { method: 'POST' }).catch((err) =>
        console.error('waypoint notify failed', err),
      );
    }
  }

  redEl.textContent = Math.round(car.redConeLength);
  greenEl.textContent = Math.round(car.greenConeLength);
  const g2 = car.drawKegel(45, 40, 400, Math.PI + car.camera2Angle, 'green', 140);
  car.greenCone2Length = g2;
  if (green2El) green2El.textContent = Math.round(g2);
  const bl1 = car.drawKegel(65, 7, 150, -Math.PI / 2, 'blue', 8);
  const bl2 = car.drawKegel(72, 7, 150, -Math.PI / 2, 'blue', 8);
  const br1 = car.drawKegel(91, 7, 150, -Math.PI / 2, 'blue', 8);
  const br2 = car.drawKegel(97, 7, 150, -Math.PI / 2, 'blue', 8);
  const bb = car.drawKegel(143, 37, 150, 0, 'blue', 8);
  if (slamMode) {
    revealCar();
    revealCone(18, 40, 700, Math.PI, 6);
    revealCone(45, 40, 400, Math.PI, 140);
    revealCone(45, 40, 400, Math.PI + car.camera2Angle, 140);
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
  const crashBtn = document.getElementById('crashIndicator');
  if (car.frontDistance <= 1) {
    crashBtn.style.display = 'inline-block';
  } else {
    crashBtn.style.display = 'none';
  }
  speedEl.textContent = Math.round(car.speed);
  rpmEl.textContent = Math.round(car.rpm);
  gyroEl.textContent = car.gyro.toFixed(1);
  if (batteryEl) batteryEl.textContent = Math.round(car.battery * 100);
  if (posXEl) posXEl.textContent = Math.round(car.posX);
  if (posYEl) posYEl.textContent = Math.round(car.posY);

  if (car.battery <= 0 && !batteryDepleted) {
    batteryDepleted = true;
    nextMap();
  }

  const now = Date.now();
  if (now - lastTelemetry >= TELEMETRY_INTERVAL) {
    const front = Math.round(car.redConeLength);
    const rear = Math.round(bb);
    const left = Math.round(Math.min(bl1, bl2));
    const right = Math.round(Math.min(br1, br2));
    sendTelemetry(car, front, rear, left, right);
    lastTelemetry = now;
  }

  requestAnimationFrame(loop);
}

function loadMapFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  db.loadMapFile(file).then((obj) => {
    gameMap = GameMap.fromJSON(obj);
    originalMapData = gameMap.toJSON();
    CELL_SIZE = gameMap.cellSize;
    obstacles = gameMap.obstacles;
    targetMarker = gameMap.target;
    if (typeof gameMap.startX === 'number') car.startX = gameMap.startX;
    if (typeof gameMap.startY === 'number') car.startY = gameMap.startY;
    spawnMarker = new SpawnPoint(car.startX, car.startY, DEFAULT_MARKER_SIZE);
    waypoints = gameMap.waypoints || [];
    refreshCarObjects();
    widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
    heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
    resizeCanvas();
    pushMapToServer(gameMap, file.name || 'map');
    score = 0;
    coverageScore = 0;
    updateScoreBoard();
  });
}

function loadMapCsv(e) {
  const file = e.target.files[0];
  if (!file) return;
  db.loadMapCsvFile(file).then((gm) => {
    gameMap = gm;
    originalMapData = gm.toJSON();
    CELL_SIZE = gameMap.cellSize;
    obstacles = gameMap.obstacles;
    targetMarker = gameMap.target;
    if (typeof gameMap.startX === 'number') car.startX = gameMap.startX;
    if (typeof gameMap.startY === 'number') car.startY = gameMap.startY;
    spawnMarker = new SpawnPoint(car.startX, car.startY, DEFAULT_MARKER_SIZE);
    waypoints = gameMap.waypoints || [];
    refreshCarObjects();
    widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
    heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
    resizeCanvas();
    pushMapToServer(gameMap, file.name || 'map');
    score = 0;
    coverageScore = 0;
    updateScoreBoard();
  });
}

function loadMapByIndex(idx) {
  if (!mapList.length) return;
  currentMapIndex = (idx + mapList.length) % mapList.length;
  const entry = mapList[currentMapIndex];
  currentCsvFile = entry.file;
  const url = '/static/maps/' + encodeURIComponent(entry.file);
  db.loadMapCsvUrl(url).then((gm) => {
    gameMap = gm;
    originalMapData = gm.toJSON();
    CELL_SIZE = gameMap.cellSize;
    obstacles = gameMap.obstacles;
    targetMarker = gameMap.target;
    if (typeof gameMap.startX === 'number') car.startX = gameMap.startX;
    if (typeof gameMap.startY === 'number') car.startY = gameMap.startY;
    spawnMarker = new SpawnPoint(car.startX, car.startY, DEFAULT_MARKER_SIZE);
    waypoints = gameMap.waypoints || [];
    refreshCarObjects();
    widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
    heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
    resizeCanvas();
    pushMapToServer(gameMap, currentCsvFile || 'map');
    score = 0;
    if (slamMode) {
      slamCtx.fillStyle = 'rgba(128,128,128,0.5)';
      slamCtx.fillRect(0, 0, slamCanvas.width, slamCanvas.height);
      prevCarRect = null;
      slamHits.length = 0;
      revealCar();
      updateSlamCoverage();
    }
    car.reset();
    batteryDepleted = false;
    coverageScore = 0;
    updateScoreBoard();
  });
}

function resetMap() {
  if (!originalMapData) return;
  gameMap = GameMap.fromJSON(originalMapData);
  CELL_SIZE = gameMap.cellSize;
  obstacles = gameMap.obstacles;
  targetMarker = gameMap.target;
  if (typeof gameMap.startX === 'number') car.startX = gameMap.startX;
  if (typeof gameMap.startY === 'number') car.startY = gameMap.startY;
  spawnMarker = new SpawnPoint(car.startX, car.startY, DEFAULT_MARKER_SIZE);
  waypoints = gameMap.waypoints || [];
  refreshCarObjects();
  widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
  heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
  resizeCanvas();
  pushMapToServer(gameMap, currentCsvFile || 'map');
  if (slamMode) {
    slamCtx.fillStyle = 'rgba(128,128,128,0.5)';
    slamCtx.fillRect(0, 0, slamCanvas.width, slamCanvas.height);
    prevCarRect = null;
    slamHits.length = 0;
    revealCar();
    updateSlamCoverage();
  }
  car.reset();
  batteryDepleted = false;
  coverageScore = 0;
  updateScoreBoard();
}

if (editorMode) {
  if (connectCornersBtn)
    connectCornersBtn.addEventListener('click', () =>
      connectCorners({
        cornerPoints,
        sizeInput,
        CELL_SIZE,
        addLine: (a, b, size) =>
          addLine(a, b, size, { CELL_SIZE, obstacles, Obstacle }),
        refreshCarObjects,
      }),
    );

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
    gameMap.startX = car.startX;
    gameMap.startY = car.startY;
    obstacles = gameMap.obstacles;
    targetMarker = null;
    refreshCarObjects();
    resizeCanvas();
    generateBorder(gameMap, respawnTarget);
    originalMapData = gameMap.toJSON();
    updateObstacleOptions();
    pushMapToServer(gameMap, 'map');
  });
}

toggleHitboxesBtn.addEventListener('click', () => {
  showHitboxes = !showHitboxes;
  car.showHitbox = showHitboxes;
  toggleHitboxesBtn.textContent = showHitboxes
    ? 'Hitboxen verstecken'
    : 'Hitboxen anzeigen';
});

if (slamCheckbox) {
  slamCheckbox.addEventListener('change', () => {
    slamMode = slamCheckbox.checked;
    if (slamMode) {
      slamCanvas.width = canvas.width;
      slamCanvas.height = canvas.height;
      slamCanvas.style.display = 'block';
      slamCtx.fillStyle = 'rgba(128,128,128,0.5)';
      slamCtx.fillRect(0, 0, slamCanvas.width, slamCanvas.height);
      prevCarRect = null;
      slamHits.length = 0;
      revealCar();
      if (coverageInterval) clearInterval(coverageInterval);
      coverageInterval = setInterval(updateSlamCoverage, 1000);
      coverageScore = 0;
      updateScoreBoard();
      updateSlamCoverage();
    } else {
      slamCanvas.style.display = 'none';
      slamCtx.clearRect(0, 0, slamCanvas.width, slamCanvas.height);
      prevCarRect = null;
      slamHits.length = 0;
      if (coverageInterval) clearInterval(coverageInterval);
      if (slamCoverageEl) slamCoverageEl.textContent = '0%';
      coverageScore = 0;
      updateScoreBoard();
    }
  });
}

function centerOnCar(radiusCm = 500) {
  const res = centerOnCarModule(
    car,
    canvas,
    canvasContainer,
    CM_PER_PX,
    radiusCm,
    (tx, ty, zs, zm) => {
      translateX = tx;
      translateY = ty;
      zoomScale = zs;
      if (zm) zoomMode = true;
      updateTransform();
    },
  );
}

function autoFollowCar(margin = 50) {
  const res = autoFollowCarModule(
    car,
    canvas,
    canvasContainer,
    translateX,
    translateY,
    zoomScale,
    (tx, ty, zs) => {
      translateX = tx;
      translateY = ty;
      zoomScale = zs || zoomScale;
      updateTransform();
    },
    margin,
  );
}

findCarBtn.addEventListener('click', () => centerOnCar(500));
if (restartBtn) restartBtn.addEventListener('click', resetMap);
function nextMap() {
  ensureMapList(mapList, mapListReady).then(() =>
    loadMapByIndex(currentMapIndex + 1),
  );
}

if (nextMapBtn) nextMapBtn.addEventListener('click', nextMap);
if (speedSlider) {
  speedSlider.addEventListener('input', () => {
    const val = parseFloat(speedSlider.value);
    if (speedSliderVal) speedSliderVal.textContent = val;
    car.fixedSpeed = val > 0 ? val : null;
  });
}
if (cam2Slider) {
  cam2Slider.addEventListener('input', () => {
    const val = parseFloat(cam2Slider.value);
    if (cam2SliderVal) cam2SliderVal.textContent = val;
    car.camera2Angle = (val * Math.PI) / 180;
  });
}
