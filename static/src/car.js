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

    // Last measured sensor distances
    this.frontDistance = Infinity;
    this.leftDistance = Infinity;
    this.rightDistance = Infinity;
    this.rearDistance = Infinity;
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

  pointInHitbox(px, py) {
    const cx = this.posX + this.imgWidth / 2;
    const cy = this.posY + this.imgHeight / 2;
    const cos = Math.cos(-this.rotation);
    const sin = Math.sin(-this.rotation);
    const localX = (px - cx) * cos - (py - cy) * sin + this.imgWidth / 2;
    const localY = (px - cx) * sin + (py - cy) * cos + this.imgHeight / 2;
    const offsetX = (this.imgWidth - this.hitboxWidth) / 2;
    const offsetY = (this.imgHeight - this.hitboxHeight) / 2;
    return (
      localX >= offsetX &&
      localX <= offsetX + this.hitboxWidth &&
      localY >= offsetY &&
      localY <= offsetY + this.hitboxHeight
    );
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

  // Calculate the distance from point (fx, fy) along
  // `angle` until the ray hits the rectangle `rect`.
  // Returns Infinity if there is no intersection in
  // the ray's forward direction.
  rayRectIntersection(fx, fy, angle, rect) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let minT = Infinity;

    if (Math.abs(cos) > 1e-6) {
      let t = (rect.x - fx) / cos;
      if (t >= 0) {
        const y = fy + t * sin;
        if (y >= rect.y && y <= rect.y + rect.h) minT = Math.min(minT, t);
      }
      t = (rect.x + rect.w - fx) / cos;
      if (t >= 0) {
        const y = fy + t * sin;
        if (y >= rect.y && y <= rect.y + rect.h) minT = Math.min(minT, t);
      }
    }

    if (Math.abs(sin) > 1e-6) {
      let t = (rect.y - fy) / sin;
      if (t >= 0) {
        const x = fx + t * cos;
        if (x >= rect.x && x <= rect.x + rect.w) minT = Math.min(minT, t);
      }
      t = (rect.y + rect.h - fy) / sin;
      if (t >= 0) {
        const x = fx + t * cos;
        if (x >= rect.x && x <= rect.x + rect.w) minT = Math.min(minT, t);
      }
    }

    return minT;
  }

  // Extended intersection that also returns surface normal
  rayRectIntersectionDetail(fx, fy, angle, rect) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let minT = Infinity;
    let normal = null;

    if (Math.abs(cos) > 1e-6) {
      let t = (rect.x - fx) / cos;
      if (t >= 0) {
        const y = fy + t * sin;
        if (y >= rect.y && y <= rect.y + rect.h && t < minT) {
          minT = t;
          normal = [-1, 0];
        }
      }
      t = (rect.x + rect.w - fx) / cos;
      if (t >= 0) {
        const y = fy + t * sin;
        if (y >= rect.y && y <= rect.y + rect.h && t < minT) {
          minT = t;
          normal = [1, 0];
        }
      }
    }

    if (Math.abs(sin) > 1e-6) {
      let t = (rect.y - fy) / sin;
      if (t >= 0) {
        const x = fx + t * cos;
        if (x >= rect.x && x <= rect.x + rect.w && t < minT) {
          minT = t;
          normal = [0, -1];
        }
      }
      t = (rect.y + rect.h - fy) / sin;
      if (t >= 0) {
        const x = fx + t * cos;
        if (x >= rect.x && x <= rect.x + rect.w && t < minT) {
          minT = t;
          normal = [0, 1];
        }
      }
    }

    return { dist: minT, normal };
  }

  rayCircleIntersectionDetail(fx, fy, angle, circle) {
    const cx = circle.x + circle.radius;
    const cy = circle.y + circle.radius;
    const r = circle.radius;
    const vx = Math.cos(angle);
    const vy = Math.sin(angle);
    const ocx = fx - cx;
    const ocy = fy - cy;
    const b = 2 * (ocx * vx + ocy * vy);
    const c = ocx * ocx + ocy * ocy - r * r;
    const disc = b * b - 4 * c;
    if (disc < 0) return { dist: Infinity, normal: null };
    let t = (-b - Math.sqrt(disc)) / 2;
    if (t < 0) t = (-b + Math.sqrt(disc)) / 2;
    if (t < 0) return { dist: Infinity, normal: null };
    const ix = fx + vx * t;
    const iy = fy + vy * t;
    const normal = [(ix - cx) / r, (iy - cy) / r];
    return { dist: t, normal };
  }

  normAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }

  castRayPath(fx, fy, angle, length, depth = 0) {
    if (length <= 0 || depth > 3) return [];

    let minDist = length;
    let bestNormal = null;

    for (const o of this.objects) {
      let res;
      if (o.radius != null) {
        res = this.rayCircleIntersectionDetail(fx, fy, angle, o);
      } else {
        const rect = { x: o.x, y: o.y, w: o.size, h: o.size };
        res = this.rayRectIntersectionDetail(fx, fy, angle, rect);
      }
      if (res.dist < minDist) {
        minDist = res.dist;
        bestNormal = res.normal;
      }
    }

    const segment = { x: fx, y: fy, angle, length: minDist };

    if (!bestNormal || minDist >= length) return [segment];

    const ix = fx + Math.cos(angle) * minDist;
    const iy = fy + Math.sin(angle) * minDist;

    const nAngle = Math.atan2(bestNormal[1], bestNormal[0]);
    let tAngle1 = nAngle + Math.PI / 2;
    let tAngle2 = nAngle - Math.PI / 2;
    const diff1 = Math.abs(this.normAngle(tAngle1 - angle));
    const diff2 = Math.abs(this.normAngle(tAngle2 - angle));
    const newAngle = diff1 < diff2 ? tAngle1 : tAngle2;

    const rest = this.castRayPath(
      ix + Math.cos(newAngle) * 0.1,
      iy + Math.sin(newAngle) * 0.1,
      newAngle,
      length - minDist,
      depth + 1,
    );
    return [segment, ...rest];
  }

  drawKegel(x, y, length, angle, color, baseWidth, ctx = this.ctx) {
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
    const segments = this.castRayPath(fx, fy, finalAngle, length);
    let total = 0;
    ctx.fillStyle = color;
    for (const seg of segments) {
      const sx = seg.x;
      const sy = seg.y;
      const ex = sx + Math.cos(seg.angle) * seg.length;
      const ey = sy + Math.sin(seg.angle) * seg.length;
      const leftX = ex + (Math.cos(seg.angle + Math.PI / 2) * baseWidth) / 2;
      const leftY = ey + (Math.sin(seg.angle + Math.PI / 2) * baseWidth) / 2;
      const rightX = ex + (Math.cos(seg.angle - Math.PI / 2) * baseWidth) / 2;
      const rightY = ey + (Math.sin(seg.angle - Math.PI / 2) * baseWidth) / 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();
      ctx.fill();
      total += seg.length;
    }

    const first = segments.length ? segments[0].length : length;
    return first;
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

    // Move in the direction the car's front is facing.
    const frontRot = this.rotation + Math.PI;
    const nx = this.posX + Math.cos(frontRot) * this.velocity;
    const ny = this.posY + Math.sin(frontRot) * this.velocity;
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
