import { CONTROL_API_URL } from '../config.js';

export function sendAction(car, action) {
  car.setKeysFromAction(action);
  // Fire and forget but return the promise for optional awaiting
  return fetch(CONTROL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  }).catch((err) => {
    console.error('autopilot send failed', err);
  });
}
