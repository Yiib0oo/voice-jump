import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUND_Y, WORLD_HEIGHT } from '../src/game/physics.ts';
import { seasonAt, rainAt, sceneryItems, SEASON_SECONDS, drawSeasonalBackground } from '../src/game/Seasons.ts';

test('四季天空和土层保持鲜明饱和度，地表随季节变化', () => {
  const palettes = [0,18,36,54].map(time => seasonAt(time).palette);
  for (const palette of palettes) {
    for (const color of [palette.sky, palette.soil, palette.soilDeep]) {
      const channels = color.match(/\d+/g).map(Number);
      const saturation = (Math.max(...channels) - Math.min(...channels)) / Math.max(...channels);
      assert.ok(saturation > 0.5);
    }
  }
  for (const key of ['grass', 'grassLight', 'soil', 'soilDeep']) {
    assert.equal(new Set(palettes.map(palette => palette[key])).size, 4);
  }
});

test('夏秋阵雨平滑出现和消退，循环与冬季无雨保持一致', () => {
  assert.ok(rainAt(27) > 0.9);
  assert.ok(rainAt(45) > 0.7);
  for (const time of [0, 18, 36, 54, 60, 70, 72]) assert.equal(rainAt(time), 0);
  for (let time = 0; time < 72; time += 0.05) {
    assert.ok(rainAt(time) >= 0 && rainAt(time) <= 1);
    assert.ok(Math.abs(rainAt(time) - rainAt(time + 0.05)) < 0.03);
    assert.ok(Math.abs(rainAt(time) - rainAt(time + 72)) < 1e-10);
  }
});

test('春夏秋冬顺序循环，冬春过渡与其他季节一样连续', () => {
  for (let i = 0; i < 4; i++) assert.equal(seasonAt(i * SEASON_SECONDS).index, i);
  for (let time = 0; time < 72; time += 0.125) {
    const frame = seasonAt(time);
    assert.ok(frame.weights.every(value => value >= 0 && value <= 1));
    assert.ok(Math.abs(frame.weights.reduce((a, b) => a + b, 0) - 1) < 1e-10);
    assert.deepEqual(frame, seasonAt(time + 72));
  }
  for (const boundary of [10, 18, 28, 36, 46, 54, 64, 72]) {
    const before = seasonAt(boundary - 0.0001);
    const after = seasonAt(boundary + 0.0001);
    assert.deepEqual(before.palette, after.palette);
    assert.ok(before.weights.every((weight, i) => Math.abs(weight - after.weights[i]) < 1e-7));
  }
});

test('视差层跨拼接边界时保留世界编号，形状不会因取模重置', () => {
  for (const [factor, spacing] of [[0.07, 245], [0.16, 230], [0.27, 190], [0.40, 205], [0.58, 110], [1, 48]]) {
    for (const block of [1, 2, 100, 10000]) {
      const boundary = block * spacing / factor;
      const before = sceneryItems(boundary - 0.1, factor, spacing);
      const after = sceneryItems(boundary + 0.1, factor, spacing);
      for (const item of before.filter(item => item.x >= -spacing && item.x <= 900)) {
        const next = after.find(next => next.id === item.id);
        assert.ok(next);
        assert.ok(Math.abs(next.x - item.x + 0.2 * factor) < 1e-8);
      }
      assert.ok(after[0].x < -spacing);
      assert.ok(after.at(-1).x > 900);
    }
  }
});

test('四季及过渡帧均覆盖完整画布，并恢复绘制状态', () => {
  for (const time of [0, 14, 18, 27, 32, 36, 45, 50, 54, 68, 72]) {
    let saved = 0;
    const rectangles = [];
    const ctx = {
      globalAlpha: 1, fillStyle: '', imageSmoothingEnabled: true,
      save() { saved++; }, restore() { saved--; },
      fillRect(x, y, w, h) {
        assert.ok([x, y, w, h].every(Number.isFinite));
        assert.ok(w > 0 && h > 0);
        assert.ok(this.globalAlpha >= 0 && this.globalAlpha <= 1);
        rectangles.push([x, y, w, h]);
      },
    };
    drawSeasonalBackground(ctx, time, 25000.25);
    assert.equal(saved, 0);
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      assert.ok(rectangles.some(([x, top, w, h]) => x <= 0 && w >= 900 && y >= top && y < top + h));
    }
  }
});

test('春夏秋植物使用不同几何轮廓，而不是同一贴图仅更换颜色', () => {
  const shapes = [0, 18, 36].map(time => {
    const rectangles = [];
    const ctx = { globalAlpha: 1, fillStyle: '', imageSmoothingEnabled: false,
      save() {}, restore() {},
      fillRect(x, y, w, h) {
        if (this.globalAlpha > 0.9 && y >= GROUND_Y - 160 && y < GROUND_Y && x >= 0 && x + w <= 900)
          rectangles.push([x, y, w, h]);
      },
    };
    drawSeasonalBackground(ctx, time, 480);
    return rectangles;
  });
  assert.notDeepEqual(shapes[0], shapes[1]);
  assert.notDeepEqual(shapes[1], shapes[2]);
  assert.notDeepEqual(shapes[0], shapes[2]);
});
