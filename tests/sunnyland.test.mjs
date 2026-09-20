import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SunnyLand, repeatStarts, forestWeight, sceneWeights, SCENERY_FLOOR, MINE_PARALLAX } from '../src/game/SunnyLand.ts';

test('绿野、密林、矿道循环切换，权重之和为1，跨周期连续', () => {
  assert.equal(forestWeight(0), 0);
  assert.equal(forestWeight(22), 0);
  assert.equal(forestWeight(25), 0.5);
  assert.equal(forestWeight(28), 1);
  assert.equal(forestWeight(50), 1);
  assert.equal(forestWeight(53), 0.5);
  assert.equal(forestWeight(56), 0);
  assert.deepEqual(sceneWeights(56), { meadow: 0, forest: 0, mine: 1 });
  assert.deepEqual(sceneWeights(53), { meadow: 0, forest: 0.5, mine: 0.5 });
  assert.deepEqual(sceneWeights(78), { meadow: 0, forest: 0, mine: 1 });
  assert.deepEqual(sceneWeights(81), { meadow: 0.5, forest: 0, mine: 0.5 });
  assert.deepEqual(sceneWeights(84), { meadow: 1, forest: 0, mine: 0 });
  assert.equal(SCENERY_FLOOR, 480);
  for (let time = 0; time < 120; time += 0.01) {
    assert.ok(forestWeight(time) >= 0 && forestWeight(time) <= 1);
    assert.ok(Math.abs(forestWeight(time + 0.01) - forestWeight(time)) < 0.003);
    const weights = sceneWeights(time), next = sceneWeights(time + 0.01);
    assert.ok(Math.abs(Object.values(weights).reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
    for (const name of ['meadow', 'forest', 'mine']) assert.ok(Math.abs(weights[name] - next[name]) < 0.003);
  }
});

test('SunnyLand 背景每条铺满画布，取模前后没有一像素接缝', () => {
  for (const [factor, width] of [[0.07, 768], [0.20, 352], [0.07, 384], [0.20, 768]]) {
    for (const step of [-0.01, 0, 0.01, 0.4, 1000, 100000]) {
      const starts = repeatStarts(width / factor + step, factor, width);
      assert.ok(starts[0] <= 0);
      assert.ok(starts.at(-1) + width >= 900);
      starts.slice(1).forEach((x, i) => assert.equal(x - starts[i], width));
    }
  }
});

function context() {
    const calls = [], stack = [];
  return {
    calls, globalAlpha: 1, imageSmoothingEnabled: true,
    save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); },
    clearRect() {}, fillRect() {}, translate() {}, scale() {}, rotate() {}, beginPath() {}, rect() {}, clip() {},
    moveTo() {}, lineTo() {}, closePath() {}, createRadialGradient() { return { addColorStop() {} }; },
    drawImage(image, ...coords) {
      assert.ok(coords.every(Number.isFinite));
      if (coords.length === 8) {
        const [x, y, width, height] = coords;
        assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
        assert.ok(x + width <= image.naturalWidth && y + height <= image.naturalHeight);
      }
      calls.push({ image, coords, opacity: this.globalAlpha });
    },
  };
}

