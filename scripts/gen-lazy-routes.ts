// Writes the sources of a lazy-routes example: an eager shell and home page, lazily loaded routes and a shared UI
// library, with seeded pseudo-random `css` props so every run writes the same files.
//
//   node scripts/gen-lazy-routes.ts                    # the committed 8-route app
//   node scripts/gen-lazy-routes.ts --routes 32 --out examples/lazy-routes-32/src
//
// `lazyRoutes()` returns the same app as data, from which scripts/compare writes it for other styling libraries.
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

export type StyleValue = string | number;
// Keys in the order they are written: properties, pseudo-classes and pseudo-elements (`:hover`, `::backdrop`),
// `&`-prefixed selectors and `@media` queries, as nishiki's `css` prop takes them.
export type Style = { [key: string]: StyleValue | Style };
export type UiExport = { name: string; tag: string; style: Style; void: boolean };
export type UiModule = { file: string; exports: UiExport[] };
export type Element =
  | { kind: "box"; tag: string; style: Style; text: string }
  | { kind: "component"; name: string; void: boolean }
  // The route's `Panel`, given styles that override the component's own.
  | { kind: "panel"; style: Style; text: string };
export type RouteModule = { name: string; uses: UiModule[]; elements: Element[] };
export type Shell = {
  navLink: Style;
  layout: Style;
  aside: Style;
  brandRow: Style;
  brand: Style;
  nav: Style;
  main: Style;
  fallback: Style;
};
export type LazyRoutes = { ui: UiModule[]; home: RouteModule; routes: RouteModule[]; shell: Shell };

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The design system's declarations, interleaved so that the popular values of every property rank high,
// then drawn with Zipf-like weights.
const text = ["#1f2328", "#57606a", "#8c959f", "#0969da", "#1a7f37", "#cf222e", "#9a6700", "#8250df", "#ffffff"];
const bg = ["#ffffff", "#f6f8fa", "#eaeef2", "#ddf4ff", "#dafbe1", "#ffebe9", "#fff8c5", "#0969da", "#1f2328"];
const space = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48];
const groups: [string, StyleValue[]][] = [
  ["display", ["flex", "grid", "block", "inline-flex", "none"]],
  ["color", text],
  ["gap", [8, 12, 16, 4, 24, 32]],
  ["padding", space.slice(1)],
  ["margin", [0, "0 auto", 8, 16]],
  ["fontSize", [14, 16, 12, 20, 24, 32]],
  ["fontWeight", [600, 400, 500, 700]],
  ["background", bg],
  ["alignItems", ["center", "start", "end", "baseline"]],
  ["justifyContent", ["space-between", "center", "flex-end", "start"]],
  ["borderRadius", [6, 8, 12, 4, 999]],
  ["lineHeight", [1.5, 1.25, 1.75]],
  ["flexDirection", ["column", "row"]],
  ["border", ["1px solid #d0d7de", "none", "1px solid #eaeef2"]],
  ["paddingInline", [8, 12, 16, 24]],
  ["paddingBlock", [4, 8, 12, 16]],
  ["marginTop", [0, 8, 16, 24]],
  ["marginBottom", [0, 8, 16, 24]],
  ["width", ["100%", "auto"]],
  ["flexWrap", ["wrap"]],
  ["textAlign", ["left", "center", "right"]],
  ["overflow", ["hidden", "auto"]],
  ["whiteSpace", ["nowrap"]],
  ["textOverflow", ["ellipsis"]],
  ["boxShadow", ["0 1px 3px rgba(31,35,40,0.12)", "0 8px 24px rgba(140,149,159,0.2)"]],
  ["cursor", ["pointer"]],
  ["position", ["relative", "absolute", "sticky"]],
  ["flex", [1, "none"]],
  ["textTransform", ["uppercase"]],
  ["letterSpacing", ["0.02em"]],
  ["borderBottom", ["1px solid #d0d7de"]],
  ["minWidth", [0]],
];
const shared: [string, StyleValue][] = [];
for (let rank = 0; rank < 10; rank++) {
  for (const [key, values] of groups) {
    const value = values[rank];
    if (value !== undefined) shared.push([key, value]);
  }
}
const weights = shared.map((_, index) => 1 / Math.pow(index + 1, 0.9));
const totalWeight = weights.reduce((a, b) => a + b, 0);

function pickShared(rand: () => number): [string, StyleValue] {
  let r = rand() * totalWeight;
  for (let i = 0; i < shared.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return shared[i]!;
  }
  return shared.at(-1)!;
}

