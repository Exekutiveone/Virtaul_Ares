import test from 'node:test';
import assert from 'node:assert/strict';
import { aStar } from '../src/autopilot/pathfinder.js';
import { sendAction } from '../src/autopilot/send.js';
import { GameMap } from '../src/map.js';
import { Obstacle } from '../src/Obstacle.js';

test('aStar finds direct path', () => {
  const gm = new GameMap(3, 1, 40);
  const path = aStar({ x: 0, y: 0 }, { x: 2, y: 0 }, gm);
  assert.equal(path.length, 3);
  assert.deepEqual(path[0], { x: 0, y: 0 });
  assert.deepEqual(path[2], { x: 2, y: 0 });
});

test('aStar avoids obstacles', () => {
  const gm = new GameMap(3, 3, 40);
  gm.obstacles.push(new Obstacle(40, 0, 40));
  const path = aStar({ x: 0, y: 0 }, { x: 2, y: 0 }, gm);
  assert.deepEqual(path[0], { x: 0, y: 0 });
  assert.deepEqual(path[path.length - 1], { x: 2, y: 0 });
  assert.equal(path.length, 5);
});

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
