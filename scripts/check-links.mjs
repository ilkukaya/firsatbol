/**
 * Internal link & asset checker for the built site (dist/). Verifies that every internal
 * href/src points to an existing file, every page has exactly one <h1>, a <title>, a meta
 * description and a canonical, and that no secret-looking values leaked into the output.
 *   npm run build && npm run links
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = process.argv[2] ?? 'dist';
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
})(DIST);

const htmlFiles = files.filter((file) => file.endsWith('.html'));
const problems = [];
const resolveTarget = (url) => {
  const clean = decodeURI(url.split('#')[0].split('?')[0]);
  if (clean === '' || clean === '/') return join(DIST, 'index.html');
  const direct = join(DIST, clean);
  if (clean.endsWith('/')) return join(direct, 'index.html');
  return direct;
};

let links = 0;
const secrets = [process.env.FIRSATBUFIRSAT_API_KEY, process.env.ADMIN_TOKEN, process.env.BREVO_API_KEY].filter(
  (value) => value && value.length > 5,
);
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const page = '/' + relative(DIST, file).replace(/index\.html$/, '');
  for (const [, attr, url] of html.matchAll(/\s(href|src)="([^"]+)"/g)) {
    if (!url.startsWith('/') || url.startsWith('//')) continue;
    if (url.startsWith('/api/') || url.startsWith('/.netlify/')) continue;
    links += 1;
    const target = resolveTarget(url);
    if (!existsSync(target)) problems.push(`${page}: kırık ${attr} → ${url}`);
    else if (attr === 'href' && !url.includes('.') && !url.split('?')[0].endsWith('/')) problems.push(`${page}: sonda / eksik → ${url}`);
  }
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) problems.push(`${page}: ${h1} adet <h1>`);
  if (!/<title>[^<]{5,}<\/title>/.test(html)) problems.push(`${page}: <title> eksik`);
  if (!/<meta name="description" content="[^"]{50,}"/.test(html)) problems.push(`${page}: meta description eksik/kısa`);
  if (!/<link rel="canonical" href="https?:\/\/[^"]+"/.test(html)) problems.push(`${page}: canonical eksik`);
  if (!/<html lang="tr"/.test(html)) problems.push(`${page}: lang="tr" eksik`);
  for (const secret of secrets) if (html.includes(secret)) problems.push(`${page}: GİZLİ DEĞER SIZDI`);
  if (/apiKey=/i.test(html)) problems.push(`${page}: "apiKey=" içeren URL`);
  if (/lorem ipsum/i.test(html)) problems.push(`${page}: Lorem ipsum`);
}
for (const file of files.filter((f) => /\.(js|json|xml|txt)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  for (const secret of secrets) if (text.includes(secret)) problems.push(`${file}: GİZLİ DEĞER SIZDI`);
  if (/apiKey=/i.test(text)) problems.push(`${file}: "apiKey=" içeriyor`);
}

console.log(`${htmlFiles.length} HTML sayfası, ${links} iç bağlantı kontrol edildi.`);
if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} sorun bulundu.`);
  process.exit(1);
}
console.log('Sorun bulunamadı.');
