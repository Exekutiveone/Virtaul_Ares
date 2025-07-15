import test from 'node:test';
import assert from 'node:assert/strict';
import { sendAction } from '../static/src/autopilot/send.js';

test('sendAction sets keys and posts action/value', async () => {
  const car = {
    keys: { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false },
    steeringAngle: 0,
    setKeysFromAction(action, value) {
      for (const k in this.keys) this.keys[k] = false;
      if (action === 'forward') this.keys.ArrowUp = true;
      if (action === 'left' && typeof value === 'number') this.steeringAngle = -value;
    },
  };
  let called = null;
  global.fetch = async (url, opts) => {
    called = { url, opts };
    return { ok: true };
  };
  const p = sendAction(car, 'left', 30);
  assert.ok(p instanceof Promise);
  await p;
  assert.ok(called);
  const body = JSON.parse(called.opts.body);
  assert.equal(body.action, 'left');
  assert.equal(body.value, 30);
  assert.equal(car.steeringAngle, -30);
});
