export const CM_PER_PX = 2;
export const WAYPOINT_SIZE = 20 / CM_PER_PX;
export const TARGET_SIZE = 20;

export const canvas = document.getElementById('canvas');
export const ctx = canvas.getContext('2d');
export const typeSelect = document.getElementById('drawType');
export const sizeInput = document.getElementById('squareSize');
export const removeCheckbox = document.getElementById('removeMode');
export const toggleHitboxesBtn = document.getElementById('toggleHitboxes');
export const findCarBtn = document.getElementById('findCarBtn');
export const canvasContainer = document.getElementById('canvasContainer');
export const slamCheckbox = document.getElementById('slamMode');
export const slamCanvas = document.getElementById('slamCanvas');
export const slamCtx = slamCanvas.getContext('2d');

export let slamMode = false;
export let prevCarRect = null;
export const slamHits = [];
export const saveMapCsvBtn = document.getElementById('saveMapCsv');
export const overwriteCsvBtn = document.getElementById('overwriteMapCsv');
export const connectCornersBtn = document.getElementById('connectCorners');
export const loadMapCsvInput = document.getElementById('loadMapCsv');
export const loadMapCsvBtn = document.getElementById('loadMapCsvBtn');
export const sequenceSelect = document.getElementById('sequenceSelect');
export const runSequenceBtn = document.getElementById('runSequenceBtn');
export const controlModeSelect = document.getElementById('controlMode');
export const restartBtn = document.getElementById('restartBtn');
export const nextMapBtn = document.getElementById('nextMapBtn');

export let controlMode = controlModeSelect ? controlModeSelect.value : 'wasd';
export let mouseTarget = null;
export const keyMap = { w: 'ArrowUp', a: 'ArrowLeft', s: 'ArrowDown', d: 'ArrowRight' };

export const redEl = document.getElementById('redLength');
export const greenEl = document.getElementById('greenLength');
export const blueLeft1El = document.getElementById('blueLeft1');
export const blueLeft2El = document.getElementById('blueLeft2');
export const blueRight1El = document.getElementById('blueRight1');
export const blueRight2El = document.getElementById('blueRight2');
export const blueBackEl = document.getElementById('blueBack');
export const speedEl = document.getElementById('speed');
export const speedSlider = document.getElementById('speedSlider');
export const speedSliderVal = document.getElementById('speedSliderVal');
export const rpmEl = document.getElementById('rpm');
export const gyroEl = document.getElementById('gyro');
export const posXEl = document.getElementById('posX');
export const posYEl = document.getElementById('posY');
export const slamCoverageEl = document.getElementById('slamCoverage');
export const scoreEl = document.getElementById('score');

export let score = 0;
export let coverageScore = 0;
export let coverageInterval = null;
export let lastCrash = false;

export function toggleHitboxes(showHitboxes, car) {
  showHitboxes.value = !showHitboxes.value;
  car.showHitbox = showHitboxes.value;
  toggleHitboxesBtn.textContent = showHitboxes.value
    ? 'Hitboxen verstecken'
    : 'Hitboxen anzeigen';
}

export function centerOnCar(car, zoom, updateTransform, radiusCm = 500) {
  const diameterPx = (radiusCm * 2) / CM_PER_PX;
  const cw = canvasContainer.clientWidth;
  const ch = canvasContainer.clientHeight;
  zoom.scale = Math.min(cw / diameterPx, ch / diameterPx);
  const viewW = cw / zoom.scale;
  const viewH = ch / zoom.scale;
  const carX = car.posX + car.imgWidth / 2;
  const carY = car.posY + car.imgHeight / 2;
  zoom.translateX = carX - viewW / 2;
  zoom.translateY = carY - viewH / 2;
  zoom.translateX = Math.max(0, Math.min(zoom.translateX, canvas.width - viewW));
  zoom.translateY = Math.max(0, Math.min(zoom.translateY, canvas.height - viewH));
  zoom.mode = true;
  updateTransform();
}

export function autoFollowCar(car, zoom, updateTransform, margin = 50) {
  const viewW = canvasContainer.clientWidth / zoom.scale;
  const viewH = canvasContainer.clientHeight / zoom.scale;
  let newX = zoom.translateX;
  let newY = zoom.translateY;

  if (canvas.width > viewW) {
    const left = (car.posX - newX) * zoom.scale;
    const right = (car.posX + car.imgWidth - newX) * zoom.scale;
    if (right > canvasContainer.clientWidth - margin) {
      newX =
        car.posX +
        car.imgWidth -
        (canvasContainer.clientWidth - margin) / zoom.scale;
      newX = Math.min(newX, canvas.width - viewW);
    } else if (left < margin) {
      newX = car.posX - margin / zoom.scale;
      newX = Math.max(0, newX);
    }
  }

  if (canvas.height > viewH) {
    const top = (car.posY - newY) * zoom.scale;
    const bottom = (car.posY + car.imgHeight - newY) * zoom.scale;
    if (bottom > canvasContainer.clientHeight - margin) {
      newY =
        car.posY +
        car.imgHeight -
        (canvasContainer.clientHeight - margin) / zoom.scale;
      newY = Math.min(newY, canvas.height - viewH);
    } else if (top < margin) {
      newY = car.posY - margin / zoom.scale;
      newY = Math.max(0, newY);
    }
  }

  if (newX !== zoom.translateX || newY !== zoom.translateY) {
    zoom.translateX = newX;
    zoom.translateY = newY;
    updateTransform();
  }
}

export function setupUI(car, showHitboxes, zoom, updateTransform, resetMap, nextMap) {
  toggleHitboxesBtn.addEventListener('click', () => toggleHitboxes(showHitboxes, car));
  findCarBtn.addEventListener('click', () => centerOnCar(car, zoom, updateTransform, 500));
  if (restartBtn) restartBtn.addEventListener('click', resetMap);
  if (nextMapBtn) nextMapBtn.addEventListener('click', nextMap);
  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      const val = parseFloat(speedSlider.value);
      if (speedSliderVal) speedSliderVal.textContent = val;
      car.fixedSpeed = val > 0 ? val : null;
    });
  }
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
  slamCheckbox.addEventListener('change', () => {
    slamMode = slamCheckbox.checked;
  });
  if (controlModeSelect) {
    controlModeSelect.addEventListener('change', () => {
      controlMode = controlModeSelect.value;
      car.autopilot = controlMode === 'mouse';
    });
  }
}
