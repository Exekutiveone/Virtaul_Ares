import test from 'node:test';
import assert from 'node:assert/strict';
import { sendAction } from '../static/src/autopilot/send.js';

test('sendAction sets keys and returns promise', async () => {
  const car = {
    keys: { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false },
    steeringAngle: 0,
    setKeysFromAction(action, value) {
      for (const k in this.keys) this.keys[k] = false;
      if (action === 'forward') this.keys.ArrowUp = true;
      if (action === 'left' && typeof value === 'number') this.steeringAngle = -value;
    },
  };
  global.fetch = async () => ({ ok: true });
  const p = sendAction(car, 'left', 30);
  assert.ok(p instanceof Promise);
  await p;
  assert.equal(car.steeringAngle, -30);
});
