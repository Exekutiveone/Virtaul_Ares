// ========================= Imports =========================
import { createCar, carImage } from './car/setup.js';
import { GameMap } from './map/map.js';
import { Obstacle } from './map/Obstacle.js';
import { Target } from './map/Target.js';
import { Waypoint } from './map/Waypoint.js';
import { generateBorder } from './map/mapGenerator.js';
import * as db from './map/db.js';
import { pollControl, sendTelemetry } from './api/telemetry.js';
import {
  pushMap,
  fetchCsvMapList,
  overwriteCsvMap,
} from './api/maps.js';
import { loadSequences, runSequence, getFormatFromFile } from './sequences/runner.js';

// ========================= Konstanten / UI Bindings =========================
const CM_PER_PX = 2;
const WAYPOINT_SIZE = 20 / CM_PER_PX;
const TARGET_SIZE = 20;

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
const slamHits = []; // für SLAM Marker
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

// ========================= Steuerung & UI States =========================
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
const speedSlider = document.getElementById('speedSlider');
const speedSliderVal = document.getElementById('speedSliderVal');
const rpmEl = document.getElementById('rpm');
const gyroEl = document.getElementById('gyro');
const posXEl = document.getElementById('posX');
const posYEl = document.getElementById('posY');
const slamCoverageEl = document.getElementById('slamCoverage');
const scoreEl = document.getElementById('score');
let score = 0;
let coverageScore = 0;
let coverageInterval = null;
let lastCrash = false;

// ========================= Scoreboard Logic =========================
function updateScoreBoard() {
  if (scoreEl) scoreEl.textContent = score;
}

// ========================= Map Handling / Initialisierung =========================
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
    mapList = await fetchCsvMapList();
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
const mapListReady = initMapList();
async function ensureMapList() {
  if (!mapList.length) {
    try {
      await mapListReady;
    } catch (err) {
      console.error('ensureMapList failed', err);
    }
  }
}

// ========================= Control Mode Handling =========================
if (controlModeSelect) {
  controlModeSelect.addEventListener('change', () => {
    controlMode = controlModeSelect.value;
    car.autopilot = controlMode === 'mouse';
  });
}

// ========================= SLAM Mode =========================
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

// ========================= Tastatursteuerung =========================
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

// ========================= Zoom und Panning =========================
let zoomMode = false;
let zoomScale = 1;
let translateX = 0;
let translateY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

// ========================= Polling-Intervalle =========================
const TELEMETRY_INTERVAL = 500;
let lastTelemetry = 0;
const CONTROL_POLL_INTERVAL = 200;

// ========================= Map- und Canvas-Initialisierung =========================
let CELL_SIZE = parseFloat(cellCmInput.value) / CM_PER_PX;
const initialWidthCm = parseFloat(widthCmInput.value);
const initialHeightCm = parseFloat(heightCmInput.value);
const initialCols = Math.max(1, Math.round(initialWidthCm / parseFloat(cellCmInput.value)));
const initialRows = Math.max(1, Math.round(initialHeightCm / parseFloat(cellCmInput.value)));
let gameMap = new GameMap(initialCols, initialRows, CELL_SIZE);
let originalMapData = gameMap.toJSON();
let previewSize;
updateObstacleOptions();
let currentCsvFile = null;

// ========================= Editor/Viewer Logik =========================
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
    currentCsvFile = decodeURIComponent(csvMapUrl.substring('/static/maps/'.length));
    const nameInput = document.getElementById('mapName');
    if (nameInput && !nameInput.value) nameInput.value = currentCsvFile;
  }
  db.loadMapCsvUrl(csvMapUrl).then((gm) => {
    gameMap = gm;
    originalMapData = gm.toJSON();
    CELL_SIZE = gameMap.cellSize;
    obstacles = gameMap.obstacles;
    targetMarker = gameMap.target;
    waypoints = gameMap.waypoints || [];
    cellCmInput.value = Math.round(gameMap.cellSize * CM_PER_PX);
    updateObstacleOptions();
    refreshCarObjects();
    widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
    heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
    resizeCanvas();
    pushMap(gameMap, currentCsvFile || 'map');
  });
}

let obstacles = gameMap.obstacles;
let waypoints = gameMap.waypoints || [];
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
let cornerPoints = [];

