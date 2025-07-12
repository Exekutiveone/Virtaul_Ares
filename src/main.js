import { Car } from './car.js';
import { GameMap } from './map.js';
import { Obstacle } from './Obstacle.js';
import { Target } from './Target.js';
import { generateMaze, generateBorder } from './mapGenerator.js';
import * as db from './db.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const dropdown = document.getElementById('obstacleSize');
const removeCheckbox = document.getElementById('removeMode');
const generateMazeBtn = document.getElementById('generateMaze');
const calcPathBtn = document.getElementById('calcPathBtn');
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

const TELEMETRY_INTERVAL = 500; // ms
let lastTelemetry = 0;

const CONTROL_POLL_INTERVAL = 200; // ms

async function pollControl() {
  try {
    const res = await fetch('http://localhost:5002/api/control');
    if (!res.ok) return;
    const data = await res.json();
    if (data.action) car.setKeysFromAction(data.action);
  } catch (err) {
    console.error('pollControl failed', err);
  }
}

function sendTelemetry(front, rear, left, right) {
  fetch('http://127.0.0.1:5001/api/car', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      speed: car.speed,
      rpm: car.rpm,
      gyro: car.gyro,
      pos_x: car.posX,
      pos_y: car.posY,
      distances: { front, rear, left, right }
    })
  }).catch(err => console.error('sendTelemetry failed', err));
}

let gameMap = new GameMap(20, 15);
let CELL_SIZE = gameMap.cellSize;
let obstacles = gameMap.obstacles;
let previewSize = parseInt(dropdown.value);
let isDragging = false;
let dragX = 0;
let dragY = 0;
let targetMarker = gameMap.target;
let pathCells = [];
let autopilotRunning = false;

async function followPath() {
  if (autopilotRunning || pathCells.length < 2) return;
  autopilotRunning = true;
  car.autopilot = true;
  for (let i = 0; i < pathCells.length - 1; i++) {
    const cur = pathCells[i];
    const next = pathCells[i + 1];
    let action = null;
    if (next.x > cur.x) action = 'right';
    else if (next.x < cur.x) action = 'left';
    else if (next.y > cur.y) action = 'down';
    else if (next.y < cur.y) action = 'up';
    if (action) {
      try {
        await fetch('http://localhost:5002/api/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        });
      } catch (err) {
        console.error('followPath failed', err);
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }
  try {
    await fetch('http://localhost:5002/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' })
    });
  } catch (err) {
    console.error('followPath stop failed', err);
  }
  car.autopilot = false;
  autopilotRunning = false;
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
    const collides = obstacles.some(o => o.intersectsRect(x, y, size, size)) ||
      temp.intersectsRect(car.posX, car.posY, car.imgWidth, car.imgHeight);
    if (!collides) {
      targetMarker = temp;
      gameMap.target = targetMarker;
      pathCells = [];
      break;
    }
  }
}

function aStar(start, goal) {
  const cols = gameMap.cols;
  const rows = gameMap.rows;
  const obstaclesSet = new Set();
  for (const o of obstacles) {
    const cells = o.size / CELL_SIZE;
    for (let dx = 0; dx < cells; dx++) {
      for (let dy = 0; dy < cells; dy++) {
        obstaclesSet.add(`${o.x / CELL_SIZE + dx},${o.y / CELL_SIZE + dy}`);
      }
    }
  }

  const inBounds = (x, y) => x >= 0 && x < cols && y >= 0 && y < rows;
  const key = (x, y) => `${x},${y}`;
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1]
  ];
  const g = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  const f = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  const came = {};
  const open = [];
  const openSet = new Set();
  const h = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  g[start.y][start.x] = 0;
  f[start.y][start.x] = h(start, goal);
  open.push({ x: start.x, y: start.y });
  openSet.add(key(start.x, start.y));
  while (open.length) {
    open.sort((a, b) => f[a.y][a.x] - f[b.y][b.x]);
    const current = open.shift();
    openSet.delete(key(current.x, current.y));
    if (current.x === goal.x && current.y === goal.y) {
      const path = [{ x: current.x, y: current.y }];
      let cKey = key(current.x, current.y);
      while (came[cKey]) {
        const p = came[cKey];
        path.push({ x: p.x, y: p.y });
        cKey = key(p.x, p.y);
      }
      return path.reverse();
    }
    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!inBounds(nx, ny)) continue;

      if (obstaclesSet.has(key(nx, ny)) ||
          obstaclesSet.has(key(nx + 1, ny)) ||
          obstaclesSet.has(key(nx, ny + 1)) ||
          obstaclesSet.has(key(nx + 1, ny + 1))) continue;

      if (obstaclesSet.has(key(nx, ny))) continue;
      const tentativeG = g[current.y][current.x] + 1;
      if (tentativeG < g[ny][nx]) {
        came[key(nx, ny)] = current;
        g[ny][nx] = tentativeG;
        f[ny][nx] = tentativeG + h({ x: nx, y: ny }, goal);
        if (!openSet.has(key(nx, ny))) {
          open.push({ x: nx, y: ny });
          openSet.add(key(nx, ny));
        }
      }
    }
  }
  return [];
}

