// Draws the extension icon (a popcorn bucket on a midnight-blue rounded square) as PNGs, no image
// tools needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 96, 128];
const SAMPLES = 8;

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

// The logo's shapes on its 128-unit grid, painted in order.
const MIDNIGHT = [0x1f, 0x25, 0x47];
const KERNEL = [0xff, 0xf8, 0xe7];
const KERNEL_SHADE = [0xff, 0xf3, 0xd1];
const BUCKET = [0xe2, 0x3d, 0x4b];
const RIM = [0xc4, 0x2f, 0x3d];

const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function roundedRect(left, top, width, height, r) {
  return (x, y) => {
    const dx = Math.max(left + r - x, 0, x - (left + width - r));
    const dy = Math.max(top + r - y, 0, y - (top + height - r));
    return dx * dx + dy * dy <= r * r;
  };
}

function polygon(points) {
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

const TILE = roundedRect(0, 0, 128, 128, 28);
const LAYERS = [
  [MIDNIGHT, TILE],
  [KERNEL, circle(42, 50, 15)],
  [KERNEL, circle(64, 38, 18)],
  [KERNEL, circle(86, 50, 15)],
  [KERNEL_SHADE, circle(53, 56, 13)],
  [KERNEL_SHADE, circle(75, 56, 13)],
  [
    BUCKET,
    polygon([
      [30, 62],
      [98, 62],
      [89, 112],
      [39, 112],
    ]),
  ],
  // White stripes, following the bucket's taper.
  [
    KERNEL,
    polygon([
      [43.6, 62],
      [57.2, 62],
      [59, 112],
      [49, 112],
    ]),
  ],
  [
    KERNEL,
    polygon([
      [70.8, 62],
      [84.4, 62],
      [79, 112],
      [69, 112],
    ]),
  ],
  [RIM, roundedRect(26, 58, 76, 9, 4.5)],
];

/** The color at (x, y) on the 128-unit grid, or null outside the tile. */
function colorAt(x, y) {
  if (!TILE(x, y)) return null;
  let color = null;
  for (const [c, inside] of LAYERS) if (inside(x, y)) color = c;
  return color;
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
          const c = colorAt(
            ((px + (sx + 0.5) / SAMPLES) / size) * 128,
            ((py + (sy + 0.5) / SAMPLES) / size) * 128,
          );
          if (!c) continue;
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
