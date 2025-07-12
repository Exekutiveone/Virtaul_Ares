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
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
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
      if (
        obstaclesSet.has(key(nx, ny)) ||
        obstaclesSet.has(key(nx + 1, ny)) ||
        obstaclesSet.has(key(nx, ny + 1)) ||
        obstaclesSet.has(key(nx + 1, ny + 1))
      )
        continue;
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
