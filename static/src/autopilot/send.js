import { CONTROL_API_URL } from '../config.js';

export function sendAction(car, action, value = null) {
  car.setKeysFromAction(action, value);
  // Fire and forget but return the promise for optional awaiting
  return fetch(CONTROL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      value == null ? { action } : { action, value },
    ),
  }).catch((err) => {
    console.error('autopilot send failed', err);
  });
}
