export let score = 0;
export const scoreEl = document.getElementById('score');

export function updateScoreBoard() {
  if (scoreEl) scoreEl.textContent = score;
}

export let mapList = [];
export let currentMapIndex = -1;

const cellCmInput = document.getElementById('gridCellCm');
const widthCmInput = document.getElementById('gridWidth');
const heightCmInput = document.getElementById('gridHeight');
const params = new URLSearchParams(window.location.search);
const csvMapUrl = params.get('map');
export const editorMode = params.has('editor');

export async function initMapList() {
  try {
    const res = await fetch('/api/csv-maps');
    if (!res.ok) return;
    mapList = await res.json();
    if (csvMapUrl) {
      const file = csvMapUrl.startsWith('/static/maps/')
        ? decodeURIComponent(csvMapUrl.substring('/static/maps/'.length))
        : csvMapUrl;
      currentMapIndex = mapList.findIndex((m) => m.file === file);
    }
    if (currentMapIndex === -1 && mapList.length) currentMapIndex = 0;
  } catch (err) {
    console.error('initMapList failed', err);
  }
}
