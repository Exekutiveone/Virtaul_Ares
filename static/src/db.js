export function getCurrentMapData(gameMap) {
  return {
    cols: gameMap.cols,
    rows: gameMap.rows,
    cellSize: gameMap.cellSize,
    obstacles: gameMap.obstacles.map((o) => ({ x: o.x, y: o.y, size: o.size })),
    target: gameMap.target
      ? {
          x: gameMap.target.x,
          y: gameMap.target.y,
          size: gameMap.target.radius,
        }
      : null,
    waypoints: gameMap.waypoints.map((w) => ({ x: w.x, y: w.y, size: w.size })),
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

// CSV helpers
import { parseCsvMap, serializeCsvMap } from './csvMap.js';
export { serializeCsvMap };

export function downloadMapCsv(gameMap, name = 'map.csv') {
  const data = serializeCsvMap(gameMap);
  const blob = new Blob([data], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
}

export function uploadCsvMap(name, csvData, creator = 'Unknown') {
  return fetch('/api/csv-maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, csv: csvData, creator }),
  });
}

export async function loadMapCsvUrl(url) {
  const res = await fetch(url);
  const text = await res.text();
  return parseCsvMap(text);
}

export function loadMapCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const gm = parseCsvMap(reader.result);
        resolve(gm);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