// ========================= Hilfsfunktionen für Corners und Car/Map =========================
function renumberCornerPoints() {
  cornerPoints.forEach((p, i) => {
    p.id = i + 1;
  });
}
function refreshCarObjects() {
  car.objects = obstacles.slice();
  // Boundaries hinzufügen
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
  const size = targetMarker ? targetMarker.size : TARGET_SIZE;
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

// ========================= Car Instanzierung =========================
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
const car = createCar(ctx, obstacles, CM_PER_PX);
car.autopilot = controlMode === 'mouse';
refreshCarObjects();

// ========================= Map/Obstacle/Canvas Grid UI Updates =========================
function updateObstacleOptions() {
  if (!typeSelect || !sizeInput) return;
  const size = parseInt(sizeInput.value);
  sizeInput.value = isNaN(size) ? 1 : Math.max(1, Math.min(25, size));
  previewSize =
    typeSelect.value === 'target'
      ? CELL_SIZE
      : typeSelect.value === 'waypoint'
        ? WAYPOINT_SIZE
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

// ========================= Zeichnen/Bearbeiten: Zellen, Linien, Corners =========================
function paintCell(x, y) {
  if (removeCheckbox.checked) {
    if (
      targetMarker &&
      x === targetMarker.x &&
      y === targetMarker.y &&
      previewSize === targetMarker.size
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
}
function addLine(a, b, size) {
  // Bresenham Algorithmus für Linien auf der Karte
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
}

// ========================= Window Resize =========================
window.addEventListener('resize', resizeCanvas);

// ========================= SLAM Funktionen =========================
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
    slamCtx.fillRect(prevCarRect.x, prevCarRect.y, prevCarRect.w, prevCarRect.h);
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
  const data = slamCtx.getImageData(0, 0, slamCanvas.width, slamCanvas.height).data;
  let cleared = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) cleared++;
  }
  const total = slamCanvas.width * slamCanvas.height;
  const percent = (cleared / total) * 100;
  slamCoverageEl.textContent = percent.toFixed(1) + '%';
  const pts = Math.floor(percent);
  if (pts !== coverageScore) {
    score += pts - coverageScore;
    coverageScore = pts;
    updateScoreBoard();
  }
}

// ========================= Vorschau/Preview Update =========================
function updatePreview() {
  updateObstacleOptions();
}
typeSelect.addEventListener('change', updatePreview);
sizeInput.addEventListener('change', updatePreview);

// ========================= Canvas Event Handler (Editier- & Steuerungslogik) =========================
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
  } else if (selected === 'waypoint') {
    if (removeCheckbox.checked) {
      const idx = waypoints.findIndex((w) => w.x === dragX && w.y === dragY);
      if (idx !== -1) waypoints.splice(idx, 1);
    } else if (!waypoints.some((w) => w.x === dragX && w.y === dragY)) {
      waypoints.push(new Waypoint(dragX, dragY, WAYPOINT_SIZE));
    }
    gameMap.waypoints = waypoints;
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

// ========================= Mausbasierte Car-Steuerung =========================
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
    car.velocity = 0;
    car.angularVelocity = 0;
    car.acceleration = 0;
    car.angularAcceleration = 0;
  }
}

// ========================= Grid Rendering =========================
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

// ========================= Haupt-Render/Logik-Loop =========================
function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (controlMode === 'mouse') updateMouseFollow();
  drawGrid();
  for (const o of obstacles) {
    o.draw(ctx);
    if (showHitboxes && typeof o.drawHitbox === 'function') o.drawHitbox(ctx);
  }
  for (const w of waypoints) w.draw(ctx);
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
  if (targetMarker) targetMarker.draw(ctx);

  // Draw preview while dragging
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

  // Score Logic on Crash
  if (car.crashed && !lastCrash) {
    score -= 10;
    updateScoreBoard();
    lastCrash = true;
  } else if (!car.crashed) {
    lastCrash = false;
  }

  autoFollowCar();

  // Ziel/Target Treffer
  const bboxCurrent = car.getBoundingBox(car.posX, car.posY);
  if (targetMarker) {
    if (
      targetMarker.intersectsRect(
        bboxCurrent.x,
        bboxCurrent.y,
        bboxCurrent.w,
        bboxCurrent.h,
      )
    ) {
      score += 100;
      updateScoreBoard();
      targetMarker = null;
      nextMap();
      return;
    }
  }

  // Waypoint Treffer
  for (const wp of waypoints) {
    if (
      wp.active &&
      wp.intersectsRect(
        bboxCurrent.x,
        bboxCurrent.y,
        bboxCurrent.w,
        bboxCurrent.h,
      )
    ) {
      wp.active = false;
      score += 10;
      updateScoreBoard();
    }
  }

  // Sensorwerte/Visualisierung
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

  // Sensor-Logik (Aktualisieren für Steuerung)
  car.frontDistance = car.redConeLength;
  car.leftDistance = Math.min(bl1, bl2);
  car.rightDistance = Math.min(br1, br2);
  car.rearDistance = bb;
  blueLeft1El.textContent = Math.round(bl1);
  blueLeft2El.textContent = Math.round(bl2);
  blueRight1El.textContent = Math.round(br1);
  blueRight2El.textContent = Math.round(br2);
  blueBackEl.textContent = Math.round(bb);

  // Crash Button Visualisierung
  const crashBtn = document.getElementById('crashIndicator');
  if (car.frontDistance <= 1) {
    crashBtn.style.display = 'inline-block';
  } else {
    crashBtn.style.display = 'none';
  }

  // Datenanzeige: Geschwindigkeit, RPM, Gyro, Position
  speedEl.textContent = Math.round(car.speed);
  rpmEl.textContent = Math.round(car.rpm);
  gyroEl.textContent = car.gyro.toFixed(1);
  if (posXEl) posXEl.textContent = Math.round(car.posX);
  if (posYEl) posYEl.textContent = Math.round(car.posY);

  // Telemetrie Senden
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

