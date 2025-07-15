async function loadList() {
  const res = await fetch('/api/sequences');
  const sequences = await res.json();
  const grid = document.getElementById('seqGrid');
  grid.innerHTML = '';
  for (const s of sequences) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.innerHTML = `
      <div class="name">${s.name}</div>
      <div class="meta">${new Date(s.created).toLocaleDateString()}</div>
      <div class="buttons">
        <button class="edit">Bearbeiten</button>
        <button class="rename">Umbenennen</button>
        <button class="delete">Löschen</button>
      </div>`;
    grid.appendChild(tile);
    tile.querySelector('.edit').addEventListener('click', () => {
      window.location.href = '/sequence?file=' + encodeURIComponent(s.file);
    });
    tile.querySelector('.rename').addEventListener('click', async () => {
      const newName = prompt('Neuer Name:', s.name);
      if (!newName) return;
      await fetch('/api/sequences/' + encodeURIComponent(s.file), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      loadList();
    });
    tile.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm('Diesen Ablauf wirklich löschen?')) return;
      await fetch('/api/sequences/' + encodeURIComponent(s.file), { method: 'DELETE' });
      loadList();
    });
  }
}

loadList();
