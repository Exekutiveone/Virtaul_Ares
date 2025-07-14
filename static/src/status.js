const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');

const CELL = 10; // pixel size of each grid cell
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

setInterval(refresh, 1000);
refresh();
