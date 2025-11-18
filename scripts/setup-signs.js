#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_SOURCE_DIR = path.join(__dirname, '..', 'wikipedia_us_signs_png');
const DEFAULT_DEST_DIR = path.join(__dirname, '..', 'client', 'public', 'signs');
const DEFAULT_OUTPUT_FILE = path.join(__dirname, '..', 'client', 'src', 'data', 'sign-types.ts');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dryRun: false,
    noOverwrite: false,
    src: DEFAULT_SOURCE_DIR,
    dest: DEFAULT_DEST_DIR,
    output: DEFAULT_OUTPUT_FILE,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--no-overwrite') opts.noOverwrite = true;
    else if ((a === '--src' || a === '--source') && args[i + 1]) opts.src = args[++i];
    else if ((a === '--dest' || a === '--destination') && args[i + 1]) opts.dest = args[++i];
    else if ((a === '--output' || a === '--out') && args[i + 1]) opts.output = args[++i];
  }

  return opts;
}

function copyImages({ src, dest, dryRun = false, noOverwrite = false }) {
  if (!fs.existsSync(src)) {
    throw new Error(`Source directory not found: ${src}`);
  }

  ensureDir(dest);

  const files = fs.readdirSync(src);
  const imageFiles = files.filter((file) => file.toLowerCase().endsWith('.png'));

  const copied = [];
  for (const file of imageFiles) {
    const sourcePath = path.join(src, file);
    const destPath = path.join(dest, file);

    if (noOverwrite && fs.existsSync(destPath)) continue;

    if (!dryRun) {
      fs.copyFileSync(sourcePath, destPath);
    }
    copied.push(file);
  }

  return copied;
}

function generateSignTypes(imageFiles, outputPath, { dryRun = false } = {}) {
  ensureDir(path.dirname(outputPath));

  const signTypes = imageFiles.map((file) => {
    const id = file.replace(/\.png$/i, '');
    return { id, name: id, imagePath: `/signs/${file}` };
  });

  signTypes.sort((a, b) => a.id.localeCompare(b.id));

  const tsLines = [];
  tsLines.push('export interface SignType { id: string; name: string; imagePath: string; }');
  tsLines.push('export const SIGN_TYPES: SignType[] = [');
  for (const s of signTypes) {
    tsLines.push(`  { id: "${s.id}", name: "${s.name}", imagePath: "${s.imagePath}" },`);
  }
  tsLines.push('];');
  tsLines.push('\nconst SIGN_TYPE_MAP: Record<string, SignType> = Object.fromEntries(SIGN_TYPES.map(s => [s.id, s]));');
  tsLines.push('\nexport function getSignTypeById(id: string): SignType | undefined { return SIGN_TYPE_MAP[id]; }');

  const content = tsLines.join('\n');

  if (!dryRun) {
    fs.writeFileSync(outputPath, content, 'utf8');
  }

  return { count: signTypes.length };
}

function main() {
  const opts = parseArgs();

  try {
    const images = copyImages({ src: opts.src, dest: opts.dest, dryRun: opts.dryRun, noOverwrite: opts.noOverwrite });
    const result = generateSignTypes(images, opts.output, { dryRun: opts.dryRun });

    console.log(`Processed ${images.length} images, generated ${result.count} sign types.` + (opts.dryRun ? ' (dry-run)' : ''));
  } catch (err) {
    console.error('setup-signs failed:', err.message || err);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
