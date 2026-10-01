import { createServer } from 'node:http';
import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const publicRoot = resolve(projectRoot, 'dist/public');
const port = 4181;
const host = '127.0.0.1';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

try {
  await access(resolve(publicRoot, 'index.html'), constants.R_OK);
} catch {
  console.error('Production static QA server requires dist/public/index.html. Build the production client first.');
  process.exit(1);
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${host}:${port}`);
  if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
    response.writeHead(404).end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }

  const relativePath = pathname.replace(/^\/+/, '');
  let filePath = resolve(publicRoot, relativePath);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) {
    response.writeHead(403).end();
    return;
  }

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    fileStat = null;
  }

  if (!fileStat?.isFile()) {
    const looksLikeAsset = extname(pathname) !== '';
    if (looksLikeAsset) {
      response.writeHead(404).end();
      return;
    }
    filePath = resolve(publicRoot, 'index.html');
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': contentTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream',
      'content-length': body.byteLength,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(port, host, () => {
  console.log(`Production static QA server listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}