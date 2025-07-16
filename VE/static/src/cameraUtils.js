export function centerOnCar(car, canvas, canvasContainer, CM_PER_PX, radiusCm, updateTransform) {
  const diameterPx = (radiusCm * 2) / CM_PER_PX;
  const cw = canvasContainer.clientWidth;
  const ch = canvasContainer.clientHeight;
  const zoomScale = Math.min(cw / diameterPx, ch / diameterPx);
  const viewW = cw / zoomScale;
  const viewH = ch / zoomScale;
  const carX = car.posX + car.imgWidth / 2;
  const carY = car.posY + car.imgHeight / 2;
  let translateX = carX - viewW / 2;
  let translateY = carY - viewH / 2;
  translateX = Math.max(0, Math.min(translateX, canvas.width - viewW));
  translateY = Math.max(0, Math.min(translateY, canvas.height - viewH));
  updateTransform(translateX, translateY, zoomScale, true);
  return { translateX, translateY, zoomScale };
}

export function autoFollowCar(car, canvas, canvasContainer, translateX, translateY, zoomScale, updateTransform, margin = 50) {
  const viewW = canvasContainer.clientWidth / zoomScale;
  const viewH = canvasContainer.clientHeight / zoomScale;
  let newX = translateX;
  let newY = translateY;

  if (canvas.width > viewW) {
    const left = (car.posX - newX) * zoomScale;
    const right = (car.posX + car.imgWidth - newX) * zoomScale;
    if (right > canvasContainer.clientWidth - margin) {
      newX = car.posX + car.imgWidth - (canvasContainer.clientWidth - margin) / zoomScale;
      newX = Math.min(newX, canvas.width - viewW);
    } else if (left < margin) {
      newX = car.posX - margin / zoomScale;
      newX = Math.max(0, newX);
    }
  }

  if (canvas.height > viewH) {
    const top = (car.posY - newY) * zoomScale;
    const bottom = (car.posY + car.imgHeight - newY) * zoomScale;
    if (bottom > canvasContainer.clientHeight - margin) {
      newY = car.posY + car.imgHeight - (canvasContainer.clientHeight - margin) / zoomScale;
      newY = Math.min(newY, canvas.height - viewH);
    } else if (top < margin) {
      newY = car.posY - margin / zoomScale;
      newY = Math.max(0, newY);
    }
  }

  if (newX !== translateX || newY !== translateY) {
    translateX = newX;
    translateY = newY;
    updateTransform(translateX, translateY, zoomScale);
  }
  return { translateX, translateY };
}
