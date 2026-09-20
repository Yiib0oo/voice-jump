export const STEP = 1 / 120;
export const WORLD_HEIGHT = 560;
export const GROUND_Y = 480;
export const PLAYER = { x: 90, width: 60, height: 68 };
export const HOLD_SECONDS = 0.25;
export const RESET_SECONDS = 0.18;
export const START_SPEED = 390;
export const MAX_SPEED = 660;
const ACCELERATION_SECONDS = 70;
export type JumpBody = { y: number; velocityY: number; age: number; active: boolean; released: boolean };
export type Rect = { x: number; y: number; width: number; height: number };

export function createBody(): JumpBody {
  return { y: GROUND_Y - PLAYER.height, velocityY: 0, age: 0, active: false, released: false };
}
export function beginJump(body: JumpBody): boolean {
  if (body.active) return false;
  body.active = true;
  body.velocityY = -720;
  body.age = 0;
  body.released = false;
  return true;
}
export function stepBody(body: JumpBody, held: boolean): void {
  if (!body.active) return;
  if (!held) body.released = true;
  const boost = !body.released && body.age < HOLD_SECONDS;
  const gravity = body.velocityY >= 0 ? 5400 : boost ? 500 : 2400;
  body.velocityY += gravity * STEP;
  body.y += body.velocityY * STEP;
  body.age += STEP;
  if (body.y >= GROUND_Y - PLAYER.height) {
    body.y = GROUND_Y - PLAYER.height;
    body.velocityY = 0;
    body.active = false;
  }
}
export function intersects(a: Rect, b: Rect): boolean {
  const padding = 5;
  return a.x + padding < b.x + b.width && a.x + a.width - padding > b.x &&
    a.y + padding < b.y + b.height && a.y + a.height - padding > b.y;
}
// 画面、生成器和验证器共用这一加速轨迹及其积分。
export function speedAt(seconds: number): number {
  return START_SPEED + (MAX_SPEED - START_SPEED) * (1 - Math.exp(-seconds / ACCELERATION_SECONDS));
}
export function distanceAt(seconds: number): number {
  return MAX_SPEED * seconds - (MAX_SPEED - START_SPEED) * ACCELERATION_SECONDS *
    (1 - Math.exp(-seconds / ACCELERATION_SECONDS));
}
export function flightDuration(held: boolean): number {
  const body = createBody();
  beginJump(body);
  while (body.active) stepBody(body, held);
  return body.age;
}