const carImage = new Image();
carImage.src = 'extracted_foreground.png';
const car = new Car(ctx, carImage, 0.5, 0, obstacles, { startX: 100, startY: 100 });
refreshCarObjects();

function resizeCanvas() {
  canvas.width = gameMap.cols * CELL_SIZE;
  canvas.height = gameMap.rows * CELL_SIZE;
}

window.addEventListener('resize', resizeCanvas);

dropdown.addEventListener('change', () => {
  const val = dropdown.value;
  previewSize = parseInt(val) || CELL_SIZE;
});

canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  dragX = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE) * CELL_SIZE;
  dragY = Math.floor((e.clientY - rect.top) * scaleY / CELL_SIZE) * CELL_SIZE;
  isDragging = true;
});

canvas.addEventListener('mouseup', () => {
  if (!isDragging) return;
  const selected = dropdown.value;

  if (removeCheckbox.checked) {
    if (targetMarker &&
        dragX === targetMarker.x &&
        dragY === targetMarker.y &&
        previewSize === targetMarker.radius) {
      targetMarker = null;
      gameMap.target = null;
    }

    const i = obstacles.findIndex(o => o.x === dragX && o.y === dragY);
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

canvas.addEventListener('mousemove', e => {
  if (!isDragging) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  dragX = Math.floor((e.clientX - rect.left) * scaleX / CELL_SIZE) * CELL_SIZE;
  dragY = Math.floor((e.clientY - rect.top) * scaleY / CELL_SIZE) * CELL_SIZE;
});

function drawGrid() {
  ctx.strokeStyle = '#ddd';
  for (let x=0; x<=canvas.width; x+=CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x,0);
    ctx.lineTo(x,canvas.height);
    ctx.stroke();
  }
  for (let y=0; y<=canvas.height; y+=CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0,y);
    ctx.lineTo(canvas.width,y);
    ctx.stroke();
  }
}

function loop() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawGrid();
  for (const o of obstacles) o.draw(ctx);
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
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
  if (isDragging && dropdown.value!=='target' && !removeCheckbox.checked) {
    ctx.strokeStyle='red';
    ctx.lineWidth=2;
    ctx.strokeRect(dragX, dragY, previewSize, previewSize);
  }
  car.update(canvas.width, canvas.height);
  if (targetMarker &&
      targetMarker.intersectsRect(car.posX, car.posY, car.imgWidth, car.imgHeight)) {
    respawnTarget();
  }

  redEl.textContent = Math.round(car.redConeLength);
  greenEl.textContent = Math.round(car.greenConeLength);
  const bl1 = car.drawKegel(65,7,150,-Math.PI/2,'blue',8);
  const bl2 = car.drawKegel(72,7,150,-Math.PI/2,'blue',8);
  const br1 = car.drawKegel(91,7,150,-Math.PI/2,'blue',8);
  const br2 = car.drawKegel(97,7,150,-Math.PI/2,'blue',8);
  const bb  = car.drawKegel(143,37,150,0,'blue',8);
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
  db.loadMapFile(file).then(obj => {
    gameMap = GameMap.fromJSON(obj);
    CELL_SIZE = gameMap.cellSize;
    obstacles = gameMap.obstacles;
    targetMarker = gameMap.target;
    refreshCarObjects();
    pathCells = [];
    document.getElementById('gridWidth').value = gameMap.cols;
    document.getElementById('gridHeight').value = gameMap.rows;
    resizeCanvas();
  });
}

