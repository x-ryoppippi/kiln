import { defineConfig } from "vite-plus";

// Next.js reads back what it wrote to .next and regenerates next-env.d.ts, but neither is an input.
const cache = { input: [{ auto: true }, "!.next/**", "!next-env.d.ts"] };

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: "next build",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache,
      },
      "build:webpack": {
        command: "next build --webpack",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache,
      },
      "build:extract": {
        command: "KILN_EXTRACT=1 next build --webpack",
        dependsOn: [{ task: "build", from: ["dependencies", "devDependencies"] }],
        cache,
      },
    },
  },
});
