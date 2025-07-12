export function getCurrentMapData(gameMap) {
  return {
    cols: gameMap.cols,
    rows: gameMap.rows,
    cellSize: gameMap.cellSize,
    obstacles: gameMap.obstacles.map(o => ({ x: o.x, y: o.y, size: o.size })),
    target: gameMap.target
      ? { x: gameMap.target.x, y: gameMap.target.y, size: gameMap.target.radius }
      : null
  };
}

export function getDefaultMapName() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-');
}

export function downloadMap(gameMap) {
  const data = getCurrentMapData(gameMap);
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'map.json';
  link.click();
}

export function uploadMap(name, gameMap) {
  const data = getCurrentMapData(gameMap);
  return fetch('http://127.0.0.1:5000/api/maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, map: data })
  });
}

export async function fetchAvailableMaps() {
  const res = await fetch('http://127.0.0.1:5000/api/maps');
  return res.json();
}

export async function loadMapFromDb(mapId) {
  const res = await fetch(`http://127.0.0.1:5000/api/maps/${mapId}`);
  return res.json();
}

export function renameMap(mapId, newName) {
  return fetch(`http://127.0.0.1:5000/api/maps/${mapId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName })
  });
}

export function deleteMap(mapId) {
  return fetch(`http://127.0.0.1:5000/api/maps/${mapId}`, { method: 'DELETE' });
}

export function loadMapFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        resolve(obj);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