generateMazeBtn.addEventListener('click', () => generateMaze(gameMap, respawnTarget));

document.getElementById('saveMap').addEventListener('click', () => db.downloadMap(gameMap));

document.getElementById('saveMapDb').addEventListener('click', () => {
  let name = document.getElementById('mapName').value.trim();
  if (!name) {
    name = db.getDefaultMapName();
    document.getElementById('mapName').value = name;
  }
  db.uploadMap(name, gameMap).then(res => {
    if (res.ok) alert('Gespeichert');
    else res.text().then(t => alert('Fehler beim Speichern:\n' + t));
  }).catch(err => alert('Netzwerkfehler:\n' + err));
});

document.getElementById('loadMapBtn').addEventListener('click', () => document.getElementById('loadMap').click());
document.getElementById('loadMap').addEventListener('change', loadMapFile);

document.getElementById('loadMapDb').addEventListener('click', () => {
  const mapId = document.getElementById('mapSelect').value;
  if (!mapId) { alert('Keine Map ausgewählt'); return; }
  db.loadMapFromDb(mapId).then(obj => {
    gameMap = GameMap.fromJSON(obj);
    CELL_SIZE = gameMap.cellSize;
    obstacles = gameMap.obstacles;
    targetMarker = gameMap.target;
    refreshCarObjects();
    pathCells = [];
    document.getElementById('gridWidth').value = gameMap.cols;
    document.getElementById('gridHeight').value = gameMap.rows;
    resizeCanvas();
  });
});

document.getElementById('fetchMaps').addEventListener('click', () => {
  db.fetchAvailableMaps().then(data => {
    const select = document.getElementById('mapSelect');
    select.innerHTML = '';
    data.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name + ' (' + m.created_at + ')';
      select.appendChild(opt);
    });
  });
});

document.getElementById('renameMapBtn').addEventListener('click', () => {
  const mapId = document.getElementById('mapSelect').value;
  const newName = document.getElementById('renameMapName').value.trim();
  if (!mapId) { alert('Keine Map ausgewählt'); return; }
  if (!newName) { alert('Neuer Name fehlt'); return; }
  db.renameMap(mapId, newName).then(res => {
    if (res.ok) { document.getElementById('fetchMaps').click(); alert('Umbenannt'); }
    else res.text().then(t => alert('Fehler beim Umbenennen:\n' + t));
  });
});

document.getElementById('deleteMapBtn').addEventListener('click', () => {
  const mapId = document.getElementById('mapSelect').value;
  if (!mapId) { alert('Keine Map ausgewählt'); return; }
  if (!confirm('Map löschen?')) return;
  db.deleteMap(mapId).then(res => {
    if (res.ok) { document.getElementById('fetchMaps').click(); alert('Gelöscht'); }
    else res.text().then(t => alert('Fehler beim Löschen:\n' + t));
  });
});

document.getElementById('setSizeBtn').addEventListener('click', () => {
  const w = parseInt(document.getElementById('gridWidth').value, 10);
  const h = parseInt(document.getElementById('gridHeight').value, 10);
  if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) { alert('Invalid size'); return; }
  gameMap = new GameMap(w, h, CELL_SIZE);
  obstacles = gameMap.obstacles;
  targetMarker = null;
  refreshCarObjects();
  resizeCanvas();
  pathCells = [];
  generateBorder(gameMap, respawnTarget);
});

calcPathBtn.addEventListener('click', () => {
  if (!targetMarker) return;
  const start = {
    x: Math.floor((car.posX + car.imgWidth / 2) / CELL_SIZE),
    y: Math.floor((car.posY + car.imgHeight / 2) / CELL_SIZE)
  };
  const goal = {
    x: Math.floor(targetMarker.x / CELL_SIZE),
    y: Math.floor(targetMarker.y / CELL_SIZE)
  };
  start.x = Math.min(start.x, gameMap.cols - 2);
  start.y = Math.min(start.y, gameMap.rows - 2);
  goal.x = Math.min(goal.x, gameMap.cols - 2);
  goal.y = Math.min(goal.y, gameMap.rows - 2);
  pathCells = aStar(start, goal);
  followPath();
});

carImage.onload = () => {
  resizeCanvas();
  document.getElementById('fetchMaps').click();
  setInterval(pollControl, CONTROL_POLL_INTERVAL);
  pollControl();
  loop();
};