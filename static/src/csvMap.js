import { GameMap } from './map.js';
import { Obstacle } from './Obstacle.js';
import { Target } from './Target.js';

export function parseCsvMap(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return new GameMap(20, 15);
  const [cols, rows, cellSize, margin] = lines[0]
    .split(',')
    .map((n) => parseFloat(n));
  const gm = new GameMap(cols, rows, cellSize, margin);
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts[0] === 'target') {
      gm.target = new Target(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3]),
      );
    } else if (parts[0] === 'obstacle') {
      gm.obstacles.push(
        new Obstacle(
          parseFloat(parts[1]),
          parseFloat(parts[2]),
          parseFloat(parts[3]),
        ),
      );
    }
  }
  return gm;
}

export function serializeCsvMap(gameMap) {
  const lines = [
    [gameMap.cols, gameMap.rows, gameMap.cellSize, gameMap.margin].join(','),
  ];
  if (gameMap.target) {
    lines.push(
      [
        'target',
        gameMap.target.x,
        gameMap.target.y,
        gameMap.target.radius,
      ].join(','),
    );
  }
  for (const o of gameMap.obstacles) {
    lines.push(['obstacle', o.x, o.y, o.size].join(','));
  }
  return lines.join('\n');
}
