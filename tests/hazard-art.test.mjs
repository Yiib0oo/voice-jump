import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawThemedHazard } from '../src/game/HazardArt.ts';
import { SceneRenderer } from '../src/game/SceneRenderer.ts';
import { runDistance } from '../src/game/Adventure.ts';

function context() {
  return { calls: [], clips: [], save() {}, restore() {}, beginPath() {}, clip() {},
    rect(...bounds) { this.clips.push(bounds); },
    fillRect(...bounds) { assert.ok(bounds.every(Number.isFinite)); this.calls.push([this.fillStyle, ...bounds]); },
  };
}

test('森林木桩有直身削尖，绿野水晶为楔形，两者不仅是换颜色', () => {
  const crystal = context(), wood = context();
  drawThemedHazard(crystal, 100, 430, 78, 0);
  drawThemedHazard(wood, 100, 430, 78, 1);
  assert.notDeepEqual(crystal.calls.map(call => call.slice(1)), wood.calls.map(call => call.slice(1)));
  assert.ok(wood.calls.some(call => call[0] === 'rgb(245,203,131)'));
  assert.ok(crystal.calls.some(call => call[0] === 'rgb(244,203,238)'));
  // Each row has 3 fills; the lower two wooden rows have equal width, unlike crystal wedges.
  assert.equal(wood.calls[27][3], wood.calls[33][3]);
  assert.ok(crystal.calls[27][3] < crystal.calls[33][3]);
});

test('短刺和长带均受同一个碰撞外框裁切，过渡中不改几何数据', () => {
  for (const width of [20, 47, 70, 330, 720]) for (const weight of [0, 0.25, 0.5, 0.75, 1]) {
    const ctx = context();
    drawThemedHazard(ctx, 100, 432, width, weight);
    assert.deepEqual(ctx.clips, [[100, 432, width, 48]]);
    assert.ok(ctx.calls.length > 0);
  }
});

test('所有固定障碍跟随当前背景材质，冻结时不变，原始关卡保持不变', () => {
  for (const kind of ['cactus', 'thorns', 'crystals', 'spikes']) {
    const outputs = [];
    for (const time of [0, 25, 28, 84, 56, 81]) {
      const item = { id: 1, kind, x: 200 + runDistance(time), top: 432, width: 150 };
      const original = structuredClone(item), ctx = context();
      SceneRenderer.prototype.terrain.call({}, ctx, item, time);
      outputs.push(ctx.calls);
      assert.deepEqual(item, original);
      const again = context();
      SceneRenderer.prototype.terrain.call({}, again, item, time);
      assert.deepEqual(ctx.calls, again.calls);
    }
    assert.deepEqual(outputs[0], outputs[3]);
    assert.notDeepEqual(outputs[0], outputs[1]);
    assert.notDeepEqual(outputs[0], outputs[2]);
    assert.notDeepEqual(outputs[0], outputs[4]);
    assert.notDeepEqual(outputs[2], outputs[4]);
  }
});

test('矿道岩刺有阶梯状石面，保持尖顶和原碰撞边界', () => {
  const rock = context(), crystal = context(), wood = context();
  drawThemedHazard(rock, 100, 430, 78, 0, 1);
  drawThemedHazard(crystal, 100, 430, 78, 0, 0);
  drawThemedHazard(wood, 100, 430, 78, 1, 0);
  assert.deepEqual(rock.clips, crystal.clips);
  assert.notDeepEqual(rock.calls.map(call => call.slice(1)), crystal.calls.map(call => call.slice(1)));
  assert.notDeepEqual(rock.calls.map(call => call.slice(1)), wood.calls.map(call => call.slice(1)));
  assert.ok(rock.calls.some(call => call[0] === 'rgb(218,224,199)'));
  for (const [forest, mine] of [[0.5,0.5], [0,0.5]]) {
    const ctx = context(); drawThemedHazard(ctx, 100, 430, 78, forest, mine);
    assert.deepEqual(ctx.clips, rock.clips);
  }
});
