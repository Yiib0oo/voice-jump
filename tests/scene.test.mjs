import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SceneRenderer } from '../src/game/SceneRenderer.ts';
import { GROUND_Y } from '../src/game/physics.ts';

test('平台和所有危险物正常绘制，但不显示元素说明文字', () => {
  for (const kind of ['platform', 'cactus', 'thorns', 'crystals', 'spikes', 'opossum', 'slug']) {
    let rectangles = 0;
    const ctx = {
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, translate() {}, scale() {},
      fillRect() { rectangles++; },
      fillText() { assert.fail(`${kind} 不应绘制文字`); },
      measureText() { assert.fail(`${kind} 不应布局文字标签`); },
    };
    SceneRenderer.prototype.terrain.call({ sprite() { rectangles++; return true; } }, ctx, {
      id: 1, kind, x: 300, width: 110, top: GROUND_Y - 60,
      label: '测试说明：不应显示在元素上', passed: false,
    }, 0);
    assert.ok(rectangles > 0);
  }
});

test('背景使用有效游戏时间切换素材场景，资源未加载也不露出旧四季背景', () => {
  for (const time of [0, 14, 18, 68, 72]) {
    const drawn = [], spring = [];
    const ctx = { globalAlpha: 1, fillStyle: '', save() {}, restore() {},
      fillRect() { if (this.globalAlpha > 0) drawn.push(this.fillStyle); } };
    SceneRenderer.prototype.background.call({ sunny: {
      background(_ctx, distance, weight, clock) { spring.push([distance, weight, clock]); return true; },
    } }, ctx, time, 500);
    assert.equal(drawn.includes('#eb579e'), false);
    assert.equal(drawn.length, 0); assert.deepEqual(spring, [[500, 1, time]]);
  }
  let rectangles = 0;
  SceneRenderer.prototype.background.call({ sunny: { background() { return false; } } }, {
    save() {}, restore() {}, fillRect() { rectangles++; },
  }, 0, 0);
  assert.ok(rectangles > 0);
});
