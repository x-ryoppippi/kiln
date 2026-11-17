// Writes the apps a compared library builds: the lazy-routes app in bench/compare/<library>/apps/<routes>/, one per
// app size, and the stress page in apps/stress/.
//
//   node scripts/compare/generate.ts styled-components
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { lazyRoutes } from "../gen-lazy-routes.ts";
import { emit, LIBRARIES, type LibraryName } from "./emit.ts";
import { stressSources } from "./stress.ts";

export const SIZES = [8, 32] as const;

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>lazy-routes</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

if (import.meta.main) {
  const name = process.argv[2];
  if (!name || !Object.hasOwn(LIBRARIES, name)) {
    throw new Error(`usage: generate.ts <${Object.keys(LIBRARIES).join("|")}>`);
  }
  const apps = path.resolve(import.meta.dirname, "../../bench/compare", name, "apps");
  rmSync(apps, { recursive: true, force: true });
  const write = (app: string, files: Map<string, string>) => {
    files.set("../index.html", html);
    for (const [file, code] of files) {
      const target = path.join(apps, app, "src", file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, code);
    }
  };
  for (const routes of SIZES)
    write(String(routes), emit(LIBRARIES[name as LibraryName], lazyRoutes({ routes, elements: 40 })));
  write("stress", stressSources(name));
}
