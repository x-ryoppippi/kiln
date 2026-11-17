// A page that mounts and updates many styled elements, written for each compared library, and its measurement in
// headless Chromium. Each element has static styles, a variant chosen by an attribute and a width computed at render
// time, written the way each library documents dynamic values: a value in the style object for runtime libraries,
// a CSS variable for those that compile styles ahead of time.
import path from "node:path";

import { launch, median, type Browser } from "../bench/browser.ts";
import { serve, type Server } from "../bench/serve.ts";

export const ELEMENTS = 1000;
const UPDATES = 5;

const base = {
  display: "inline-flex",
  alignItems: "center",
  margin: "2px",
  padding: "4px 8px",
  border: "1px solid #d0d7de",
  borderRadius: "4px",
  fontSize: "12px",
};
const variants = {
  a: { background: "#ddf4ff", color: "#0969da" },
  b: { background: "#dafbe1", color: "#1a7f37" },
  c: { background: "#ffebe9", color: "#cf222e" },
};
const object = (value: object) => JSON.stringify(value);
const selectors = Object.fromEntries(
  Object.entries(variants).map(([name, style]) => [`&[data-variant=${name}]`, style]),
);
const kebab = (property: string) => property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
const cssText = (style: Record<string, string>) =>
  Object.entries(style)
    .map(([property, value]) => `${kebab(property)}: ${value};`)
    .join(" ");

// `Cell` and `cell(i, variant, width)`, which renders one element.
const cells: Record<string, { imports: string; cell: string; css?: string; files?: Record<string, string> }> = {
  unstyled: {
    imports: "",
    cell: `const cell = (i: number, variant: string, _width: number) => <span key={i} data-variant={variant}>{i}</span>;`,
  },
  nishiki: {
    imports: `import { styled } from "@nishikijs/react";`,
    cell: `const Cell = styled("span", ${object({ ...base, ...selectors })});
const cell = (i: number, variant: string, width: number) => (
  <Cell key={i} data-variant={variant} css={{ width }}>{i}</Cell>
);`,
  },
  restyle: {
    imports: `import { styled } from "restyle";`,
    cell: `const Cell = styled("span", ${object({ ...base, ...selectors })});
const cell = (i: number, variant: string, width: number) => (
  <Cell key={i} data-variant={variant} css={{ width }}>{i}</Cell>
);`,
  },
  emotion: {
    imports: `import styled from "@emotion/styled";`,
    cell: `const Cell = styled("span")(${object({ ...base, ...selectors })});
const cell = (i: number, variant: string, width: number) => (
  <Cell key={i} data-variant={variant} css={{ width }}>{i}</Cell>
);`,
  },
  "styled-components": {
    imports: `import styled from "styled-components";`,
    cell: `const Cell = styled.span<{ $width: number }>((props) => ({ ...${object({ ...base, ...selectors })}, width: props.$width }));
const cell = (i: number, variant: string, width: number) => (
  <Cell key={i} data-variant={variant} $width={width}>{i}</Cell>
);`,
  },
  linaria: {
    imports: `import { styled } from "@linaria/react";`,
    cell: `const Cell = styled.span<{ $width: number }>\`
  ${cssText(base)}
  width: \${(props) => props.$width}px;
  ${Object.entries(variants)
    .map(([name, style]) => `&[data-variant=${name}] { ${cssText(style)} }`)
    .join("\n  ")}
\`;
const cell = (i: number, variant: string, width: number) => (
  <Cell key={i} data-variant={variant} $width={width}>{i}</Cell>
);`,
  },
  "vanilla-extract": {
    imports: `import { assignInlineVars } from "@vanilla-extract/dynamic";

import * as styles from "./cell.css.ts";`,
    cell: `const cell = (i: number, variant: string, width: number) => (
  <span key={i} data-variant={variant} className={styles.cell} style={assignInlineVars({ [styles.width]: \`\${width}px\` })}>{i}</span>
);`,
    files: {
      "cell.css.ts": `import { createVar, style } from "@vanilla-extract/css";

export const width = createVar();
export const cell = style({ ...${object(base)}, width, selectors: ${object(selectors)} });
`,
    },
  },
  stylex: {
    imports: `import * as stylex from "@stylexjs/stylex";`,
    cell: `const styles = stylex.create({
  cell: ${object(base)},
  ${Object.entries(variants)
    .map(([name, style]) => `${name}: ${object(style)},`)
    .join("\n  ")}
  width: (width: string) => ({ width }),
});
const cell = (i: number, variant: string, width: number) => (
  <span key={i} data-variant={variant} {...stylex.props(styles.cell, styles[variant as "a" | "b" | "c"], styles.width(\`\${width}px\`))}>{i}</span>
);`,
    css: "/* StyleX */\n",
  },
  panda: {
    imports: `import { styled } from "styled-system/jsx";`,
    cell: `const Cell = styled("span", { base: ${object({ ...base, width: "var(--width)", ...selectors })} });
const cell = (i: number, variant: string, width: number) => (
  <Cell key={i} data-variant={variant} style={{ "--width": \`\${width}px\` } as React.CSSProperties}>{i}</Cell>
);`,
    css: "@layer reset, base, tokens, recipes, utilities;\n",
  },
  tailwind: {
    imports: "",
    cell: `const cell = (i: number, variant: string, width: number) => (
  <span
    key={i}
    data-variant={variant}
    className="m-0.5 inline-flex w-(--width) items-center rounded-[4px] [border:1px_solid_#d0d7de] px-2 py-1 text-[12px] data-[variant=a]:bg-[#ddf4ff] data-[variant=a]:text-[#0969da] data-[variant=b]:bg-[#dafbe1] data-[variant=b]:text-[#1a7f37] data-[variant=c]:bg-[#ffebe9] data-[variant=c]:text-[#cf222e]"
    style={{ "--width": \`\${width}px\` } as React.CSSProperties}
  >
    {i}
  </span>
);`,
    css: `@layer theme, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);
@source "./";
`,
  },
};

