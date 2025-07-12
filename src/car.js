export class Car {
  constructor(
    ctx,
    image,
    scale,
    margin,
    objects,
    { startX = 200, startY = 200 } = {},
  ) {
    this.ctx = ctx;
    this.bg = image;
    this.scale = scale;
    this.margin = margin;
    this.objects = objects;

    this.imgWidth = 150 * scale;
    this.imgHeight = 80 * scale;

    this.posX = startX;
    this.posY = startY;
    this.velocity = 0;
    this.acceleration = 0;
    this.rotation = 0;
    this.angularVelocity = 0;
    this.angularAcceleration = 0;

    this.maxSpeed = 5;
    this.accelRate = 0.2;
    this.decelRate = 0.05;
    this.rotAccelRate = 0.0005;
    this.rotDecelRate = 0.003;

    this.maxRpm = 5000;
    this.speed = 0;
    this.rpm = 0;
    this.gyro = 0;

    this.autopilot = false;
    this.keys = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
    };

    window.addEventListener('keydown', (e) => {
      if (!this.autopilot && e.key in this.keys) this.keys[e.key] = true;
    });
    window.addEventListener('keyup', (e) => {
      if (!this.autopilot && e.key in this.keys) this.keys[e.key] = false;
    });

    this.actionMap = {
      forward: 'ArrowUp',
      up: 'ArrowUp',
      backward: 'ArrowDown',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
      stop: null,
    };
  }

  setKeysFromAction(action) {
    for (const k of Object.keys(this.keys)) this.keys[k] = false;
    const key = this.actionMap[action];
    if (key) this.keys[key] = true;
  }

  drawBorder(canvasWidth, canvasHeight) {
    const m = this.margin;
    this.ctx.fillStyle = '#aaa';
    this.ctx.fillRect(0, 0, canvasWidth, m);
    this.ctx.fillRect(0, canvasHeight - m, canvasWidth, m);
    this.ctx.fillRect(0, 0, m, canvasHeight);
    this.ctx.fillRect(canvasWidth - m, 0, m, canvasHeight);
  }

  getRotatedCorners(x, y, rotation = this.rotation) {
    const cx = x + this.imgWidth / 2;
    const cy = y + this.imgHeight / 2;
    const w = this.imgWidth;
    const h = this.imgHeight;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ].map(([px, py]) => {
      const dx = px - cx;
      const dy = py - cy;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      return [cx + rx, cy + ry];
    });
  }

  getBoundingBox(x, y, rotation = this.rotation) {
    const corners = this.getRotatedCorners(x, y, rotation);
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: minX,
      y: minY,
      w: Math.max(...xs) - minX,
      h: Math.max(...ys) - minY,
    };
  }

  drawHitbox() {
    const corners = this.getRotatedCorners(this.posX, this.posY);
    this.ctx.strokeStyle = 'red';
    this.ctx.beginPath();
    this.ctx.moveTo(corners[0][0], corners[0][1]);
    for (const [x, y] of corners.slice(1)) this.ctx.lineTo(x, y);
    this.ctx.closePath();
    this.ctx.stroke();
  }

  drawKegel(x, y, length, angle, color, baseWidth) {
    x *= this.scale;
    y *= this.scale;
    baseWidth *= this.scale;
    length *= this.scale;

    const cx = this.posX + this.imgWidth / 2;
    const cy = this.posY + this.imgHeight / 2;
    const dx = x - this.imgWidth / 2;
    const dy = y - this.imgHeight / 2;
    const rx = dx * Math.cos(this.rotation) - dy * Math.sin(this.rotation);
    const ry = dx * Math.sin(this.rotation) + dy * Math.cos(this.rotation);

    const fx = cx + rx;
    const fy = cy + ry;
    const finalAngle = angle + this.rotation;
    let maxLen = length;

    for (const o of this.objects) {
      const vx = Math.cos(finalAngle);
      const vy = Math.sin(finalAngle);
      const dxo = o.x - fx;
      const dyo = o.y - fy;
      const proj = dxo * vx + dyo * vy;
      if (proj > 0 && proj < maxLen) {
        const closestX = fx + vx * proj;
        const closestY = fy + vy * proj;
        const distSq = (o.x - closestX) ** 2 + (o.y - closestY) ** 2;
        const r = o.radius != null ? o.radius : o.size / 2;
        if (distSq <= r * r) {
          const offset = Math.sqrt(r * r - distSq);
          maxLen = proj - offset;
        }
      }
    }

    const tipX = fx;
    const tipY = fy;
    const baseX = tipX + Math.cos(finalAngle) * maxLen;
    const baseY = tipY + Math.sin(finalAngle) * maxLen;
    const leftX = baseX + (Math.cos(finalAngle + Math.PI / 2) * baseWidth) / 2;
    const leftY = baseY + (Math.sin(finalAngle + Math.PI / 2) * baseWidth) / 2;
    const rightX = baseX + (Math.cos(finalAngle - Math.PI / 2) * baseWidth) / 2;
    const rightY = baseY + (Math.sin(finalAngle - Math.PI / 2) * baseWidth) / 2;

    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(tipX, tipY);
    this.ctx.lineTo(leftX, leftY);
    this.ctx.lineTo(rightX, rightY);
    this.ctx.closePath();
    this.ctx.fill();

    return maxLen;
  }

  draw(canvasWidth, canvasHeight) {
    this.drawBorder(canvasWidth, canvasHeight);

    this.ctx.save();
    this.ctx.translate(
      this.posX + this.imgWidth / 2,
      this.posY + this.imgHeight / 2,
    );
    this.ctx.rotate(this.rotation);
    this.ctx.translate(-this.imgWidth / 2, -this.imgHeight / 2);
    this.ctx.drawImage(this.bg, 0, 0, this.imgWidth, this.imgHeight);
    this.ctx.restore();

    this.drawHitbox();

    for (const o of this.objects) {
      if (typeof o.draw === 'function') {
        o.draw(this.ctx);
      }
    }

    this.redConeLength = this.drawKegel(18, 40, 700, Math.PI, 'red', 6);
    this.greenConeLength = this.drawKegel(45, 40, 400, Math.PI, 'green', 140);
    const bluePoints = [
      [65, 7],
      [72, 7],
      [91, 7],
      [97, 7],
    ];
    this.blueConeLength = this.drawKegel(
      bluePoints[0][0],
      bluePoints[0][1],
      150,
      -Math.PI / 2,
      'blue',
      8,
    );
    for (const a of bluePoints.slice(1))
      this.drawKegel(a[0], a[1], 150, -Math.PI / 2, 'blue', 8);
    const bluePoints2 = [
      [64, 74],
      [71, 74],
      [90, 74],
      [97, 74],
    ];
    for (const a of bluePoints2)
      this.drawKegel(a[0], a[1], 150, Math.PI / 2, 'blue', 8);
    this.drawKegel(143, 37, 150, 0, 'blue', 8);
    this.drawKegel(143, 43, 150, 0, 'blue', 8);
  }

  update(canvasWidth, canvasHeight) {
    if (this.keys.ArrowUp) this.acceleration = this.accelRate;
    else if (this.keys.ArrowDown) this.acceleration = -this.accelRate;
    else
      this.acceleration =
        this.velocity > 0
          ? -this.decelRate
          : this.velocity < 0
            ? this.decelRate
            : 0;

    if (this.keys.ArrowLeft) this.angularAcceleration = -this.rotAccelRate;
    else if (this.keys.ArrowRight) this.angularAcceleration = this.rotAccelRate;
    else
      this.angularAcceleration =
        this.angularVelocity > 0
          ? -this.rotDecelRate
          : this.angularVelocity < 0
            ? this.rotDecelRate
            : 0;

    this.velocity += this.acceleration;
    this.angularVelocity += this.angularAcceleration;
    this.velocity = Math.max(
      -this.maxSpeed,
      Math.min(this.maxSpeed, this.velocity),
    );
    this.angularVelocity = Math.max(
      -0.03,
      Math.min(0.03, this.angularVelocity),
    );

    if (
      Math.abs(this.velocity) < 0.01 &&
      !this.keys.ArrowUp &&
      !this.keys.ArrowDown
    )
      this.velocity = 0;
    if (
      Math.abs(this.angularVelocity) < 0.001 &&
      !this.keys.ArrowLeft &&
      !this.keys.ArrowRight
    )
      this.angularVelocity = 0;

    const nx = this.posX + Math.cos(this.rotation) * this.velocity;
    const ny = this.posY + Math.sin(this.rotation) * this.velocity;
    const newRotation = this.rotation + this.angularVelocity;
    const bbox = this.getBoundingBox(nx, ny, newRotation);

    const inBounds =
      nx >= this.margin &&
      ny >= this.margin &&
      nx + this.imgWidth <= canvasWidth - this.margin &&
      ny + this.imgHeight <= canvasHeight - this.margin;

    if (inBounds) {
      const hit = this.objects.some((obs) =>
        obs.intersectsRect(bbox.x, bbox.y, bbox.w, bbox.h),
      );
      if (!hit) {
        this.posX = nx;
        this.posY = ny;
        this.rotation = newRotation;
      } else {
        this.velocity =
          this.acceleration =
          this.angularVelocity =
          this.angularAcceleration =
            0;
      }
    } else {
      this.velocity =
        this.acceleration =
        this.angularVelocity =
        this.angularAcceleration =
          0;
    }

    this.speed = Math.abs(this.velocity * 60);
    this.rpm = Math.abs((this.velocity / this.maxSpeed) * this.maxRpm);
    this.gyro = ((((this.rotation * 180) / Math.PI) % 360) + 360) % 360;

    this.draw(canvasWidth, canvasHeight);
  }
}
