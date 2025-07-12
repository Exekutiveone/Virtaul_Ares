export class Target {
  constructor(x, y, size) {
    this.x = x
    this.y = y
    this.size = size
  }

  draw(ctx) {
    ctx.fillStyle = 'green'
    ctx.fillRect(this.x, this.y, this.size, this.size)
  }

  intersectsRect(x, y, w, h) {
    return !(
      x + w < this.x ||
      x > this.x + this.size ||
      y + h < this.y ||
      y > this.y + this.size
    )
  }
}
