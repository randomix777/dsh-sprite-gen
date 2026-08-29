/**
 * Builds the browser client bundle for dsh-sprite-gen.
 *
 * Transforms `src/client/index.js` (ESM) into the DSH loader lazy-CJS factory
 * artifact written to `lib/client.js`. The output matches the format produced
 * by DSH's `tsdown.client` bundle (see packages/client/tsdown.client.ts):
 *
 *   window.__ModuleLoader__.load({
 *     id: "<name>",
 *     factory: (require) => { ... require("react") ... return module.exports; }
 *   });
 *
 * Usage: node scripts/build-client.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const SRC = path.join(root, 'src', 'client', 'index.js');
const OUT = path.join(root, 'lib', 'client.js');

/** Loader entry name; must match the package identity DSH scans for. */
const ID = 'dsh-sprite-gen';

function build() {
  let src = readFileSync(SRC, 'utf8');

  // Rewrite the react import into a require() available inside the factory.
  src = src.replace(
    /import\s*\{[^}]*\}\s*from\s*['"]react['"];/,
    'const { createElement: h, useState, useEffect } = require("react");'
  );

  // Turn ESM exports into module.exports assignments for the CJS factory.
  const exportedNames = [];
  src = src.replace(/export\s*\{([^}]*)\};/g, (m, names) => {
    names.split(',').forEach((n) => {
      const id = n.trim().split(/\s+as\s+/)[0].trim();
      if (id) exportedNames.push(id);
    });
    return '';
  });
  src = src.replace(/export\s+const\s+(\w+)/g, (m, id) => {
    exportedNames.push(id);
    return `const ${id}`;
  });

  const exportLines = [...new Set(exportedNames)]
    .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n))
    .map((n) => `\texports.${n} = ${n};`)
    .join('\n');

  const body = src.trim();

  const bundle = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(ID)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${body}
${exportLines}
\t\treturn module.exports;
\t}
});
`;

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, bundle, 'utf8');
  console.log(`[build-client] wrote ${path.relative(root, OUT)} (${bundle.length} bytes)`);
}

build();
