// Generates OSP app icons (192, 512, maskable 512) as PNGs
// using only Node built-ins. No external image libraries.
// Pink gradient background, rounded corners, white heart glyph.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'public');
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePNG(size, drawFn) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawFn(x, y, size);
      row[1 + x * 4] = r;
      row[2 + x * 4] = g;
      row[3 + x * 4] = b;
      row[4 + x * 4] = a;
    }
    rows.push(row);
  }
  const idat = deflateSync(Buffer.concat(rows));
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// heart implicit: (x^2 + y^2 - 1)^3 - x^2*y^3 <= 0
// x,y normalized so heart fits roughly in [-1.2, 1.2]
function heartAt(nx, ny) {
  const x = nx;
  const y = -ny; // flip vertically so heart is upright
  const v = Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y;
  return v <= 0;
}

function draw(size, opts = {}) {
  const radius = opts.round ? size * 0.22 : 0;
  const cx = size / 2;
  const cy = size / 2;
  const heartScale = opts.maskable ? 0.45 : 0.55;
  return (x, y) => {
    // Rounded square background (skip rounding for maskable so it fills entirely)
    if (radius > 0) {
      const dx = Math.max(radius - x, 0, x - (size - radius));
      const dy = Math.max(radius - y, 0, y - (size - radius));
      if (dx * dx + dy * dy > radius * radius) return [0, 0, 0, 0];
    }
    // Pink gradient
    const t = y / size;
    const col = mix([233, 30, 99], [255, 45, 149], t);
    // Heart
    const hx = (x - cx) / (size * heartScale * 0.5);
    const hy = (y - cy) / (size * heartScale * 0.5);
    if (heartAt(hx, hy)) return [255, 255, 255, 255];
    return [col[0], col[1], col[2], 255];
  };
}

function write(size, filename, opts) {
  const buf = makePNG(size, draw(size, opts));
  writeFileSync(path.join(outDir, filename), buf);
  console.log(`wrote ${filename} (${buf.length} bytes, ${size}x${size})`);
}

write(192, 'icon-192.png', { round: true });
write(512, 'icon-512.png', { round: true });
write(512, 'icon-maskable.png', { maskable: true });
