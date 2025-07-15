import { MAPS_API_URL, CSV_MAPS_API_URL } from './config.js';

export function pushMap(gameMap, name = 'map') {
  const data = gameMap.toJSON ? gameMap.toJSON() : gameMap;
  return fetch(MAPS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, map: data }),
  });
}

export async function fetchCsvMapList() {
  const res = await fetch(CSV_MAPS_API_URL);
  if (!res.ok) throw new Error('Failed to load map list');
  return res.json();
}

export function overwriteCsvMap(file, csv) {
  return fetch(`${CSV_MAPS_API_URL}/${encodeURIComponent(file)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv }),
  });
}
