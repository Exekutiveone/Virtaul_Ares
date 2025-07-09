export async function followPath(car, pathCells, cellSize) {
  if (!car || !Array.isArray(pathCells) || pathCells.length < 2) return;
  if (followPath.running) return;
  followPath.running = true;
  car.autopilot = true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const send = async action => {
    car.setKeysFromAction(action);
    try {
      await fetch('http://localhost:5002/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
    } catch (err) {
      console.error('autopilot send failed', err);
    }
  };
  const norm = a => {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  };
  for (let i = 0; i < pathCells.length - 1; i++) {
    const next = pathCells[i + 1];
    const targetX = next.x * cellSize;
    const targetY = next.y * cellSize;
    let angle = Math.atan2(targetY - car.posY, targetX - car.posX);
    let diff = norm(angle - car.rotation);
    while (Math.abs(diff) > 0.1) {
      await send(diff > 0 ? 'right' : 'left');
      await sleep(100);
      angle = Math.atan2(targetY - car.posY, targetX - car.posX);
      diff = norm(angle - car.rotation);
    }
    await send('stop');
    let dist = Math.hypot(targetX - car.posX, targetY - car.posY);
    while (dist > cellSize / 2) {
      await send('forward');
      await sleep(100);
      dist = Math.hypot(targetX - car.posX, targetY - car.posY);
    }
    await send('stop');
  }
  await send('stop');
  car.autopilot = false;
  followPath.running = false;
}

export function aStar(start, goal, gameMap) {
  const { cols, rows, obstacles, cellSize } = gameMap;
  const obstaclesSet = new Set();
  for (const o of obstacles) {
    const cells = o.size / cellSize;
    for (let dx = 0; dx < cells; dx++) {
      for (let dy = 0; dy < cells; dy++) {
        obstaclesSet.add(`${o.x / cellSize + dx},${o.y / cellSize + dy}`);
      }
    }
  }
  const inBounds = (x, y) => x >= 0 && x < cols && y >= 0 && y < rows;
  const key = (x, y) => `${x},${y}`;
  const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
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
      if (
        obstaclesSet.has(key(nx, ny)) ||
        obstaclesSet.has(key(nx + 1, ny)) ||
        obstaclesSet.has(key(nx, ny + 1)) ||
        obstaclesSet.has(key(nx + 1, ny + 1))
      ) continue;
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