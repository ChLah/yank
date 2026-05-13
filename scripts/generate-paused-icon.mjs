import sharp from 'sharp';

const SRC = 'src-tauri/icons/32x32.png';
const DST = 'src-tauri/icons/32x32-paused.png';
const GREY = { r: 0x9c, g: 0xa3, b: 0xaf };

const src = sharp(SRC).ensureAlpha();
const { width, height } = await src.metadata();
const alpha = await src.clone().extractChannel('alpha').raw().toBuffer();

const rgba = Buffer.alloc(width * height * 4);
for (let i = 0; i < width * height; i++) {
  rgba[i * 4 + 0] = GREY.r;
  rgba[i * 4 + 1] = GREY.g;
  rgba[i * 4 + 2] = GREY.b;
  rgba[i * 4 + 3] = alpha[i];
}

await sharp(rgba, { raw: { width, height, channels: 4 } })
  .png()
  .toFile(DST);

console.log(`Wrote ${DST} (${width}x${height})`);
