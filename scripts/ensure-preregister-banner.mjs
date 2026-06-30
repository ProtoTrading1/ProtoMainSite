/**
 * Copy a user-uploaded banner from Cursor uploads into public/ for deploy.
 * Drop your banner image in .cursor/projects/workspace/uploads/ as .jpg/.png/.webp
 * or place it directly at public/pre-register-banner.jpg
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'public', 'pre-register-banner.jpg');
const uploads = path.join(process.env.HOME || '', '.cursor/projects/workspace/uploads');

if (fs.existsSync(dest)) {
  console.log('pre-register banner: using public/pre-register-banner.jpg');
  process.exit(0);
}

if (!fs.existsSync(uploads)) {
  console.warn('pre-register banner: missing public/pre-register-banner.jpg (add the banner file before deploy)');
  process.exit(0);
}

const image = fs.readdirSync(uploads).find((f) => /\.(jpe?g|png|webp)$/i.test(f));
if (!image) {
  console.warn('pre-register banner: missing public/pre-register-banner.jpg (add the banner file before deploy)');
  process.exit(0);
}

fs.copyFileSync(path.join(uploads, image), dest);
console.log(`pre-register banner: copied uploads/${image} -> public/pre-register-banner.jpg`);
