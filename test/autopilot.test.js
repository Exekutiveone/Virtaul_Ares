import test from 'node:test';
import assert from 'node:assert/strict';
import { sendAction } from '../static/src/autopilot/send.js';

test('sendAction sets keys and returns promise', async () => {
  const car = {
    keys: { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false },
    setKeysFromAction(action) {
      for (const k in this.keys) this.keys[k] = false;
      if (action === 'forward') this.keys.ArrowUp = true;
    },
  };
  global.fetch = async () => ({ ok: true });
  const p = sendAction(car, 'forward');
  assert.ok(p instanceof Promise);
  await p;
  assert.equal(car.keys.ArrowUp, true);
});
