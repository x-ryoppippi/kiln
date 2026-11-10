import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

export type Served = { cssGzip: number; cssRequests: number };
export type Server = {
  url: string;
  inFlight: () => number;
  // What was served since the last call.
  take: () => Served;
  close: () => Promise<void>;
};

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// Serves a build like a static host: gzip at level 9, as the size columns assume, and `index.html` for any
// extensionless path that is not a file, as a client router needs. It counts the CSS it sends, which is what the
// browser transferred, without headers.
export async function serve(dir: string): Promise<Server> {
  const cache = new Map<string, { body: Buffer; gzip: Buffer }>();
  const fileOf = async (file: string) => {
    let entry = cache.get(file);
    if (!entry) {
      const body = await readFile(file);
      entry = { body, gzip: gzipSync(body, { level: 9 }) };
      cache.set(file, entry);
    }
    return entry;
  };
  const isFile = (file: string) =>
    stat(file).then(
      (stats) => stats.isFile(),
      () => false,
    );

  let inFlight = 0;
  let served: Served = { cssGzip: 0, cssRequests: 0 };
  const server = createServer(async (request, response) => {
    inFlight++;
    response.on("close", () => inFlight--);
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    let file = path.join(dir, pathname);
    if (!file.startsWith(dir + path.sep) && file !== dir) {
      response.writeHead(403).end();
      return;
    }
    if (!(await isFile(file))) {
      if (path.extname(pathname)) {
        response.writeHead(404).end();
        return;
      }
      file = path.join(dir, "index.html");
    }
    const { body, gzip } = await fileOf(file);
    const compress = /\bgzip\b/.test(request.headers["accept-encoding"] ?? "");
    const sent = compress ? gzip : body;
    if (path.extname(file) === ".css") {
      served.cssGzip += sent.length;
      served.cssRequests++;
    }
    response.writeHead(200, {
      "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "content-length": sent.length,
      ...(compress ? { "content-encoding": "gzip" } : {}),
    });
    response.end(sent);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("the benchmark server has no TCP address");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    inFlight: () => inFlight,
    take: () => {
      const taken = served;
      served = { cssGzip: 0, cssRequests: 0 };
      return taken;
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
