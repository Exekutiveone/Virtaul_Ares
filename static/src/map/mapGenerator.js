import { Obstacle } from './Obstacle.js';

export function generateBorder(gameMap, respawnTarget) {
  const { cols, rows, cellSize, obstacles, target } = gameMap;
  for (let x = 0; x < cols; x++) {
    for (const y of [0, rows - 1]) {
      const ox = x * cellSize;
      const oy = y * cellSize;
      if (target && target.intersectsRect(ox, oy, cellSize, cellSize)) {
        if (typeof respawnTarget === 'function') respawnTarget();
        else continue;
      }
      obstacles.push(new Obstacle(ox, oy, cellSize));
    }
  }
  for (let y = 1; y < rows - 1; y++) {
    for (const x of [0, cols - 1]) {
      const ox = x * cellSize;
      const oy = y * cellSize;
      if (target && target.intersectsRect(ox, oy, cellSize, cellSize)) {
        if (typeof respawnTarget === 'function') respawnTarget();
        else continue;
      }
      obstacles.push(new Obstacle(ox, oy, cellSize));
    }
  }
}

