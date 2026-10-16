// Draws the extension icon (white star on a blue rounded square) as PNGs, no image tools needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 96, 128];
const BG_TOP = [46, 115, 236];
const BG_BOTTOM = [26, 79, 184];
const STAR = [255, 255, 255];
const SAMPLES = 4;

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.from([0]), rgba.subarray(y * size * 4, (y + 1) * size * 4));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Unit-square geometry (0..1).
const RADIUS = 0.22;
function inRoundedSquare(x, y) {
  const dx = Math.max(RADIUS - x, 0, x - (1 - RADIUS));
  const dy = Math.max(RADIUS - y, 0, y - (1 - RADIUS));
  return dx * dx + dy * dy <= RADIUS * RADIUS;
}

const star = [];
for (let i = 0; i < 10; i++) {
  const r = i % 2 === 0 ? 0.36 : 0.15;
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  star.push([0.5 + r * Math.cos(a), 0.53 + r * Math.sin(a)]);
}
function inStar(x, y) {
  let inside = false;
  for (let i = 0, j = star.length - 1; i < star.length; j = i++) {
    const [xi, yi] = star[i];
    const [xj, yj] = star[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

mkdirSync('public/icon', { recursive: true });
for (const size of SIZES) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (!inRoundedSquare(x, y)) continue;
          const c = inStar(x, y) ? STAR : BG_TOP.map((t, i) => t + (BG_BOTTOM[i] - t) * y);
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
      const o = (py * size + px) * 4;
      if (a) {
        rgba[o] = Math.round(r / a);
        rgba[o + 1] = Math.round(g / a);
        rgba[o + 2] = Math.round(b / a);
      }
      rgba[o + 3] = Math.round((255 * a) / (SAMPLES * SAMPLES));
    }
  }
  writeFileSync(`public/icon/${size}.png`, png(size, rgba));
}
console.log(`Wrote public/icon/{${SIZES.join(',')}}.png`);
