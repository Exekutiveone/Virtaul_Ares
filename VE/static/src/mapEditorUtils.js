// mapEditorUtils.js
export function paintCell(x, y, {
  removeChecked,
  targetMarker,
  previewSize,
  obstacles,
  Obstacle,
  gameMap,
  refreshCarObjects
}) {
  if (removeChecked) {
    if (
      targetMarker &&
      x === targetMarker.x &&
      y === targetMarker.y &&
      previewSize === targetMarker.size
    ) {
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

export function addLine(a, b, size, {
  CELL_SIZE,
  obstacles,
  Obstacle
}) {
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

export function connectCorners({
  cornerPoints,
  sizeInput,
  CELL_SIZE,
  addLine,
  refreshCarObjects
}) {
  if (cornerPoints.length < 2) return;
  const size = parseInt(sizeInput.value) * CELL_SIZE;
  const sorted = cornerPoints.slice().sort((a, b) => a.id - b.id);
  for (let i = 1; i < sorted.length; i++) {
    addLine(sorted[i - 1], sorted[i], size);
  }
  cornerPoints.length = 0;
  refreshCarObjects();
}
