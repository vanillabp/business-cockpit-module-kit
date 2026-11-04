// Serves the example modules of the conformance test below /wm/<id>/, so a cockpit can load them.
// Register react-module and vue-module in your cockpit with the addresses this prints.
//
//   PORT=4173 node serve.mjs

import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const TYPES = { '.js': 'text/javascript', '.json': 'application/json' };
const folder = join(import.meta.dirname, 'wm');
const port = Number(process.env.PORT ?? 4173);

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = normalize(join(folder, path.replace(/^\/wm\//, '/')));
  try {
    if (!file.startsWith(folder + sep) || !statSync(file).isFile()) throw new Error('not found');
    response.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': file.endsWith('bc-manifest.json') ? 'no-cache' : 'max-age=3600',
      'access-control-allow-origin': '*',
    }).end(readFileSync(file));
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(port, () => {
  for (const id of ['react-module', 'vue-module']) console.log(`${id}: http://localhost:${port}/wm/${id}`);
});
