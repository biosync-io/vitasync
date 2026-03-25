import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SVG_PATH = join(ROOT, "src", "app", "icon.svg");
const OUT_DIR = join(ROOT, "public", "icons");

const svgBuffer = readFileSync(SVG_PATH);
const BG_COLOR = { r: 99, g: 102, b: 241, alpha: 1 }; // #6366f1

const standardIcons = [
  { name: "vitasync-72.png", size: 72 },
  { name: "vitasync-180.png", size: 180 },
  { name: "vitasync-192.png", size: 192 },
  { name: "vitasync-512.png", size: 512 },
];

const maskableIcons = [
  { name: "vitasync-maskable-192.png", size: 192 },
  { name: "vitasync-maskable-512.png", size: 512 },
];

async function generateStandard({ name, size }) {
  await sharp(svgBuffer, { density: Math.round((72 * size) / 32) })
    .resize(size, size)
    .png()
    .toFile(join(OUT_DIR, name));
  console.log(`✓ ${name} (${size}×${size})`);
}

async function generateMaskable({ name, size }) {
  // Render the SVG at 60% of the target size, then composite onto a solid background
  const innerSize = Math.round(size * 0.6);

  const inner = await sharp(svgBuffer, {
    density: Math.round((72 * innerSize) / 32),
  })
    .resize(innerSize, innerSize)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite([
      {
        input: inner,
        left: Math.round((size - innerSize) / 2),
        top: Math.round((size - innerSize) / 2),
      },
    ])
    .png()
    .toFile(join(OUT_DIR, name));

  console.log(`✓ ${name} (${size}×${size}, maskable)`);
}

console.log("Generating PWA icons...\n");

await Promise.all([
  ...standardIcons.map(generateStandard),
  ...maskableIcons.map(generateMaskable),
]);

console.log(`\nDone — 6 icons written to ${OUT_DIR}`);
