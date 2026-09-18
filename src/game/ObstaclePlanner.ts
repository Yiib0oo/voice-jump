import { STEP, GROUND_Y, PLAYER, RESET_SECONDS, START_SPEED, MAX_SPEED, beginJump, createBody, distanceAt,
  flightDuration, intersects, speedAt, stepBody } from "./physics.ts";
export type Window = { start: number; end: number };
export type PlannedObstacle = {
  arrival: number; width: number; height: number; passed: boolean;
  shortWindow: Window; longWindow: Window;
};
export function obstacleX(obstacle: Pick<PlannedObstacle, "arrival" | "width">, time: number): number {
  return PLAYER.x + PLAYER.width / 2 - obstacle.width / 2 +
    distanceAt(obstacle.arrival) - distanceAt(time);
}
// 使用真实物理检测整个跳跃和落地过程。
export function canClear(obstacle: Pick<PlannedObstacle, "arrival" | "width" | "height">,
  start: number, held: boolean): boolean {
  const body = createBody();
  beginJump(body);
  for (let time = start; time < obstacle.arrival + 0.65; time += STEP) {
    stepBody(body, held);
    const x = obstacleX(obstacle, time + STEP);
    if (intersects({ ...PLAYER, y: body.y }, { x, y: GROUND_Y - obstacle.height,
      width: obstacle.width, height: obstacle.height })) return false;
  }
  return true;
}
function findWindow(obstacle: PlannedObstacle, held: boolean): Window | null {
  let run: Window | null = null;
  let best: Window | null = null;
  for (let lead = 0.7; lead >= 0.08; lead -= STEP) {
    const start = obstacle.arrival - lead;
    if (canClear(obstacle, start, held)) {
      if (!run) run = { start, end: start };
      run.end = start;
      if (!best || run.end - run.start > best.end - best.start) best = { ...run };
    } else run = null;
  }
  // 留出帧相位差的边缘余量。
  return best && best.end - best.start > 0.04
    ? { start: best.start + STEP * 2, end: best.end - STEP * 2 } : null;
}
export class ObstaclePlanner {
  private previousArrival = 0;
  private readyAt = 0;
  private readonly shortFlight = flightDuration(false);
  private readonly longFlight = flightDuration(true);
  private readonly random: () => number;
  constructor(random: () => number = Math.random) { this.random = random; }

  next(): PlannedObstacle {
    const difficulty = (speedAt(this.previousArrival) - START_SPEED) / (MAX_SPEED - START_SPEED);
    let arrival = this.previousArrival === 0 ? 3.1 :
      this.previousArrival + 1.65 - difficulty * 0.48 + this.random() * 0.3;
    const minimumWindow = 0.18 - difficulty * 0.06;
    for (let attempt = 0; attempt < 24; attempt++) {
      const fallback = attempt >= 12;
      const obstacle: PlannedObstacle = {
        arrival, width: fallback ? 24 : 24 + this.random() * (12 + difficulty * 10),
        height: fallback ? 32 : 32 + this.random() * (18 + difficulty * 20), passed: false,
        shortWindow: { start: 0, end: 0 }, longWindow: { start: 0, end: 0 },
      };
      const short = findWindow(obstacle, false);
      const long = findWindow(obstacle, true);
      if (!short || !long || short.end - short.start < minimumWindow ||
        long.end - long.start < minimumWindow) continue;
      const earliest = Math.min(short.start, long.start);
      if (earliest < this.readyAt) {
        arrival += this.readyAt - earliest + STEP * 3;
        continue;
      }
      obstacle.shortWindow = short;
      obstacle.longWindow = long;
      this.readyAt = Math.max(short.end + this.shortFlight, long.end + this.longFlight) + RESET_SECONDS;
      this.previousArrival = arrival;
      return obstacle;
    }
    throw new Error("无法生成具有足够起跳窗口的障碍");
  }
}
