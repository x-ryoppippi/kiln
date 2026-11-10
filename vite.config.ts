import { defineConfig } from "vite-plus";

export default defineConfig({
  // Run through `vp run <task>` so results are cached in node_modules/.vite/task-cache,
  // keyed on the files each command reads; direct `vp check` / `vp test` bypass the cache.
  run: {
    tasks: {
      check: "vp check",
      test: "vp test",
    },
  },
  fmt: {
    printWidth: 120,
    ignorePatterns: [
      // A gitignored symlink the dev shell regenerates; reading it would invalidate the `check` task cache.
      ".pre-commit-config.yaml",
    ],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  test: {
    root: import.meta.dirname,
    fsModuleCache: true,
    include: ["packages/*/test/**/*.test.{ts,tsx}"],
  },
});
