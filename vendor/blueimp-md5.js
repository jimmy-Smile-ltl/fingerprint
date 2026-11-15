/**
 * ESM wrapper for the vendored blueimp-md5 UMD build.
 *
 * `md5.min.js` is loaded as a classic script before this module and exposes
 * `window.md5`. Keeping the wrapper separate lets `all_fp.js` use a normal
 * `import md5 from 'blueimp-md5'` through the page's import map, without
 * depending on an external CDN at runtime.
 *
 * The filename ends in `.js` (not `.mjs`) so simple static servers such as
 * Python's http.server serve it with a JavaScript MIME type.
 */
const md5 = globalThis.md5;

if (typeof md5 !== 'function') {
  throw new Error('blueimp-md5 UMD bundle was not loaded before the ESM wrapper');
}

export default md5;
