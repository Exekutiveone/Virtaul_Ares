export class Car {
  constructor(
    ctx,
    image,
    scale,
    margin,
    objects,
    {
      startX = 200,
      startY = 200,
      hitboxWidth = null,
      hitboxHeight = null,
    } = {},
  ) {
    this.ctx = ctx;
    this.bg = image;
    this.scale = scale;
    this.margin = margin;
    this.objects = objects;

    this.showHitbox = false;

    this.imgWidth = 150 * scale;
    this.imgHeight = 80 * scale;

    this.hitboxWidth =
      hitboxWidth != null ? hitboxWidth : this.imgWidth;
    this.hitboxHeight =
      hitboxHeight != null ? hitboxHeight : this.imgHeight;

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
    this.frontDist = 0;
    this.leftDist = 0;
    this.rightDist = 0;
    this.backDist = 0;
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
    const w = this.hitboxWidth;
    const h = this.hitboxHeight;
    const offsetX = (this.imgWidth - w) / 2;
    const offsetY = (this.imgHeight - h) / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const corners = [
      [x + offsetX, y + offsetY],
      [x + offsetX + w, y + offsetY],
      [x + offsetX + w, y + offsetY + h],
      [x + offsetX, y + offsetY + h],
    ].map(([px, py]) => {
      const dx = px - cx;
      const dy = py - cy;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      return [cx + rx, cy + ry];
    });
    return corners;
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

  castRay(sx, sy, angle, maxLen) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = maxLen;
    for (const o of this.objects) {
      const res = this.rayRectIntersection(
        sx,
        sy,
        dx,
        dy,
        o.x,
        o.y,
        o.size,
        o.size,
      );
      if (!res) continue;
      const { t, normal } = res;
      if (t < 0 || t > best) continue;
      const nAngle = Math.atan2(normal[1], normal[0]);
      const strength = Math.abs(Math.cos(angle - nAngle));
      if (t <= maxLen * strength) best = t;
    }
    return best;
  }

  rayRectIntersection(sx, sy, dx, dy, rx, ry, rw, rh) {
    let tmin = -Infinity;
    let tmax = Infinity;
    if (dx !== 0) {
      const tx1 = (rx - sx) / dx;
      const tx2 = (rx + rw - sx) / dx;
      tmin = Math.max(tmin, Math.min(tx1, tx2));
      tmax = Math.min(tmax, Math.max(tx1, tx2));
    } else if (sx < rx || sx > rx + rw) return null;

    if (dy !== 0) {
      const ty1 = (ry - sy) / dy;
      const ty2 = (ry + rh - sy) / dy;
      tmin = Math.max(tmin, Math.min(ty1, ty2));
      tmax = Math.min(tmax, Math.max(ty1, ty2));
    } else if (sy < ry || sy > ry + rh) return null;

    if (tmax < 0 || tmin > tmax) return null;
    const t = tmin >= 0 ? tmin : tmax;
    if (t < 0) return null;
    const hx = sx + dx * t;
    const hy = sy + dy * t;
    const eps = 1e-3;
    let normal = [0, 0];
    if (Math.abs(hx - rx) < eps) normal = [-1, 0];
    else if (Math.abs(hx - (rx + rw)) < eps) normal = [1, 0];
    else if (Math.abs(hy - ry) < eps) normal = [0, -1];
    else if (Math.abs(hy - (ry + rh)) < eps) normal = [0, 1];
    return { t, normal };
  }

  drawConeWorld(sx, sy, angle, length, color, baseWidth) {
    const dist = this.castRay(sx, sy, angle, length);
    const baseX = sx + Math.cos(angle) * dist;
    const baseY = sy + Math.sin(angle) * dist;
    const leftX =
      baseX + (Math.cos(angle + Math.PI / 2) * baseWidth) / 2;
    const leftY =
      baseY + (Math.sin(angle + Math.PI / 2) * baseWidth) / 2;
    const rightX =
      baseX + (Math.cos(angle - Math.PI / 2) * baseWidth) / 2;
    const rightY =
      baseY + (Math.sin(angle - Math.PI / 2) * baseWidth) / 2;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(sx, sy);
    this.ctx.lineTo(leftX, leftY);
    this.ctx.lineTo(rightX, rightY);
    this.ctx.closePath();
    this.ctx.fill();
    return dist;
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

    if (this.showHitbox) this.drawHitbox();

    for (const o of this.objects) {
      if (typeof o.draw === 'function') {
        o.draw(this.ctx);
      }
    }

    const cx = this.posX + this.imgWidth / 2;
    const cy = this.posY + this.imgHeight / 2;
    const halfW = this.hitboxWidth / 2;
    const halfH = this.hitboxHeight / 2;
    const frontX = cx + Math.cos(this.rotation) * halfW;
    const frontY = cy + Math.sin(this.rotation) * halfW;
    const backX = cx - Math.cos(this.rotation) * halfW;
    const backY = cy - Math.sin(this.rotation) * halfW;
    const leftX = cx - Math.sin(this.rotation) * halfH;
    const leftY = cy + Math.cos(this.rotation) * halfH;
    const rightX = cx + Math.sin(this.rotation) * halfH;
    const rightY = cy - Math.cos(this.rotation) * halfH;
    const frontLen = 700 * this.scale;
    const sideLen = 150 * this.scale;
    const frontWidth = 6 * this.scale;
    const sideWidth = 8 * this.scale;
    this.frontDist = this.drawConeWorld(
      frontX,
      frontY,
      this.rotation,
      frontLen,
      'red',
      frontWidth,
    );
    this.leftDist = this.drawConeWorld(
      leftX,
      leftY,
      this.rotation - Math.PI / 2,
      sideLen,
      'blue',
      sideWidth,
    );
    this.rightDist = this.drawConeWorld(
      rightX,
      rightY,
      this.rotation + Math.PI / 2,
      sideLen,
      'blue',
      sideWidth,
    );
    this.backDist = this.drawConeWorld(
      backX,
      backY,
      this.rotation + Math.PI,
      sideLen,
      'blue',
      sideWidth,
    );
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
      bbox.x >= this.margin &&
      bbox.y >= this.margin &&
      bbox.x + bbox.w <= canvasWidth - this.margin &&
      bbox.y + bbox.h <= canvasHeight - this.margin;

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