// Declarations no other route uses.
function routeSpecific(route: number, k: number): [string, StyleValue] {
  const n = route * 37 + k;
  const options: [string, StyleValue][] = [
    ["gridTemplateColumns", `repeat(${2 + (n % 5)}, minmax(${120 + n}px, 1fr))`],
    ["width", `${200 + n * 3}px`],
    ["height", `${48 + n * 2}px`],
    ["minHeight", `${160 + n}px`],
    ["maxWidth", `${480 + n * 4}px`],
    ["color", `hsl(${(n * 47) % 360} 60% 40%)`],
    ["background", `hsl(${(n * 29) % 360} 80% 96%)`],
    ["transform", `translateY(${(n % 9) - 4}px)`],
    ["aspectRatio", `${4 + (n % 5)} / 3`],
    ["borderLeft", `4px solid hsl(${(n * 53) % 360} 70% 50%)`],
    ["zIndex", 10 + n],
    ["opacity", ((n % 9) + 1) / 10],
    ["gridArea", `area${n}`],
    ["top", `${n}px`],
  ];
  return options[n % options.length]!;
}

const literal = (value: StyleValue) => (typeof value === "string" ? JSON.stringify(value) : String(value));
const property = (key: string) => (/^[a-zA-Z]+$/.test(key) ? key : JSON.stringify(key));

// A style object as source code, one level of nesting deep.
export function styleSource(style: Style): string {
  const body = Object.entries(style).map(([key, value]) => {
    if (typeof value === "object") {
      const inner = Object.entries(value).map(([k, v]) => `${k}: ${literal(v as StyleValue)}`);
      return `${property(key)}: { ${inner.join(", ")} }`;
    }
    return `${property(key)}: ${literal(value)}`;
  });
  return `{ ${body.join(", ")} }`;
}

function styleObject(rand: () => number, route: number, counter: { k: number }, specificRate: number): Style {
  const size = 3 + Math.floor(rand() * 5);
  const entries = new Map<string, StyleValue | Style>();
  for (let guard = 0; entries.size < size && guard < 50; guard++) {
    const [key, value] = rand() < specificRate ? routeSpecific(route, counter.k++) : pickShared(rand);
    if (!entries.has(key)) entries.set(key, value);
  }
  if (rand() < 0.15) {
    const [key, value] = pickShared(rand);
    entries.set(":hover", { [key]: value });
  }
  if (rand() < 0.1) {
    entries.set("@media (max-width: 768px)", { display: "block", padding: 8 + 4 * Math.floor(rand() * 3) });
  }
  return Object.fromEntries(entries);
}

