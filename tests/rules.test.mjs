import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEP, PLAYER, GROUND_Y, RESET_SECONDS, beginJump, createBody, flightDuration,
  intersects, speedAt, stepBody } from '../src/game/physics.ts';
import { ObstaclePlanner, obstacleX, canClear } from '../src/game/ObstaclePlanner.ts';
import { VoiceJumpDetector } from '../src/input/VoiceJumpDetector.ts';

function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('短跳更快落地，长跳有上限，松开后不能在空中重新蓄力', () => {
  assert.ok(flightDuration(false) >= 0.46 && flightDuration(false) <= 0.51);
  assert.ok(flightDuration(true) >= 0.75 && flightDuration(true) <= 0.85);
  const body = createBody();
  beginJump(body);
  stepBody(body, false);
  while (body.active) stepBody(body, true);
  assert.equal(body.age, flightDuration(false));
  assert.equal(body.y, GROUND_Y - PLAYER.height);
});

test('持续喊不连跳，短暂噪声谷值不重新触发，安静后允许下一声', () => {
  const detector = new VoiceJumpDetector({ triggerLevel: 0.05, releaseRatio: 0.55, cooldownMs: 280 });
  assert.equal(detector.update(0.1, 0), true);
  for (let t = 10; t < 2000; t += 10) assert.equal(detector.update(0.1, t), false);
  detector.update(0, 2000);
  detector.update(0, 2030);
  assert.equal(detector.update(0.1, 2050), false);
  detector.update(0, 2100);
  detector.update(0, 2190);
  assert.equal(detector.isHeld(), false);
  assert.equal(detector.update(0.1, 2200), true);
});

test('声音到物理：短促发声与持续发声具有明显高度差', () => {
  function simulateVoice(duration) {
    const body = createBody();
    const detector = new VoiceJumpDetector({ triggerLevel: 0.05, releaseRatio: 0.55, cooldownMs: 280 });
    let peak = 0;
    let jumps = 0;
    // 模拟60Hz音量采样与120Hz物理步进。
    for (let frame = 0; frame < 240; frame++) {
      const time = frame * STEP;
      if (frame % 2 === 0 && detector.update(time < duration ? 0.1 : 0, time * 1000)) {
        assert.equal(beginJump(body), true);
        jumps++;
      }
      stepBody(body, detector.isHeld());
      peak = Math.max(peak, GROUND_Y - PLAYER.height - body.y);
    }
    assert.equal(jumps, 1);
    return { peak, flight: body.age };
  }
  const short = simulateVoice(0.05);
  const long = simulateVoice(0.30);
  assert.ok(long.peak > short.peak * 1.5);
  assert.ok(long.flight > short.flight + 0.15);
  assert.ok(long.peak < GROUND_Y - PLAYER.height); // 角色不跳出画面。
  console.log({ shortVoice: short, longVoice: long });
});

test('蓄力在安静30ms后停止，但仍需80ms安静才能重新触发', () => {
  const detector = new VoiceJumpDetector({ triggerLevel: 0.05, releaseRatio: 0.55, cooldownMs: 280 });
  detector.update(0.1, 0);
  detector.update(0, 300);
  detector.update(0, 316);
  assert.equal(detector.isHeld(), true);
  detector.update(0, 332);
  assert.equal(detector.isHeld(), false);
  assert.equal(detector.update(0.1, 350), false);
  detector.update(0, 400);
  detector.update(0, 480);
  assert.equal(detector.update(0.1, 500), true);
});