// The stress page's files, keyed by their path relative to `src`.
export function stressSources(library: string): Map<string, string> {
  const spec = cells[library];
  if (!spec) throw new Error(`no stress page for ${library}`);
  const files = new Map<string, string>(Object.entries(spec.files ?? {}));
  files.set(
    "main.tsx",
    `import type React from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
${spec.imports}
${spec.css ? `import "./index.css";\n` : ""}
${spec.cell}

const VARIANTS = ["a", "b", "c"];

function Grid({ tick }: { tick: number }) {
  return <div>{Array.from({ length: ${ELEMENTS} }, (_, i) => cell(i, VARIANTS[(i + tick) % 3]!, 40 + ((i * 7 + tick * 13) % 50)))}</div>;
}

const root = createRoot(document.getElementById("root")!);
let tick = 0;
Object.assign(globalThis, {
  __stress: {
    mount: () => flushSync(() => root.render(<Grid tick={tick} />)),
    update: () => flushSync(() => root.render(<Grid tick={++tick} />)),
  },
});
`,
  );
  if (spec.css) files.set("index.css", spec.css);
  return files;
}

// `totalMs` is the wall time of the call and the style and layout it forces; Chromium's script counter leaves out
// script that DevTools starts, so the rest of the total is taken as script.
type Cost = { totalMs: number; styleMs: number; layoutMs: number };
export type Stress = { elements: number; runs: number; mount: Cost; update: Cost };

// Mounts the page's elements once and updates them UPDATES times, forcing style and layout after each, in a fresh
// browser context per run; an update's cost is the median of the run's updates.
export async function stressProbe(
  chrome: string,
  variants: { name: string; dir: string; suffix: string }[],
  runs: number,
): Promise<Map<string, Stress>> {
  const builds = variants.map((variant) => ({
    variant,
    out: path.resolve(
      import.meta.dirname,
      "../../bench/compare",
      variant.dir,
      `dist-stress${variant.suffix.replaceAll(":", "-")}`,
    ),
  }));
  const results = new Map(builds.map((build) => [build, { mount: [] as Cost[], update: [] as Cost[] }]));
  const servers = new Map<(typeof builds)[number], Server>();
  let browser: Browser | undefined;
  try {
    for (const build of builds) servers.set(build, await serve(build.out));
    browser = await launch(chrome);
    // A freshly started browser runs its first page markedly slower, so one page is thrown away.
    await (await browser.open(servers.get(builds[0]!)!.url)).close();
    for (let run = 0; run < runs; run++) {
      for (const build of builds) {
        process.stderr.write(`${build.variant.name}: stress run ${run + 1} of ${runs}\n`);
        const page = await browser.open(servers.get(build)!.url);
        const measure = async (call: string): Promise<Cost> => {
          const before = await page.metrics();
          const totalMs = await page.evaluate<number>(
            `(() => { const start = performance.now(); ${call}; document.body.getBoundingClientRect(); return performance.now() - start; })()`,
          );
          const after = await page.metrics();
          return { totalMs, styleMs: after.style - before.style, layoutMs: after.layout - before.layout };
        };
        results.get(build)!.mount.push(await measure("__stress.mount()"));
        const updates: Cost[] = [];
        for (let update = 0; update < UPDATES; update++) updates.push(await measure("__stress.update()"));
        results.get(build)!.update.push(medianCost(updates));
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    for (const server of servers.values()) await server.close();
  }
  return new Map(
    builds.map((build) => {
      const result = results.get(build)!;
      return [
        build.variant.name,
        { elements: ELEMENTS, runs, mount: medianCost(result.mount), update: medianCost(result.update) },
      ];
    }),
  );
}

function medianCost(costs: Cost[]): Cost {
  const of = (key: keyof Cost) => median(costs.map((cost) => cost[key]));
  return { totalMs: of("totalMs"), styleMs: of("styleMs"), layoutMs: of("layoutMs") };
}