// The shared component library. `users` names the lazy routes that import it by their base name, and `routes` by their
// full name; "entry" means the eager shell. `void` lists the exports that render void elements, which must not get
// children.
type Declaration = { name: string; tag: string; style: Style };
type Component = { users: string[]; routes?: Set<string>; void?: string[]; exports: Declaration[] };
const library: Record<string, Component> = {
  Button: {
    users: ["entry"],
    exports: [
      {
        name: "Button",
        tag: "button",
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          paddingInline: 12,
          paddingBlock: 8,
          border: "1px solid #d0d7de",
          borderRadius: 6,
          background: "#f6f8fa",
          color: "#1f2328",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          ":hover": { background: "#eaeef2" },
          "&:focus-visible": { outline: "2px solid #0969da", outlineOffset: 2 },
          "&[data-variant=primary]": { background: "#1f883d", color: "#ffffff", border: "none" },
        },
      },
    ],
  },
  Stack: {
    users: ["entry"],
    exports: [
      { name: "Stack", tag: "div", style: { display: "flex", flexDirection: "column", gap: 16 } },
      { name: "Row", tag: "div", style: { display: "flex", alignItems: "center", gap: 8 } },
    ],
  },
  Text: {
    users: ["entry"],
    exports: [
      { name: "Text", tag: "p", style: { margin: 0, fontSize: 14, lineHeight: 1.5, color: "#1f2328" } },
      { name: "Muted", tag: "span", style: { fontSize: 12, color: "#57606a" } },
      {
        name: "Heading",
        tag: "h2",
        style: { margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.25, color: "#1f2328" },
      },
    ],
  },
  Card: {
    users: ["entry"],
    exports: [
      {
        name: "Card",
        tag: "section",
        style: {
          padding: 16,
          border: "1px solid #d0d7de",
          borderRadius: 8,
          background: "#ffffff",
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          "@media (max-width: 768px)": { padding: 12 },
        },
      },
    ],
  },
  // A breakpoint ladder that routes override at another breakpoint, so rules for one property under overlapping media
  // queries reach the page from different sheets in an order that depends on the routes visited.
  Panel: {
    users: ["entry"],
    exports: [
      {
        name: "Panel",
        tag: "section",
        style: {
          padding: 8,
          borderRadius: 8,
          background: "#f6f8fa",
          "@media (min-width: 40rem)": { padding: 12 },
          "@media (min-width: 64rem)": { padding: 16 },
        },
      },
    ],
  },
  Badge: {
    users: ["entry"],
    exports: [
      {
        name: "Badge",
        tag: "span",
        style: {
          display: "inline-flex",
          paddingInline: 8,
          paddingBlock: 4,
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 500,
          background: "#ddf4ff",
          color: "#0969da",
        },
      },
    ],
  },
  Table: {
    users: ["users", "billing", "reports"],
    exports: [
      { name: "Table", tag: "table", style: { width: "100%", borderCollapse: "collapse", fontSize: 14 } },
      {
        name: "Th",
        tag: "th",
        style: {
          textAlign: "left",
          paddingInline: 12,
          paddingBlock: 8,
          borderBottom: "1px solid #d0d7de",
          fontWeight: 600,
          color: "#57606a",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        },
      },
      {
        name: "Td",
        tag: "td",
        style: {
          paddingInline: 12,
          paddingBlock: 8,
          borderBottom: "1px solid #eaeef2",
          whiteSpace: "nowrap",
          ":hover": { background: "#f6f8fa" },
        },
      },
    ],
  },
  Avatar: {
    users: ["users", "inbox", "settings"],
    exports: [
      {
        name: "Avatar",
        tag: "span",
        style: {
          display: "inline-grid",
          placeItems: "center",
          width: 32,
          height: 32,
          borderRadius: 999,
          flex: "none",
          overflow: "hidden",
          border: "2px solid #ffffff",
          boxShadow: "0 0 0 1px #d0d7de",
        },
      },
    ],
  },
  Tabs: {
    users: ["settings", "analytics", "docs"],
    exports: [
      {
        name: "TabList",
        tag: "div",
        style: { display: "flex", gap: 4, borderBottom: "1px solid #d0d7de", marginBottom: 16 },
      },
      {
        name: "Tab",
        tag: "button",
        style: {
          paddingInline: 16,
          paddingBlock: 8,
          border: "none",
          background: "none",
          cursor: "pointer",
          fontSize: 14,
          color: "#57606a",
          borderBottom: "2px solid transparent",
          "&[aria-selected=true]": { color: "#1f2328", fontWeight: 600, borderBottom: "2px solid #fd8c73" },
          ":hover": { color: "#1f2328" },
        },
      },
    ],
  },
  Chart: {
    users: ["dashboard", "analytics", "reports"],
    exports: [
      {
        name: "ChartFrame",
        tag: "figure",
        style: {
          margin: 0,
          padding: 16,
          display: "grid",
          gridTemplateRows: "auto 240px",
          gap: 12,
          border: "1px solid #d0d7de",
          borderRadius: 8,
        },
      },
      {
        name: "Bar",
        tag: "div",
        style: {
          background: "#0969da",
          borderRadius: "4px 4px 0 0",
          transition: "height 200ms ease",
          ":hover": { background: "#0550ae" },
        },
      },
    ],
  },
  Modal: {
    users: ["billing", "inbox"],
    exports: [
      {
        name: "Dialog",
        tag: "dialog",
        style: {
          width: "min(560px, 90vw)",
          padding: 24,
          border: "none",
          borderRadius: 12,
          background: "#ffffff",
          boxShadow: "0 8px 24px rgba(140,149,159,0.2)",
          "::backdrop": { background: "rgba(31,35,40,0.5)" },
        },
      },
    ],
  },
  Form: {
    users: ["settings", "billing", "docs", "users"],
    void: ["Input"],
    exports: [
      {
        name: "Field",
        tag: "label",
        style: { display: "grid", gap: 4, fontSize: 14, fontWeight: 600, color: "#1f2328" },
      },
      {
        name: "Input",
        tag: "input",
        style: {
          paddingInline: 12,
          paddingBlock: 8,
          border: "1px solid #d0d7de",
          borderRadius: 6,
          fontSize: 14,
          background: "#ffffff",
          color: "#1f2328",
          "&:focus": { outline: "2px solid #0969da", borderColor: "#0969da" },
          "&::placeholder": { color: "#8c959f" },
        },
      },
    ],
  },
  Pagination: {
    users: ["users", "reports"],
    exports: [
      { name: "Pager", tag: "nav", style: { display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 16 } },
      {
        name: "PageLink",
        tag: "a",
        style: {
          minWidth: 32,
          paddingInline: 8,
          paddingBlock: 4,
          textAlign: "center",
          borderRadius: 6,
          color: "#0969da",
          "&[aria-current=page]": { background: "#0969da", color: "#ffffff" },
        },
      },
    ],
  },
};

