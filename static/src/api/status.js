const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');
const slamCanvas = document.getElementById('slamMapCanvas');
const slamCtx = slamCanvas.getContext('2d');
const baseSlamWidth = slamCanvas.width;
const baseSlamHeight = slamCanvas.height;

const CELL = 10; // pixel size of each grid cell
// The mapping uses the same scale as the main interface where
// each pixel represents this many centimeters in the real world.
const CM_PER_PX = 2;
const cols = Math.floor(canvas.width / CELL);
const rows = Math.floor(canvas.height / CELL);
const grid = Array.from({ length: rows }, () => Array(cols).fill(0)); // 0=unknown,1=free,2=obstacle

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const val = grid[r][c];
      if (val === 0) ctx.fillStyle = '#444';
      else if (val === 1) ctx.fillStyle = '#222';
      else ctx.fillStyle = '#fff';
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  }
  if (lastPos) {
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(lastPos.x, lastPos.y, 4, 0, 2 * Math.PI);
    ctx.fill();
    // Display the coordinates in the top right corner using pixels
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const coordText = `(${Math.round(lastPos.x)}, ${Math.round(lastPos.y)})`;
    ctx.fillText(coordText, canvas.width - 4, 4);

    // Also display the real world coordinates next to the current
    // position using the defined scale.
    const xCm = lastPos.x * CM_PER_PX;
    const yCm = lastPos.y * CM_PER_PX;
    const realText = `${(xCm / 100).toFixed(2)}m, ${(yCm / 100).toFixed(2)}m`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(realText, lastPos.x + 6, lastPos.y - 6);
  }
}

function castRay(x, y, angle, dist) {
  for (let d = 0; d < dist; d += CELL) {
    const rx = x + Math.cos(angle) * d;
    const ry = y + Math.sin(angle) * d;
    const c = Math.floor(rx / CELL);
    const r = Math.floor(ry / CELL);
    if (c >= 0 && c < cols && r >= 0 && r < rows) {
      if (grid[r][c] === 0) grid[r][c] = 1;
    }
  }
  const ox = x + Math.cos(angle) * dist;
  const oy = y + Math.sin(angle) * dist;
  const oc = Math.floor(ox / CELL);
  const or = Math.floor(oy / CELL);
  if (oc >= 0 && oc < cols && or >= 0 && or < rows) {
    grid[or][oc] = 2;
  }
}

let lastPos = null;

async function refresh() {
  const res = await fetch('/api/car');
  const data = await res.json();
  document.getElementById('state').textContent = JSON.stringify(data, null, 2);
  const gridRes = await fetch('/api/grid');
  const gridEl = document.getElementById('grid');
  if (gridRes.ok) {
    const g = await gridRes.json();
    gridEl.textContent = JSON.stringify(g, null, 2);
  } else {
    gridEl.textContent = 'Keine Kartendaten verfügbar';
  }
  if (!data || !data.distances) return;
  const { pos_x: x, pos_y: y, gyro } = data;
  lastPos = { x, y };
  const rad = (gyro * Math.PI) / 180;
  const { front, rear, left, right } = data.distances;
  if (isFinite(front)) castRay(x, y, rad + Math.PI, front);
  if (isFinite(rear)) castRay(x, y, rad, rear);
  if (isFinite(left)) castRay(x, y, rad + Math.PI / 2, left);
  if (isFinite(right)) castRay(x, y, rad - Math.PI / 2, right);
  drawGrid();
}

async function updateSlamMap() {
  const res = await fetch('/api/slam-map');
  if (!res.ok) return;
  const data = await res.json();
  const w = data.gridSize.width;
  const h = data.gridSize.height;
  if (!w || !h) return;
  const cell = Math.max(1, Math.floor(Math.min(baseSlamWidth / w, baseSlamHeight / h)));
  const newWidth = Math.max(1, w * cell);
  const newHeight = Math.max(1, h * cell);
  if (slamCanvas.width !== newWidth || slamCanvas.height !== newHeight) {
    slamCanvas.width = newWidth;
    slamCanvas.height = newHeight;
  }
  slamCtx.clearRect(0, 0, slamCanvas.width, slamCanvas.height);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const val = data.cells[y][x];
      if (val === 0) slamCtx.fillStyle = '#cccccc';
      else if (val === 1) slamCtx.fillStyle = '#ffffff';
      else if (val === 2) slamCtx.fillStyle = '#000000';
      slamCtx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

setInterval(refresh, 1000);
setInterval(updateSlamMap, 1000);
refresh();
updateSlamMap();
