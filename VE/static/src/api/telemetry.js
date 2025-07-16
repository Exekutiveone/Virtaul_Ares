import { CONTROL_API_URL, TELEMETRY_API_URL } from './config.js';

export async function pollControl(car) {
  try {
    const res = await fetch(CONTROL_API_URL);
    if (!res.ok) return;
    const data = await res.json();
    if (data.action) car.setKeysFromAction(data.action, data.value);
  } catch (err) {
    console.error('pollControl failed', err);
  }
}

export function sendTelemetry(car, front, rear, left, right) {
  fetch(TELEMETRY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      speed: car.speed,
      rpm: car.rpm,
      gyro: car.gyro,
      pos_x: car.posX,
      pos_y: car.posY,
      distances: { front, rear, left, right },
      battery: car.battery,
    }),
  }).catch((err) => console.error('sendTelemetry failed', err));
}
