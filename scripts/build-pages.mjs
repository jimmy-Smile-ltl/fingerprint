/**
 * Build a self-contained static bundle for Cloudflare Pages (or any static host).
 *
 *   node scripts/build-pages.mjs
 *
 * Output:
 *   dist/index.html      ← the demo page (root entry)
 *   dist/test_fp.html    ← same page, keeps the documented URL
 *   dist/all_fp.js
 *   dist/vendor/         ← local blueimp-md5 (no CDN dependency)
 *   dist/robots.txt      ← crawler rules
 *   dist/sitemap.xml     ← canonical URL
 *   dist/og-image.png    ← Open Graph / Twitter card
 *   dist/_headers        ← Cloudflare Pages security/cache headers
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
mkdirSync(dist, { recursive: true });

// The page and its ESM dependencies.
cpSync(join(root, 'test_fp.html'), join(dist, 'index.html'));
cpSync(join(root, 'test_fp.html'), join(dist, 'test_fp.html'));
cpSync(join(root, 'all_fp.js'), join(dist, 'all_fp.js'));
cpSync(join(root, 'supplemental_fp.js'), join(dist, 'supplemental_fp.js'));

// Keep the demo self-contained: no esm.sh / CDN resolution at runtime.
cpSync(join(root, 'vendor'), join(dist, 'vendor'), { recursive: true });

// Cloudflare Pages metadata.
cpSync(join(root, 'deploy', '_headers'), join(dist, '_headers'));

// SEO: crawler rules, sitemap and social preview.
cpSync(join(root, 'deploy', 'robots.txt'), join(dist, 'robots.txt'));
cpSync(join(root, 'deploy', 'sitemap.xml'), join(dist, 'sitemap.xml'));
cpSync(join(root, 'docs', 'og-image.png'), join(dist, 'og-image.png'));

console.log('[build-pages] dist/ ready');
console.log('  index.html, test_fp.html, all_fp.js, supplemental_fp.js, vendor/, robots.txt, sitemap.xml, og-image.png, _headers');
