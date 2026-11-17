import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  // The other apps ship no reset either.
  preflight: false,
  include: [`./apps/${process.env.ROUTES ?? "8"}/src/**/*.tsx`],
  outdir: "styled-system",
  jsxFramework: "react",
});
