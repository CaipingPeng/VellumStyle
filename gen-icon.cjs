// 临时脚本：生成一张 512x512 纯色 PNG 占位图标（项目蓝 #1e6bb8）。
// 用 Node 内置 zlib，无需第三方依赖。生成后用 `npx tauri icon` 转全套。
const fs = require("fs");
const zlib = require("zlib");

const W = 512, H = 512;
const R = 0x1e, G = 0x6b, B = 0xb8, A = 0xff;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // color type RGBA
ihdr[10] = 0;  // compression
ihdr[11] = 0;  // filter
ihdr[12] = 0;  // interlace

// raw pixel data: each row prefixed with filter byte 0
const rowLen = 1 + W * 4;
const raw = Buffer.alloc(rowLen * H);
for (let y = 0; y < H; y++) {
  const off = y * rowLen;
  raw[off] = 0; // filter none
  for (let x = 0; x < W; x++) {
    const p = off + 1 + x * 4;
    raw[p] = R; raw[p + 1] = G; raw[p + 2] = B; raw[p + 3] = A;
  }
}
const idat = zlib.deflateSync(raw);

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

fs.writeFileSync("app-icon.png", png);
console.log("wrote app-icon.png", png.length, "bytes");
