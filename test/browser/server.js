// A small web server for the browser test. It serves the test page, the bundled host, and the
// example modules below /wm/<id>/, the way a cockpit serves them.

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const HTTP_OK = 200;
const HTTP_NOT_MODIFIED = 304;
const HTTP_NOT_FOUND = 404;

/**
 * Every answer carries an ETag, and a request which names the ETag of the content gets a 304.
 * `requests` lists every path asked, `responses` every path with the status of its answer.
 *
 * @param {{ files: Record<string, string>, folders: Record<string, string>, virtual?: Record<string, string> }} options
 *   files: path -> file; folders: path prefix -> folder; virtual: path -> content, which a test may
 *   change while the server runs, for example to deploy a new build of a module
 */
export async function startServer({ files, folders, virtual = {} }) {
  const requests = [];
  const responses = [];
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    requests.push(path);
    const headers = (file, content) => ({
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      // The manifest has a fixed name, so it is never cached; the hashed files may be.
      'cache-control': path.endsWith('/bc-manifest.json') ? 'no-cache' : 'max-age=3600',
      etag: `"${createHash('sha256').update(content).digest('base64url').slice(0, 16)}"`,
    });
    const send = (file, content) => {
      const head = headers(file, content);
      const status = request.headers['if-none-match'] === head.etag ? HTTP_NOT_MODIFIED : HTTP_OK;
      responses.push([path, status]);
      response.writeHead(status, head).end(status === HTTP_OK ? content : undefined);
    };
    if (Object.hasOwn(virtual, path)) {
      send(path, virtual[path]);
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
      send(file, readFileSync(file));
    } catch {
      responses.push([path, HTTP_NOT_FOUND]);
      response.writeHead(HTTP_NOT_FOUND).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    responses,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
