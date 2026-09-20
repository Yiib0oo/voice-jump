import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mineBays, MINE_BAY_WIDTH, MINE_PARALLAX, drawMine } from '../src/game/MineScenery.ts';

test('矿壁段落只变化装饰位置，使用完整嵌入式木撑，不生成洞室或玩法物体', () => {
  const profiles = Array.from({ length: 4 }, (_, id) => mineBays(id * MINE_BAY_WIDTH / MINE_PARALLAX.wall).find(bay => bay.id === id));
  assert.equal(new Set(profiles.map(bay => bay.timber)).size, 4);
  for (const bay of profiles) {
    assert.ok(bay.timber >= 0 && bay.timber + 134 <= MINE_BAY_WIDTH);
    assert.equal(bay.lamps.length, 2);
    for (const [x, y] of [...bay.lamps, ...bay.plants, bay.brick]) {
      assert.ok(x >= 0 && x + 64 <= MINE_BAY_WIDTH);
      assert.ok(y >= 0 && y + 64 < 480);
    }
  }
});

test('整面矿壁固定为一个慢速平面，跨段落不重新排列装饰', () => {
  assert.deepEqual(MINE_PARALLAX, { wall: 0.06 });
  for (const distance of [0, 1024 / .06 - .01, 1024 / .06, 12345, 99999]) {
    const a = mineBays(distance), b = mineBays(distance + 1);
    for (const bay of a) {
      const next = b.find(item => item.id === bay.id);
      if (!next) continue;
      assert.equal(next.timber, bay.timber);
      assert.deepEqual(next.lamps, bay.lamps);
      assert.deepEqual(next.plants, bay.plants);
      assert.ok(Math.abs(next.x - bay.x + MINE_PARALLAX.wall) < 1e-8);
    }
  }
});

function capture(distance) {
  const commands = [];
  const ctx = new Proxy({}, { get(_target, key) {
    if (key === 'createRadialGradient') return (...args) => {
      commands.push([key, ...args]); return { addColorStop(...stop) { commands.push(['stop', ...stop]); } };
    };
    return (...args) => commands.push([key, ...args]);
  }, set(_target, key, value) { commands.push([key, typeof value === 'object' ? 'gradient' : value]); return true; } });
  drawMine(ctx, distance, { tiles: 'tiles', rock: 'rock', vine: 'vine' });
  return commands;
}

test('原生细岩壁连续铺满跳跃区域，滚动跨纹理边界无一像素裂缝，灯光不闪烁', () => {
  assert.deepEqual(capture(18000), capture(18000));
  assert.ok(capture(18000).some(command => command[0] === 'createRadialGradient'));
  for (const distance of [0, 32 / .06 - .01, 32 / .06 + .01, 17066, 99999.99]) {
    const walls = capture(distance).filter(c => c[0] === 'drawImage' && c[2] === 272 && c[3] === 112);
    assert.ok(walls.length > 0);
    for (let y = 0; y < 480; y += 64) {
      const row = walls.filter(c => c[7] === y).sort((a, b) => a[6] - b[6]);
      assert.ok(row[0][6] <= 0 && row.at(-1)[6] + 32 >= 900);
      for (let i = 1; i < row.length; i++) assert.equal(row[i][6] - row[i - 1][6], 32);
      assert.ok(row.every(c => c[4] === 16 && c[5] === 32 && c[8] === 32 && c[9] === 64));
    }
  }
});