const navLink: Style = {
  display: "block",
  paddingInline: 12,
  paddingBlock: 8,
  borderRadius: 6,
  color: "#1f2328",
  textDecoration: "none",
  ":hover": { background: "#eaeef2" },
  "&[aria-current=page]": { background: "#ddf4ff", color: "#0969da", fontWeight: 600 },
};

const shellStyles = {
  layout: {
    display: "grid",
    gridTemplateColumns: "240px 1fr",
    minHeight: "100vh",
    fontFamily: "system-ui",
    "@media (max-width: 768px)": { display: "block" },
  },
  aside: { padding: 16, borderRight: "1px solid #d0d7de", background: "#f6f8fa" },
  brandRow: { justifyContent: "space-between", marginBottom: 16 },
  brand: { fontSize: 16 },
  nav: { display: "grid", gap: 4 },
  main: { padding: 24, minWidth: 0 },
  fallback: { color: "#57606a" },
} satisfies Omit<Shell, "navLink">;

const baseRoutes = ["dashboard", "users", "settings", "billing", "analytics", "reports", "inbox", "docs"];
const baseOf = (name: string) => name.replace(/\d+$/, "");

const tags = ["div", "section", "header", "span", "p", "ul", "li", "aside", "article", "footer"];

export function lazyRoutes({
  routes: routeCount,
  elements: elementCount,
}: {
  routes: number;
  elements: number;
}): LazyRoutes {
  for (const [name, value] of [
    ["routes", routeCount],
    ["elements", elementCount],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer, got ${value}`);
  }
  const components: Record<string, Component> = { ...library };
  const routes = Array.from({ length: routeCount }, (_, i) =>
    i < baseRoutes.length ? baseRoutes[i]! : `${baseRoutes[i % baseRoutes.length]}${Math.floor(i / baseRoutes.length)}`,
  );

  // Beyond the eight hand-picked routes, an app's components follow a long tail: a few that most routes use, then
  // many that one or two routes use. The 8-route app keeps only the library above, so its sources stay as committed.
  if (routeCount > baseRoutes.length) {
    const rand = mulberry32(7);
    // Exactly `share` of the routes, so that every app size has the same distribution rather than a random draw's.
    const sample = (share: number) => {
      const shuffled = routes.map((name) => [rand(), name] as const).sort(([a], [b]) => a - b);
      return new Set(shuffled.slice(0, Math.round(share * routes.length)).map(([, name]) => name));
    };
    const popular: [name: string, share: number, exports: Declaration[]][] = [
      [
        "PageHeader",
        0.9,
        [
          {
            name: "PageHeader",
            tag: "header",
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              paddingBlock: 16,
              borderBottom: "1px solid #d0d7de",
              marginBottom: 24,
              position: "sticky",
              top: 0,
              background: "#ffffffee",
              backdropFilter: "blur(8px)",
              zIndex: 5,
              "@media (max-width: 768px)": { flexDirection: "column", alignItems: "start" },
            },
          },
          {
            name: "PageTitle",
            tag: "h1",
            style: { margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" },
          },
        ],
      ],
      [
        "Toolbar",
        0.7,
        [
          {
            name: "Toolbar",
            tag: "div",
            style: {
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              padding: 8,
              borderRadius: 8,
              background: "#f6f8fa",
              border: "1px solid #eaeef2",
            },
          },
          { name: "ToolbarSpacer", tag: "span", style: { flex: 1, minWidth: 16 } },
        ],
      ],
      [
        "FilterBar",
        0.5,
        [
          {
            name: "FilterBar",
            tag: "form",
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 16,
              "@media (max-width: 768px)": { gridTemplateColumns: "1fr" },
            },
          },
          {
            name: "Chip",
            tag: "button",
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              paddingInline: 10,
              paddingBlock: 2,
              borderRadius: 999,
              border: "1px solid #d0d7de",
              background: "#ffffff",
              fontSize: 12,
              cursor: "pointer",
              "&[aria-pressed=true]": { background: "#ddf4ff", borderColor: "#54aeff", color: "#0969da" },
            },
          },
        ],
      ],
      [
        "EmptyState",
        0.35,
        [
          {
            name: "EmptyState",
            tag: "div",
            style: {
              display: "grid",
              placeItems: "center",
              gap: 8,
              paddingBlock: 48,
              paddingInline: 24,
              textAlign: "center",
              color: "#57606a",
              border: "1px dashed #d0d7de",
              borderRadius: 12,
            },
          },
        ],
      ],
    ];
    for (const [name, share, exports] of popular) components[name] = { users: [], routes: sample(share), exports };
    for (let index = 0; index < Math.floor(routeCount / 2); index++) {
      const pick = () => routes[Math.floor(rand() * routes.length)]!;
      const users = new Set([pick(), ...(rand() < 0.3 ? [pick()] : [])]);
      const tag = ["section", "div", "aside", "figure"][index % 4]!;
      const styles = Array.from({ length: 2 }, (_, part) =>
        styleObject(rand, routeCount + 1 + index * 2 + part, { k: 0 }, 0.6),
      );
      components[`Widget${index}`] = {
        users: [],
        routes: users,
        exports: [
          { name: `Widget${index}`, tag, style: styles[0]! },
          { name: `Widget${index}Item`, tag: "div", style: styles[1]! },
        ],
      };
    }
  }

  const ui = new Map<string, UiModule>(
    Object.entries(components).map(([file, { exports, void: voids = [] }]) => [
      file,
      { file, exports: exports.map((declaration) => ({ ...declaration, void: voids.includes(declaration.name) })) },
    ]),
  );
  const voidExports = new Set(Object.values(components).flatMap((component) => component.void ?? []));
  const component = (name: string): Element => ({ kind: "component", name, void: voidExports.has(name) });

  const routeModule = (name: string, seed: number, count: number, specificRate: number): RouteModule => {
    const rand = mulberry32(1000 + seed);
    const counter = { k: 0 };
    const uses = Object.entries(components)
      .filter(
        ([, component]) =>
          component.users.includes(baseOf(name)) || component.users.includes("entry") || component.routes?.has(name),
      )
      .map(([file]) => ui.get(file)!);
    const names = uses.flatMap((module) => module.exports.map((declaration) => declaration.name));
    const rendered = new Set<string>();
    const elements: Element[] = [];
    for (let i = 0; i < count; i++) {
      const tag = tags[Math.floor(rand() * tags.length)]!;
      elements.push({ kind: "box", tag, style: styleObject(rand, seed, counter, specificRate), text: `${name} ${i}` });
      if (i % 4 === 0) {
        const picked = names[Math.floor(rand() * names.length)]!;
        rendered.add(picked);
        elements.push(component(picked));
      }
    }
    const breakpoint = ["40rem", "48rem", "64rem"][seed % 3];
    elements.push({
      kind: "panel",
      style: { [`@media (min-width: ${breakpoint})`]: { padding: 12 + (seed % 4) * 4 } },
      text: `${name} panel`,
    });
    rendered.add("Panel");
    // Every imported component renders at least once, so no bundler drops an import as unused.
    for (const name of names) if (!rendered.has(name)) elements.push(component(name));
    return { name, uses, elements };
  };

  return {
    ui: [...ui.values()],
    routes: routes.map((name, index) => routeModule(name, index + 1, elementCount, 0.25)),
    home: routeModule("home", 0, 24, 0.2),
    shell: { navLink, ...shellStyles },
  };
}

// The app's modules for nishiki, keyed by their path relative to `src`.
export function nishikiSources(app: LazyRoutes): Map<string, string> {
  const files = new Map<string, string>();
  for (const module of app.ui) {
    const code = module.exports
      .map(({ name, tag, style }) => `export const ${name} = styled("${tag}", ${styleSource(style)});`)
      .join("\n");
    files.set(`ui/${module.file}.tsx`, `import { styled } from "@nishikijs/react";\n\n${code}\n`);
  }
  const element = (element: Element) => {
    switch (element.kind) {
      case "box":
        return `<${element.tag} css={${styleSource(element.style)}}>${element.text}</${element.tag}>`;
      case "component":
        return element.void ? `<${element.name} />` : `<${element.name}>${element.name}</${element.name}>`;
      case "panel":
        return `<Panel css={${styleSource(element.style)}}>${element.text}</Panel>`;
    }
  };
  const routeModule = (route: RouteModule) => {
    const imports = route.uses.map(
      (module) => `import { ${module.exports.map(({ name }) => name).join(", ")} } from "../ui/${module.file}.tsx";`,
    );
    const signature = route.name === "home" ? "export function Home()" : "export default function Route()";
    return `${imports.join("\n")}

${signature} {
  return (
    <Stack>
${route.elements.map(element).join("\n")}
    </Stack>
  );
}
`;
  };
  for (const route of app.routes) files.set(`routes/${route.name}.tsx`, routeModule(route));
  files.set("routes/home.tsx", routeModule(app.home));

  const { shell } = app;
  const names = app.routes.map((route) => route.name);
  files.set(
    "App.tsx",
    `import { lazy, startTransition, Suspense, useEffect, useState } from "react";
import { styled } from "@nishikijs/react";

import { Home } from "./routes/home.tsx";
import { Badge } from "./ui/Badge.tsx";
import { Row } from "./ui/Stack.tsx";

const routes = {
${names.map((name) => `${name}: lazy(() => import("./routes/${name}.tsx")),`).join("\n")}
};

const NavLink = styled("a", ${styleSource(shell.navLink)});

function useHash() {
  const [hash, setHash] = useState(() => location.hash.slice(1));
  useEffect(() => {
    // As routers do, a transition keeps the current route on screen until the next has loaded. Without one, React
    // shows the Suspense fallback and holds it for at least 300 ms, which would hide how long loading takes.
    const update = () => startTransition(() => setHash(location.hash.slice(1)));
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const Route = Object.hasOwn(routes, hash) ? routes[hash as keyof typeof routes] : undefined;
  return (
    <div css={${styleSource(shell.layout)}}>
      <aside css={${styleSource(shell.aside)}}>
        <Row css={${styleSource(shell.brandRow)}}>
          <strong css={${styleSource(shell.brand)}}>Acme</strong>
          <Badge>beta</Badge>
        </Row>
        <nav css={${styleSource(shell.nav)}}>
          <NavLink href="#" aria-current={Route ? undefined : "page"}>home</NavLink>
${names.map((name) => `<NavLink href="#${name}" aria-current={hash === "${name}" ? "page" : undefined}>${name}</NavLink>`).join("\n")}
        </nav>
      </aside>
      <main css={${styleSource(shell.main)}}>
        <Suspense fallback={<p css={${styleSource(shell.fallback)}}>Loading…</p>}>{Route ? <Route /> : <Home />}</Suspense>
      </main>
    </div>
  );
}
`,
  );
  files.set(
    "main.tsx",
    `import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(<App />);
`,
  );
  return files;
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dirname, "..");
  const { values } = parseArgs({
    options: {
      routes: { type: "string", default: "8" },
      elements: { type: "string", default: "40" },
      out: { type: "string", default: path.join(root, "examples/lazy-routes/src") },
    },
  });
  const files = nishikiSources(lazyRoutes({ routes: Number(values.routes), elements: Number(values.elements) }));

  // `--out` may name a directory that holds other files, so only the modules this script writes are replaced: every
  // `.tsx` in `ui/` and `routes/`, which also drops those of an earlier run with more routes, plus `App.tsx` and
  // `main.tsx`, which are overwritten.
  const src = path.resolve(values.out);
  for (const dir of ["ui", "routes"]) {
    mkdirSync(path.join(src, dir), { recursive: true });
    for (const entry of readdirSync(path.join(src, dir), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".tsx")) rmSync(path.join(src, dir, entry.name));
    }
  }
  for (const [file, code] of files) writeFileSync(path.join(src, file), code);

  // Committed sources follow the repository's style. `vp fmt` refuses git-ignored paths, which nobody reads anyway, and
  // paths outside the repository, where `git check-ignore` fails rather than answering 1.
  const committable = spawnSync("git", ["check-ignore", "--quiet", src], { cwd: root }).status === 1;
  if (committable) {
    // On Windows `vp` is a .cmd shim, which Node only runs through a shell.
    const fmt = spawnSync("vp", ["fmt", src], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    if (fmt.status !== 0) throw fmt.error ?? new Error(`vp fmt exited with ${fmt.status}`);
  }
}
