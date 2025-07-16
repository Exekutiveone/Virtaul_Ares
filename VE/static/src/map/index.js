import { parseCsvMap } from './csvMap.js';

let dragged = null;

function makeTile(m, grid) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.draggable = true;
  tile.dataset.file = m.file;
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
  const canvas = tile.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  fetch('/static/maps/' + m.file)
    .then((r) => r.text())
    .then((text) => {
      const gm = parseCsvMap(text);
      gm.drawGrid(ctx);
      gm.obstacles.forEach((o) => o.draw(ctx));
      if (gm.target) gm.target.draw(ctx);
    });
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

  tile.addEventListener('dragstart', () => {
    dragged = tile;
  });
  tile.addEventListener('dragend', () => {
    dragged = null;
  });
  tile.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  tile.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!dragged || dragged === tile) return;
    const rect = tile.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    grid.insertBefore(dragged, after ? tile.nextSibling : tile);
    updateOrder(grid);
  });
  return tile;
}

function updateOrder(grid) {
  const order = Array.from(grid.children)
    .filter((t) => t.dataset.file)
    .map((t) => t.dataset.file);
  fetch('/api/csv-maps/order', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order }),
  }).catch((err) => console.error('reorder failed', err));
}

async function loadList() {
  const res = await fetch('/api/csv-maps');
  const maps = await res.json();
  const grid = document.getElementById('mapGrid');
  grid.innerHTML = '';
  for (const m of maps) {
    const tile = makeTile(m, grid);
    grid.appendChild(tile);
  }
  const add = document.createElement('div');
  add.className = 'tile add-tile';
  add.innerHTML = '<div class="plus">+</div><div>Neue Karte</div>';
  add.addEventListener('click', () => {
    window.location.href = '/map2?editor=1';
  });
  grid.appendChild(add);
}

loadList();
