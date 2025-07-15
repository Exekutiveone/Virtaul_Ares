import { createCar, carImage } from '../car/setup.js';
import { loadSequences, runSequence } from '../sequences/runner.js';
import { pollControl } from '../api/telemetry.js';

export function setupK(ctx, obstacles, cmPerPx, opts) {
  const {
    controlModeRef,
    keyMap,
    sequenceSelect,
    runSequenceBtn,
    refreshCarObjects,
    resizeCanvas,
    updateObstacleOptions,
    controlPollInterval,
    loop,
  } = opts;

  const car = createCar(ctx, obstacles, cmPerPx);

  function updateMouseFollow(mouseTarget) {
    if (!mouseTarget) return;
    if (car.pointInHitbox(mouseTarget.x, mouseTarget.y)) {
      for (const k of Object.keys(car.keys)) car.keys[k] = false;
      car.velocity = 0;
      car.angularVelocity = 0;
      car.acceleration = 0;
      car.angularAcceleration = 0;
      return;
    }
    const cx = car.posX + car.imgWidth / 2;
    const cy = car.posY + car.imgHeight / 2;
    const angle = Math.atan2(mouseTarget.y - cy, mouseTarget.x - cx);
    let diff = angle - (car.rotation + Math.PI);
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    for (const k of Object.keys(car.keys)) car.keys[k] = false;
    const dist = Math.hypot(mouseTarget.x - cx, mouseTarget.y - cy);
    if (Math.abs(diff) > 0.1) {
      car.keys[diff > 0 ? 'ArrowRight' : 'ArrowLeft'] = true;
    } else if (dist > 10) {
      car.keys.ArrowUp = true;
    } else {
      car.velocity = 0;
      car.angularVelocity = 0;
      car.acceleration = 0;
      car.angularAcceleration = 0;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (controlModeRef.value !== 'wasd') return;
    const k = keyMap[e.key.toLowerCase()];
    if (k) {
      e.preventDefault();
      car.keys[k] = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (controlModeRef.value !== 'wasd') return;
    const k = keyMap[e.key.toLowerCase()];
    if (k) {
      e.preventDefault();
      car.keys[k] = false;
    }
  });

  carImage.onload = () => {
    resizeCanvas();
    updateObstacleOptions();
    loadSequences(sequenceSelect);
    if (runSequenceBtn)
      runSequenceBtn.addEventListener('click', () => {
        const opt = sequenceSelect.options[sequenceSelect.selectedIndex];
        if (opt) runSequence(car, opt.value, opt.dataset.format);
      });
    setInterval(() => pollControl(car), controlPollInterval);
    pollControl(car);
    loop();
  };

  car.autopilot = controlModeRef.value === 'mouse';
  refreshCarObjects();

  return { car, updateMouseFollow };
}
