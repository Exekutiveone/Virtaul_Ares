import test from 'node:test';
import assert from 'node:assert/strict';
import { Car } from '../static/src/car/car.js';

global.window = { addEventListener() {} };

test('angleOverride prevents auto-centering', () => {
  const car = new Car({}, {}, 1, 10, []);
  car.draw = () => {};
  car.setKeysFromAction('right', 30);
  const angle = car.steeringAngle;
  car.update(800, 600);
  assert.equal(car.angleOverride, true);
  assert.equal(car.steeringAngle, angle);
  car.setKeysFromAction('left');
  assert.equal(car.angleOverride, false);
});

test('straight command resets angleOverride', () => {
  const car = new Car({}, {}, 1, 10, []);
  car.draw = () => {};
  car.setKeysFromAction('left', 15);
  assert.equal(car.angleOverride, true);
  car.setKeysFromAction('straight');
  assert.equal(car.angleOverride, false);
  assert.equal(car.steeringAngle, 0);
});

test('pressing left or right moves forward', () => {
  const car = new Car({}, {}, 1, 10, []);
  car.draw = () => {};
  car.keys.ArrowLeft = true;
  car.update(800, 600);
  assert.equal(car.velocity, car.accelRate);
});