test('从初速到接近上限，1500个障碍均保留起跳窗口及落地恢复间隔', () => {
  const kinds = new Set();
  const shapes = new Set();
  let longOnly = 0;
  let shortAvailable = 0;
  let minWindow = Infinity;
  let minRecovery = Infinity;
  for (const seed of [7, 42, 2026]) {
    const planner = new ObstaclePlanner(seeded(seed));
    let readyAt = 0;
    for (let i = 0; i < 500; i++) {
      const obstacle = planner.next();
      assert.ok(obstacle.width >= 60 && obstacle.width <= 124);
      assert.ok(obstacle.height >= 52 && obstacle.height <= 124);
      if (obstacle.shortWindow) shortAvailable++; else longOnly++;
      kinds.add(obstacle.kind);
      shapes.add(`${Math.round(obstacle.width)}x${Math.round(obstacle.height)}`);
      for (const [held, window] of [[false, obstacle.shortWindow], [true, obstacle.longWindow]]) {
        if (!window) continue;
        const width = window.end - window.start;
        minWindow = Math.min(minWindow, width);
        assert.ok(width >= 0.12 - 1e-8);
        assert.ok(window.start >= readyAt - 1e-8);
        // 检查两端、中间及多个帧相位。
        for (let start = window.start; start <= window.end; start += STEP / 2) {
          assert.ok(canClear(obstacle, start, held));
        }
      }
      if (i > 0) minRecovery = Math.min(minRecovery,
        Math.min(obstacle.shortWindow?.start ?? Infinity, obstacle.longWindow.start) - readyAt + RESET_SECONDS);
      readyAt = Math.max(obstacle.shortWindow ? obstacle.shortWindow.end + flightDuration(false) : 0,
        obstacle.longWindow.end + flightDuration(true)) + RESET_SECONDS;
    }
  }
  assert.equal(kinds.size, 5);
  assert.ok(longOnly > 0 && shortAvailable > 0);
  assert.ok(shapes.size > 20);
  console.log({ obstacleTypes: kinds.size, obstacleShapes: shapes.size, longOnly, shortAvailable,
    minWindowSeconds: minWindow, minRecoverySeconds: minRecovery,
    shortFlight: flightDuration(false), longFlight: flightDuration(true), speedAtTenMinutes: speedAt(600) });
});

test('完整连续跑道：优先短跳、全部长跳、混合时长，按障碍选择可用跳法通过300个障碍', () => {
  for (const mode of ['short', 'long', 'mixed']) {
    const planner = new ObstaclePlanner(seeded(123));
    const obstacles = Array.from({ length: 300 }, () => planner.next());
    const body = createBody();
    let next = 0;
    let active = 0;
    let holdDuration = 0;
    for (let time = 0; time < obstacles.at(-1).arrival + 1; time += STEP) {
      const obstacle = obstacles[next];
      if (obstacle) {
        // 大障碍需要长跳，矮障碍优先短跳；两种选择都要留出连续落地时间。
        const useLong = mode === 'long' || !obstacle.shortWindow;
        const window = useLong ? obstacle.longWindow : obstacle.shortWindow;
        const fraction = next % 2 ? 0.1 : 0.9;
        const start = window.start + (window.end - window.start) * fraction;
        if (time >= start) {
          assert.equal(beginJump(body), true, `${mode}: 第${next}跳尚未落地`);
          holdDuration = useLong ? 1 : mode === 'short' ? 0 : [0.04, 0.08, 0.15, 0.25][next % 4];
          next++;
        }
      }
      stepBody(body, body.age < holdDuration);
      while (active < obstacles.length && obstacleX(obstacles[active], time) + obstacles[active].width < PLAYER.x) active++;
      for (let i = active; i < Math.min(active + 3, obstacles.length); i++) {
        const o = obstacles[i];
        assert.equal(intersects({ ...PLAYER, y: body.y }, { x: obstacleX(o, time + STEP),
          y: GROUND_Y - o.height, width: o.width, height: o.height }), false, `${mode}: 撞到${i}`);
      }
    }
    assert.equal(next, obstacles.length);
  }
});

test('加速平滑有上限，极端随机值仍能生成跑道', () => {
  assert.equal(speedAt(0), 390);
  for (let time = 0; time < 1200; time++) {
    assert.ok(speedAt(time + 1) >= speedAt(time));
    assert.ok(speedAt(time) <= 660);
    assert.ok(speedAt(time + 1) - speedAt(time) < 3.9);
  }
  for (const value of [0, 0.999999]) {
    const planner = new ObstaclePlanner(() => value);
    for (let i = 0; i < 300; i++) planner.next();
  }
});
