import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PointerJumpInput } from '../src/input/PointerJumpInput.ts';
import { STEP, GROUND_Y, PLAYER, createBody, beginJump, stepBody } from '../src/game/physics.ts';

class Surface extends EventTarget {
  captures = new Set();
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  send(type, props = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, isPrimary: true, button: 0 }, props);
    this.dispatchEvent(event);
    return event;
  }
}

test('触屏轻点和长按接入真实物理：高度不同，持续按住不连跳', () => {
  function simulate(duration) {
    const surface = new Surface();
    const body = createBody();
    let held = false;
    let jumps = 0;
    const input = new PointerJumpInput(surface, () => {
      if (!beginJump(body)) return false;
      held = true;
      jumps++;
      return true;
    }, () => { held = false; });
    surface.send('pointerdown');
    let peak = 0;
    for (let frame = 0; frame < 240; frame++) {
      if (frame * STEP >= duration && input.isHeld()) surface.send('pointerup');
      stepBody(body, held);
      peak = Math.max(peak, GROUND_Y - PLAYER.height - body.y);
    }
    assert.equal(jumps, 1);
    return peak;
  }
  const short = simulate(0.05);
  const long = simulate(0.3);
  assert.ok(long > short * 1.5);
  assert.equal(simulate(10), long);
});

test('忽略右键、多指及重复按下，捕获指针直到匹配手指松开', () => {
  const surface = new Surface();
  let presses = 0;
  let releases = 0;
  const input = new PointerJumpInput(surface, () => { presses++; return true; }, () => releases++);
  surface.send('pointerdown', { button: 2 });
  surface.send('pointerdown', { isPrimary: false, pointerId: 2 });
  assert.equal(presses, 0);
  assert.equal(surface.send('pointerdown').defaultPrevented, true);
  assert.equal(surface.hasPointerCapture(1), true);
  surface.send('pointerdown');
  surface.send('pointerup', { pointerId: 2 });
  assert.equal(input.isHeld(), true);
  surface.send('pointerup');
  assert.equal(input.isHeld(), false);
  assert.equal(surface.hasPointerCapture(1), false);
  assert.equal(presses, 1);
  assert.equal(releases, 1);
});

test('触控取消、丢失捕获和重置均释放长按，之后可再次操作', () => {
  for (const end of ['pointercancel', 'lostpointercapture', 'reset']) {
    const surface = new Surface();
    let releases = 0;
    const input = new PointerJumpInput(surface, () => true, () => releases++);
    surface.send('pointerdown');
    if (end === 'reset') input.reset(); else surface.send(end);
    assert.equal(input.isHeld(), false);
    assert.equal(releases, 1);
    surface.send('pointerup');
    assert.equal(releases, 1);
    surface.send('pointerdown');
    assert.equal(input.isHeld(), true);
  }
});

test('未接受的起跳不捕获指针，也不会留下按住状态', () => {
  const surface = new Surface();
  const input = new PointerJumpInput(surface, () => false, () => assert.fail('不应释放未接受的输入'));
  surface.send('pointerdown');
  assert.equal(input.isHeld(), false);
  assert.equal(surface.hasPointerCapture(1), false);
});
