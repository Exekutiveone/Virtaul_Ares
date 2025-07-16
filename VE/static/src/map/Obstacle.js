export class Obstacle {
  constructor(x, y, size) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.blocking = true;
  }

  draw(ctx) {
    // Hintergrund des Hindernisses auf Schwarz setzen
    ctx.fillStyle = '#000';
    ctx.fillRect(this.x, this.y, this.size, this.size);

    // Hindernisfarbe zeichnen (z. B. Grau)
    ctx.fillStyle = '#888';
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }

  drawHitbox(ctx) {
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.x, this.y, this.size, this.size);
  }

  intersectsRect(x, y, w, h) {
    return !(
      x + w < this.x ||
      x > this.x + this.size ||
      y + h < this.y ||
      y > this.y + this.size
    );
  }
}