test('原图全部存在，精灵取样不越界；整帧淡化只应用一次', t => {
  const images = [], frames = [];
  const originals = ['document', 'Image'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => originals.forEach(([key, descriptor]) => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }));
  globalThis.document = { baseURI: 'https://example.com/voice-jump/', createElement: () => {
    const frame = context(); frames.push(frame);
    return { width: 0, height: 0, getContext: () => frame };
  } };
  globalThis.Image = class {
    complete = true;
    constructor() { images.push(this); }
    set src(url) {
      this.url = url;
      const name = url.split('/').at(-1);
      const bytes = readFileSync(new URL(`../public/assets/sunnyland/${name}`, import.meta.url));
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      this.naturalWidth = bytes.readUInt32BE(16);
      this.naturalHeight = bytes.readUInt32BE(20);
    }
  };
  const scene = new SunnyLand(() => {});
  assert.equal(images.length, 20);
  assert.ok(images.every(image => image.url.startsWith('https://example.com/voice-jump/assets/sunnyland/')));
  assert.equal(scene.ready, true);
  const target = context();
  for (const opacity of [0.01, 0.5, 1]) for (const time of [0, 22, 25, 28, 50, 53, 56, 78, 81, 84]) {
    target.calls.length = 0;
    assert.equal(scene.background(target, 99999.99, opacity, time), true);
    assert.equal(target.calls.length, 1);
    assert.equal(target.calls[0].opacity, opacity);
    assert.equal(target.globalAlpha, 1);
  }
  for (const distance of [0, 6000, 12000, 18000]) scene.background(target, distance, 1, 56);
  // Sprite layers are opaque; only the complete forest frame carries the transition alpha.
  assert.ok(frames.flatMap(frame => frame.calls).filter(call => call.image.url).every(call => call.opacity === 1));
  const art = frames.flatMap(frame => frame.calls).filter(call => call.image.url);
  assert.ok(art.some(call => call.image.url.endsWith('/forest-back.png')));
  assert.ok(art.some(call => call.image.url.endsWith('/forest-tileset.png')));
  assert.ok(art.some(call => call.image.url.endsWith('/mine-rock.png')));
  assert.ok(art.some(call => call.image.url.endsWith('/mine-vine.png')));
  // The mine samples the authored rock wall and lantern, not the forest panorama.
  assert.ok(art.some(call => call.coords[0] === 304 && call.coords[1] === 128));
  assert.ok(art.some(call => call.coords[0] === 272 && call.coords[1] === 112));
  const mineArt = frames.find(frame => frame.calls.some(call => call.image.url?.endsWith('/mine-rock.png')));
  const walls = mineArt.calls.filter(call => call.image.url?.endsWith('/forest-tileset.png') &&
    call.coords[0] === 272 && call.coords[1] === 112);
  // Fine native rock texture stays at 2x pixel scale on one slow wall plane.
  assert.ok(walls.length > 0);
  assert.ok(walls.every(call => call.coords[6] === 32 && call.coords[7] === 64));
  assert.deepEqual(MINE_PARALLAX, { wall: 0.06 });
  for (const call of art.filter(call => /\/(forest-)?(tree|house|bush|shrooms|mushroom)\.png$/.test(call.image.url))) {
    if (call.coords.length === 4) assert.ok(call.coords[1] + call.coords[3] <= SCENERY_FLOOR);
  }
  images.find(image => image.url.endsWith('/forest-back.png')).complete = false;
  assert.equal(scene.background(target, 100, 1, 28), true); // Keep meadow if forest hasn't loaded.
  assert.deepEqual(scene.hazardWeights(28), { meadow: 1, forest: 0, mine: 0 });
  assert.deepEqual(scene.hazardWeights(56), { meadow: 0, forest: 0, mine: 1 });
  images.find(image => image.url.endsWith('/mine-rock.png')).complete = false;
  assert.equal(scene.background(target, 100, 1, 56), true);
  assert.deepEqual(scene.hazardWeights(56), { meadow: 1, forest: 0, mine: 0 });
  for (const width of [35, 63, 111.25, 720]) {
    assert.equal(scene.platform(target, 20, 200, width), true);
    assert.equal(scene.spikes(target, 20, 432, width), true);
  }
  for (const kind of ['opossum', 'slug']) {
    const frames = new Set(), directions = new Set();
    target.scale = x => directions.add(x);
    const animal = { id: 0, kind, width: 66, top: 434,
      patrol: { radius: 50, period: 1.1, phase: 0, startedAt: 0 } };
    for (let time = 0; time < 1.2; time += 0.04) {
      assert.equal(scene.animal(target, animal, 250, time), true);
      const draw = target.calls.at(-1);
      assert.ok(draw.image.url.endsWith(`/${kind}.png`));
      frames.add(draw.coords[0]);
    }
    assert.equal(frames.size, kind === 'opossum' ? 6 : 4);
    assert.deepEqual([...directions].sort(), [-1, 1]);
  }
  images[0].complete = false;
  assert.equal(scene.ready, false);
  assert.equal(scene.background(target, 0, 1), false);
});
