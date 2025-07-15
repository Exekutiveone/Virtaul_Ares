import { Car } from './car.js';

export const HOTBOX_WIDTH_CM = 40;
export const HOTBOX_HEIGHT_CM = 20;

export const carImage = new Image();
carImage.src = '/static/extracted_foreground.png';

export function createCar(ctx, obstacles, cmPerPx) {
  return new Car(ctx, carImage, 0.5, 0, obstacles, {
    startX: 100,
    startY: 100,
    hitboxWidth: HOTBOX_WIDTH_CM / cmPerPx,
    hitboxHeight: HOTBOX_HEIGHT_CM / cmPerPx,
  });
}