// ========================= Map-Handling (Datei, CSV, Index, Reset) =========================
function loadMapFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  db.loadMapFile(file).then((obj) => {
    gameMap = GameMap.fromJSON(obj);
    originalMapData = gameMap.toJSON();
    CELL_SIZE = gameMap.cellSize;
    obstacles = gameMap.obstacles;
    targetMarker = gameMap.target;
    waypoints = gameMap.waypoints || [];
    refreshCarObjects();
    widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
    heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
    resizeCanvas();
    pushMap(gameMap, file.name || 'map');
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
    waypoints = gameMap.waypoints || [];
    refreshCarObjects();
    widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
    heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
    resizeCanvas();
    pushMap(gameMap, file.name || 'map');
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
    waypoints = gameMap.waypoints || [];
    refreshCarObjects();
    widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
    heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
    resizeCanvas();
    pushMap(gameMap, currentCsvFile || 'map');
    if (slamMode) {
      slamCtx.fillStyle = 'rgba(128,128,128,0.5)';
      slamCtx.fillRect(0, 0, slamCanvas.width, slamCanvas.height);
      prevCarRect = null;
      slamHits.length = 0;
      revealCar();
      updateSlamCoverage();
    }
    car.reset();
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
  waypoints = gameMap.waypoints || [];
  refreshCarObjects();
  widthCmInput.value = gameMap.cols * gameMap.cellSize * CM_PER_PX;
  heightCmInput.value = gameMap.rows * gameMap.cellSize * CM_PER_PX;
  resizeCanvas();
  pushMap(gameMap, currentCsvFile || 'map');
  if (slamMode) {
    slamCtx.fillStyle = 'rgba(128,128,128,0.5)';
    slamCtx.fillRect(0, 0, slamCanvas.width, slamCanvas.height);
    prevCarRect = null;
    slamHits.length = 0;
    revealCar();
    updateSlamCoverage();
  }
  car.reset();
  coverageScore = 0;
  updateScoreBoard();
}

// ========================= Editor-Only Funktionen/Buttons =========================
if (editorMode) {
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
      overwriteCsvMap(currentCsvFile, csv).then((res) => {
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
    generateBorder(gameMap, respawnTarget);
    originalMapData = gameMap.toJSON();
    updateObstacleOptions();
    pushMap(gameMap, 'map');
  });
}

// ========================= UI Buttons & Sliders =========================
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
function autoFollowCar(margin = 50) {
  const viewW = canvasContainer.clientWidth / zoomScale;
  const viewH = canvasContainer.clientHeight / zoomScale;
  let newX = translateX;
  let newY = translateY;

  if (canvas.width > viewW) {
    const left = (car.posX - newX) * zoomScale;
    const right = (car.posX + car.imgWidth - newX) * zoomScale;
    if (right > canvasContainer.clientWidth - margin) {
      newX =
        car.posX +
        car.imgWidth -
        (canvasContainer.clientWidth - margin) / zoomScale;
      newX = Math.min(newX, canvas.width - viewW);
    } else if (left < margin) {
      newX = car.posX - margin / zoomScale;
      newX = Math.max(0, newX);
    }
  }

  if (canvas.height > viewH) {
    const top = (car.posY - newY) * zoomScale;
    const bottom = (car.posY + car.imgHeight - newY) * zoomScale;
    if (bottom > canvasContainer.clientHeight - margin) {
      newY =
        car.posY +
        car.imgHeight -
        (canvasContainer.clientHeight - margin) / zoomScale;
      newY = Math.min(newY, canvas.height - viewH);
    } else if (top < margin) {
      newY = car.posY - margin / zoomScale;
      newY = Math.max(0, newY);
    }
  }

  if (newX !== translateX || newY !== translateY) {
    translateX = newX;
    translateY = newY;
    updateTransform();
  }
}
findCarBtn.addEventListener('click', () => centerOnCar(500));
if (restartBtn) restartBtn.addEventListener('click', resetMap);
function nextMap() {
  ensureMapList().then(() => loadMapByIndex(currentMapIndex + 1));
}
if (nextMapBtn) nextMapBtn.addEventListener('click', nextMap);
if (speedSlider) {
  speedSlider.addEventListener('input', () => {
    const val = parseFloat(speedSlider.value);
    if (speedSliderVal) speedSliderVal.textContent = val;
    car.fixedSpeed = val > 0 ? val : null;
  });
}
