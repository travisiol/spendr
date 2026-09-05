// Static export: writes dist/ with every {{PLACEHOLDER}} resolved.
// The landing is fully static; /app still needs server.mjs for /api/*.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, render } from './lib/site.mjs';

const SRC = path.join(ROOT, 'src'), OUT = path.join(ROOT, 'dist');

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out;
}

await fs.rm(OUT, { recursive: true, force: true });
for (const file of await walk(SRC)) {
  const rel = path.relative(SRC, file);
  const dest = path.join(OUT, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (/\.(html|svg)$/.test(file)) await fs.writeFile(dest, render(await fs.readFile(file, 'utf8')));
  else await fs.copyFile(file, dest);
  console.log('  ', rel);
}
console.log('dist/ written');
