import { defineConfig } from "cf/config";

import { host, name } from "./site.ts";

// A static-assets Worker: `cf deploy dist` uploads the built site, with no Worker code of its own.
export default defineConfig({
  worker: {
    name: `${name}-docs`,
    compatibilityDate: "2026-11-01",
    assets: { notFoundHandling: "404-page" },
    domains: [host],
    // Pull requests get a URL to check the built site before it replaces the published one.
    previewUrls: true,
  },
});
