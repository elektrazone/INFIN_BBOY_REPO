const fs = require('fs');
const path = require('path');
const gltf = JSON.parse(fs.readFileSync('temp_player.gltf', 'utf8'));
const bin = fs.readFileSync('temp_player.bin');
const bufferViews = gltf.bufferViews || [];
const accessors = gltf.accessors || [];
function getTyped(index) {
  const acc = accessors[index];
  if (!acc) return null;
  const bv = bufferViews[acc.bufferView];
  if (!bv) return null;
  const offset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const length = acc.count;
  const componentType = acc.componentType;
  let TypedArray;
  switch (componentType) {
    case 5126:
      TypedArray = Float32Array;
      break;
    case 5123:
      TypedArray = Uint16Array;
      break;
    case 5121:
      TypedArray = Uint8Array;
      break;
    default:
      throw new Error('Unsupported component type ' + componentType);
  }
  const byteLength = length * TypedArray.BYTES_PER_ELEMENT;
  const slice = bin.subarray(offset, offset + byteLength);
  const arr = new TypedArray(slice.buffer, slice.byteOffset, length);
  return Array.from(arr);
}
const animInfo = [];
(gltf.animations || []).forEach((anim, ai) => {
  (anim.samplers || []).forEach((sampler, si) => {
    const times = getTyped(sampler.input);
    if (!times || !times.length) return;
    animInfo.push({
      animation: anim.name || `animation_${ai}`,
      sampler: si,
      times
    });
  });
});
if (!animInfo.length) {
  console.error('No animation samplers with input keyframes found.');
  process.exit(1);
}
animInfo.sort((a, b) => b.times.length - a.times.length);
const primary = animInfo[0];
const times = primary.times;
const diffs = [];
for (let i = 1; i < times.length; i++) {
  diffs.push(times[i] - times[i - 1]);
}
const minStep = Math.min(...diffs.filter(d => d > 1e-5));
const avgStep = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
const fpsEstimate = Math.round(1 / minStep);
console.log('Sampler:', primary.animation, 'sampler', primary.sampler);
console.log('Keyframe count:', times.length);
console.log('Duration (s):', times[times.length - 1]);
console.log('Min delta (s):', minStep, 'Avg delta (s):', avgStep, 'Approx FPS:', fpsEstimate);
const threshold = minStep * 1.2;
const segments = [];
let current = { start: times[0], end: times[0] };
for (let i = 1; i < times.length; i++) {
  const step = times[i] - times[i - 1];
  if (step > threshold) {
    segments.push(current);
    current = { start: times[i], end: times[i] };
  } else {
    current.end = times[i];
  }
}
segments.push(current);
function toFrame(time) {
  return Math.round(time / minStep);
}
console.log('Detected segments:', segments.length);
segments.forEach((seg, index) => {
  console.log(index.toString().padStart(2, '0'), 'Start:', seg.start.toFixed(4), 'End:', seg.end.toFixed(4), 'Frames:', toFrame(seg.start), '-', toFrame(seg.end), 'Length:', toFrame(seg.end) - toFrame(seg.start));
});
