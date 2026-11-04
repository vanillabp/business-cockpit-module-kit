// A small web server for the browser test. It serves the test page, the bundled host, and the
// example modules below /wm/<id>/, the way a cockpit serves them.

import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

/**
 * @param {{ files: Record<string, string>, folders: Record<string, string>, virtual?: Record<string, string> }} options
 *   files: path -> file; folders: path prefix -> folder; virtual: path -> content
 */
export async function startServer({ files, folders, virtual = {} }) {
  const requests = [];
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    requests.push(path);
    const headers = (file) => ({
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      // The manifest has a fixed name, so it is never cached; the hashed files may be.
      'cache-control': path.endsWith('/bc-manifest.json') ? 'no-cache' : 'max-age=3600',
    });
    if (Object.hasOwn(virtual, path)) {
      response.writeHead(200, headers(path)).end(virtual[path]);
      return;
    }
    let file = files[path];
    if (!file) {
      const prefix = Object.keys(folders).find((candidate) => path.startsWith(candidate));
      if (prefix) {
        const folder = folders[prefix];
        const candidate = normalize(join(folder, path.slice(prefix.length)));
        if (candidate.startsWith(folder + sep)) file = candidate;
      }
    }
    try {
      if (!file || !statSync(file).isFile()) throw new Error('not found');
      response.writeHead(200, headers(file)).end(readFileSync(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
