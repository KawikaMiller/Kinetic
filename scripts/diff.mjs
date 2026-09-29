// Compare two screenshot sets pixel by pixel. No extra dependencies: the PNGs are
// decoded and compared on a canvas inside the headless browser.
//
//   npm run diff -- before-frames after            # every PNG present in both sets
//   npm run diff -- before-frames after sorting    # only files starting with these ids
//
// Writes a red-overlay image for every changed file to .smoke/diff-<a>-<b>/.
// Exit code 1 if any deterministic (@<frame>) shot changed; @live shots are
// timing-dependent, so they're reported but never fail the run.
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { findBrowser, OUT_DIR, outPath, parseArgs } from './lib/browser.mjs';

const TOLERANCE = 8; // per-channel difference ignored as rendering noise

const { positional } = parseArgs();
const [labelA, labelB, ...only] = positional;
if (!labelA || !labelB) {
  console.error('usage: npm run diff -- <labelA> <labelB> [id ...]');
  process.exit(2);
}
const dirA = path.join(OUT_DIR, labelA);
const dirB = path.join(OUT_DIR, labelB);
const files = fs
  .readdirSync(dirA)
  .filter((f) => f.endsWith('.png') && fs.existsSync(path.join(dirB, f)))
  .filter((f) => !only.length || only.some((id) => f === `${id}.png` || f.startsWith(`${id}@`)))
  .sort();

const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
let failed = 0;

for (const file of files) {
  const result = await page.evaluate(
    async (a, b, tolerance) => {
      const load = (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = Math.max(ia.width, ib.width);
      const h = Math.max(ia.height, ib.height);
      const pixels = (img) => {
        const c = new OffscreenCanvas(w, h);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const pa = pixels(ia);
      const pb = pixels(ib);
      const out = new OffscreenCanvas(w, h);
      const octx = out.getContext('2d');
      octx.globalAlpha = 0.35;
      octx.drawImage(ib, 0, 0);
      const overlay = octx.getImageData(0, 0, w, h);
      let changed = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.max(
          Math.abs(pa[i] - pb[i]),
          Math.abs(pa[i + 1] - pb[i + 1]),
          Math.abs(pa[i + 2] - pb[i + 2]),
          Math.abs(pa[i + 3] - pb[i + 3]),
        );
        if (d > tolerance) {
          changed++;
          overlay.data.set([255, 0, 64, 255], i);
        }
      }
      octx.putImageData(overlay, 0, 0);
      const blob = await out.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (const byte of bytes) bin += String.fromCharCode(byte);
      return {
        sizeMatch: ia.width === ib.width && ia.height === ib.height,
        size: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}`,
        changed,
        pct: (changed / (w * h)) * 100,
        overlay: changed ? btoa(bin) : null,
      };
    },
    dataUrl(path.join(dirA, file)),
    dataUrl(path.join(dirB, file)),
    TOLERANCE,
  );

  const live = file.includes('@live') || !file.includes('@');
  const identical = result.changed === 0 && result.sizeMatch;
  if (!identical && !live) failed++;
  if (result.overlay) fs.writeFileSync(outPath(`diff-${labelA}-${labelB}`, file), Buffer.from(result.overlay, 'base64'));
  const status = identical ? 'same   ' : live ? 'live≠  ' : 'CHANGED';
  const size = result.sizeMatch ? '' : ` size ${result.size}`;
  console.log(`${status} ${file.padEnd(40)} ${result.pct.toFixed(3)}%${size}`);
}
await browser.close();
console.log(`\n${files.length - failed}/${files.length} deterministic shots unchanged`);
process.exit(failed ? 1 : 0);
