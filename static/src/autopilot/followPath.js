import { sendAction } from './send.js';

export async function followPath(car, pathCells, cellSize) {
  if (!car || !Array.isArray(pathCells) || pathCells.length < 2) return;
  if (followPath.running) return;
  followPath.running = true;
  car.autopilot = true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (a) => {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  };
  try {
    for (let i = 0; i < pathCells.length - 1; i++) {
      const next = pathCells[i + 1];
      const targetX = next.x * cellSize + cellSize / 2;
      const targetY = next.y * cellSize + cellSize / 2;
      let angle = Math.atan2(
        targetY - (car.posY + car.imgHeight / 2),
        targetX - (car.posX + car.imgWidth / 2),
      );
      // car.rotation points backwards; align the front to the path angle
      let diff = norm(angle - (car.rotation + Math.PI));
      while (Math.abs(diff) > 0.1) {
        await sendAction(car, diff > 0 ? 'right' : 'left');
        await sleep(50);
        await sendAction(car, 'stop');
        await sleep(50);
        angle = Math.atan2(
          targetY - (car.posY + car.imgHeight / 2),
          targetX - (car.posX + car.imgWidth / 2),
        );
        diff = norm(angle - (car.rotation + Math.PI));
      }
      await sendAction(car, 'stop');
      let dist = Math.hypot(
        targetX - (car.posX + car.imgWidth / 2),
        targetY - (car.posY + car.imgHeight / 2),
      );
      while (dist > cellSize / 2) {
        await sendAction(car, 'forward');
        await sleep(50);
        await sendAction(car, 'stop');
        await sleep(50);
        dist = Math.hypot(
          targetX - (car.posX + car.imgWidth / 2),
          targetY - (car.posY + car.imgHeight / 2),
        );
      }
      await sendAction(car, 'stop');
    }
    await sendAction(car, 'stop');
  } finally {
    car.autopilot = false;
    followPath.running = false;
  }
}
