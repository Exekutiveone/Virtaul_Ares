// maps/management.js

export async function ensureMapList(mapList, mapListReady) {
  if (!mapList.length) {
    try {
      await mapListReady;
    } catch (err) {
      console.error('ensureMapList failed', err);
    }
  }
}

export function setupControlModeSelect(controlModeSelect, car, controlModeVar) {
  if (controlModeSelect) {
    controlModeSelect.addEventListener('change', () => {
      controlModeVar.value = controlModeSelect.value;
      car.autopilot = controlModeVar.value === 'mouse';
    });
  }
}

export function setupSlamCheckbox(
  slamCheckbox, slamCanvas, canvas, slamCtx, 
  prevCarRectVar, slamHits, revealCar, 
  coverageIntervalVar, updateSlamCoverage, 
  coverageScoreVar, updateScoreBoard, slamCoverageEl
) {
  if (slamCheckbox) {
    slamCheckbox.addEventListener('change', () => {
      const slamMode = slamCheckbox.checked;
      if (slamMode) {
        slamCanvas.width = canvas.width;
        slamCanvas.height = canvas.height;
        slamCanvas.style.display = 'block';
        slamCtx.fillStyle = 'rgba(128,128,128,0.5)';
        slamCtx.fillRect(0, 0, slamCanvas.width, slamCanvas.height);
        prevCarRectVar.value = null;
        slamHits.length = 0;
        revealCar();
        if (coverageIntervalVar.value) clearInterval(coverageIntervalVar.value);
        coverageIntervalVar.value = setInterval(updateSlamCoverage, 1000);
        coverageScoreVar.value = 0;
        updateScoreBoard();
        updateSlamCoverage();
      } else {
        slamCanvas.style.display = 'none';
        slamCtx.clearRect(0, 0, slamCanvas.width, slamCanvas.height);
        prevCarRectVar.value = null;
        slamHits.length = 0;
        if (coverageIntervalVar.value) clearInterval(coverageIntervalVar.value);
        if (slamCoverageEl) slamCoverageEl.textContent = '0%';
        coverageScoreVar.value = 0;
        updateScoreBoard();
      }
    });
  }
}
