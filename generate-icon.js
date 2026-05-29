/**
 * generate-icon.js
 * Creates assets/icon.png and assets/icon.ico from scratch using only
 * Node.js built-ins (zlib + fs). Run once: node generate-icon.js
 *
 * Design: rounded dark square, ◈ diamond outline + center diamond in #D97757.
 */

'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const SIZE = 256;

// ── CRC32 (required for PNG chunks) ──────────────────────────────────────────
const CRC_TABLE = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xFF];
    return (c ^ 0xFFFFFFFF) >>> 0;
}

// ── DRAW ──────────────────────────────────────────────────────────────────────
const pixels = Buffer.alloc(SIZE * SIZE * 4, 0); // RGBA, all transparent

const BG     = [36, 36, 36];     // #242424 (--surface)
const ACCENT = [217, 119, 87];   // #D97757 (--accent)

const cx = SIZE / 2;
const cy = SIZE / 2;

const CORNER  = 44;  // rounded-rect corner radius
const OUTER   = 90;  // L1 radius of outer diamond edge
const THICK   = 14;  // border thickness of diamond ring
const CENTER  = 18;  // L1 radius of center diamond

for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
        // ── Rounded-rect mask (distance from rounded corner arc) ──
        const edgeX = Math.max(0, Math.max(CORNER - x, x - (SIZE - 1 - CORNER)));
        const edgeY = Math.max(0, Math.max(CORNER - y, y - (SIZE - 1 - CORNER)));
        const cornerDist = Math.sqrt(edgeX * edgeX + edgeY * edgeY);

        if (cornerDist > CORNER + 0.5) continue; // fully outside — stay transparent

        const alpha = cornerDist > CORNER - 0.5
            ? Math.round((CORNER + 0.5 - cornerDist) * 255) // anti-aliased edge
            : 255;

        // ── Diamond shape (L1 norm) ───────────────────────────────
        const px   = x - cx;
        const py   = y - cy;
        const norm = Math.abs(px) + Math.abs(py);

        const idx = (y * SIZE + x) * 4;

        if (norm <= CENTER) {
            // Solid center diamond (accent)
            pixels[idx] = ACCENT[0]; pixels[idx+1] = ACCENT[1]; pixels[idx+2] = ACCENT[2]; pixels[idx+3] = alpha;
        } else if (norm >= OUTER - THICK && norm <= OUTER) {
            // Diamond ring border (accent) — no inner anti-alias to avoid fringe
            const outerAlpha = norm > OUTER - 1 ? Math.round((OUTER + 0.5 - norm) * 255) : 255;
            const edgeA = Math.min(outerAlpha, alpha);
            pixels[idx] = ACCENT[0]; pixels[idx+1] = ACCENT[1]; pixels[idx+2] = ACCENT[2]; pixels[idx+3] = edgeA;
        } else {
            // Background fill
            pixels[idx] = BG[0]; pixels[idx+1] = BG[1]; pixels[idx+2] = BG[2]; pixels[idx+3] = alpha;
        }
    }
}

// ── PNG BUILDER ───────────────────────────────────────────────────────────────
function pngChunk(type, data) {
    const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type);
    const crcIn   = Buffer.concat([typeBuf, data]);
    const crcBuf  = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcIn));
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA

// Interleave filter byte (0 = None) before each row
const rawRows = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
    rawRows[y * (SIZE * 4 + 1)] = 0;
    pixels.copy(rawRows, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const idat = zlib.deflateSync(rawRows, { level: 6 });

const PNG = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
]);

// ── ICO BUILDER (PNG-compressed, Win Vista+ format) ──────────────────────────
// Single 256×256 entry wrapping the PNG bytes directly.
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // type: 1 = icon
icoHeader.writeUInt16LE(1, 4); // image count: 1

const icoDir = Buffer.alloc(16);
icoDir[0] = 0;   // width  (0 means 256)
icoDir[1] = 0;   // height (0 means 256)
icoDir[2] = 0;   // palette colors
icoDir[3] = 0;   // reserved
icoDir.writeUInt16LE(1,  4);           // planes
icoDir.writeUInt16LE(32, 6);           // bits per pixel
icoDir.writeUInt32LE(PNG.length, 8);   // data size
icoDir.writeUInt32LE(22, 12);          // data offset (6 + 16)

const ICO = Buffer.concat([icoHeader, icoDir, PNG]);

// ── WRITE ─────────────────────────────────────────────────────────────────────
const assetsDir = path.join(__dirname, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

fs.writeFileSync(path.join(assetsDir, 'icon.png'), PNG);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ICO);

console.log('assets/icon.png written (' + PNG.length + ' bytes)');
console.log('assets/icon.ico written (' + ICO.length + ' bytes)');
