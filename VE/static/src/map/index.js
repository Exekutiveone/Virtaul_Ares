import { parseCsvMap } from './csvMap.js';

async function loadList() {
  const res = await fetch('/api/csv-maps');
  const maps = await res.json();
  const grid = document.getElementById('mapGrid');
  grid.innerHTML = '';
  for (const m of maps) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.innerHTML = `
      <canvas width="160" height="120"></canvas>
      <div class="name">${m.name}</div>
      <div class="meta">${new Date(m.created).toLocaleDateString()} - ${m.creator}</div>
      <div class="buttons">
        <button class="play">Spielen</button>
        <button class="edit">Bearbeiten</button>
        <button class="rename">Umbenennen</button>
        <button class="delete">Löschen</button>
      </div>`;
    grid.appendChild(tile);
    const canvas = tile.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const mapRes = await fetch('/static/maps/' + m.file);
    const text = await mapRes.text();
    const gm = parseCsvMap(text);
    gm.drawGrid(ctx);
    gm.obstacles.forEach((o) => o.draw(ctx));
    if (gm.target) gm.target.draw(ctx);
    tile.querySelector('.play').addEventListener('click', () => {
      window.location.href =
        '/map2?map=/static/maps/' + encodeURIComponent(m.file);
    });
    tile.querySelector('.edit').addEventListener('click', () => {
      window.location.href =
        '/map2?map=/static/maps/' + encodeURIComponent(m.file) + '&editor=1';
    });
    tile.querySelector('.rename').addEventListener('click', async () => {
      const newName = prompt('Neuer Name:', m.name);
      if (!newName) return;
      await fetch('/api/csv-maps/' + encodeURIComponent(m.file), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      loadList();
    });
    tile.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm('Diese Karte wirklich löschen?')) return;
      await fetch('/api/csv-maps/' + encodeURIComponent(m.file), {
        method: 'DELETE',
      });
      loadList();
    });
  }
}

loadList();
