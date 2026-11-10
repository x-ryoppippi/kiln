// Regenerates examples/lazy-routes/src: an eager shell and home page, lazily loaded routes and a shared UI library,
// with seeded pseudo-random `css` props so every run writes the same files.
//
//   pnpm exec node scripts/gen-lazy-routes.ts  # the committed 8-route app
//   ROUTES=32 ELEMENTS=40 pnpm exec node scripts/gen-lazy-routes.ts
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const routeCount = Number(process.env.ROUTES ?? 8);
const elementCount = Number(process.env.ELEMENTS ?? 40);
for (const [name, value] of [
  ["ROUTES", routeCount],
  ["ELEMENTS", elementCount],
] as const) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer, got ${value}`);
}

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "examples/lazy-routes/src");
rmSync(src, { recursive: true, force: true });
mkdirSync(path.join(src, "ui"), { recursive: true });
mkdirSync(path.join(src, "routes"), { recursive: true });

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
const groups: [string, unknown[]][] = [
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
const shared: [string, unknown][] = [];
for (let rank = 0; rank < 10; rank++) {
  for (const [key, values] of groups) if (values[rank] !== undefined) shared.push([key, values[rank]]);
}
const weights = shared.map((_, index) => 1 / Math.pow(index + 1, 0.9));
const totalWeight = weights.reduce((a, b) => a + b, 0);

function pickShared(rand: () => number): [string, unknown] {
  let r = rand() * totalWeight;
  for (let i = 0; i < shared.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return shared[i]!;
  }
  return shared.at(-1)!;
}

// Declarations no other route uses.
function routeSpecific(route: number, k: number): [string, unknown] {
  const n = route * 37 + k;
  const options: [string, unknown][] = [
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

const literal = (value: unknown) => (typeof value === "string" ? JSON.stringify(value) : String(value));
const property = (key: string) => (/^[a-zA-Z]+$/.test(key) ? key : JSON.stringify(key));

function styleObject(rand: () => number, route: number, counter: { k: number }, specificRate: number): string {
  const size = 3 + Math.floor(rand() * 5);
  const entries = new Map<string, unknown>();
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
  const body = [...entries].map(([key, value]) => {
    if (value && typeof value === "object") {
      const inner = Object.entries(value).map(([k, v]) => `${k}: ${literal(v)}`);
      return `${property(key)}: { ${inner.join(", ")} }`;
    }
    return `${property(key)}: ${literal(value)}`;
  });
  return `{ ${body.join(", ")} }`;
}

// The shared component library. `users` names the lazy routes that import it; "entry" means the eager shell.
// `void` lists the exports that render void elements, which must not get children.
const components: Record<string, { users: string[]; void?: string[]; code: string }> = {
  Button: {
    users: ["entry"],
    code: `export const Button = styled("button", {
  display: "inline-flex", alignItems: "center", gap: 8, paddingInline: 12, paddingBlock: 8,
  border: "1px solid #d0d7de", borderRadius: 6, background: "#f6f8fa", color: "#1f2328",
  fontSize: 14, fontWeight: 500, cursor: "pointer",
  ":hover": { background: "#eaeef2" },
  "&:focus-visible": { outline: "2px solid #0969da", outlineOffset: 2 },
  "&[data-variant=primary]": { background: "#1f883d", color: "#ffffff", border: "none" },
});`,
  },
  Stack: {
    users: ["entry"],
    code: `export const Stack = styled("div", { display: "flex", flexDirection: "column", gap: 16 });
export const Row = styled("div", { display: "flex", alignItems: "center", gap: 8 });`,
  },
  Text: {
    users: ["entry"],
    code: `export const Text = styled("p", { margin: 0, fontSize: 14, lineHeight: 1.5, color: "#1f2328" });
export const Muted = styled("span", { fontSize: 12, color: "#57606a" });
export const Heading = styled("h2", { margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.25, color: "#1f2328" });`,
  },
  Card: {
    users: ["entry"],
    code: `export const Card = styled("section", {
  padding: 16, border: "1px solid #d0d7de", borderRadius: 8, background: "#ffffff",
  boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
  "@media (max-width: 768px)": { padding: 12 },
});`,
  },
  Badge: {
    users: ["entry"],
    code: `export const Badge = styled("span", {
  display: "inline-flex", paddingInline: 8, paddingBlock: 4, borderRadius: 999, fontSize: 12, fontWeight: 500,
  background: "#ddf4ff", color: "#0969da",
});`,
  },
  Table: {
    users: ["users", "billing", "reports"],
    code: `export const Table = styled("table", { width: "100%", borderCollapse: "collapse", fontSize: 14 });
export const Th = styled("th", {
  textAlign: "left", paddingInline: 12, paddingBlock: 8, borderBottom: "1px solid #d0d7de",
  fontWeight: 600, color: "#57606a", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.02em",
});
export const Td = styled("td", {
  paddingInline: 12, paddingBlock: 8, borderBottom: "1px solid #eaeef2", whiteSpace: "nowrap",
  ":hover": { background: "#f6f8fa" },
});`,
  },
  Avatar: {
    users: ["users", "inbox", "settings"],
    void: ["Avatar"],
    code: `export const Avatar = styled("img", {
  width: 32, height: 32, borderRadius: 999, objectFit: "cover", flex: "none",
  border: "2px solid #ffffff", boxShadow: "0 0 0 1px #d0d7de",
});`,
  },
  Tabs: {
    users: ["settings", "analytics", "docs"],
    code: `export const TabList = styled("div", { display: "flex", gap: 4, borderBottom: "1px solid #d0d7de", marginBottom: 16 });
export const Tab = styled("button", {
  paddingInline: 16, paddingBlock: 8, border: "none", background: "none", cursor: "pointer",
  fontSize: 14, color: "#57606a", borderBottom: "2px solid transparent",
  "&[aria-selected=true]": { color: "#1f2328", fontWeight: 600, borderBottom: "2px solid #fd8c73" },
  ":hover": { color: "#1f2328" },
});`,
  },
  Chart: {
    users: ["dashboard", "analytics", "reports"],
    code: `export const ChartFrame = styled("figure", {
  margin: 0, padding: 16, display: "grid", gridTemplateRows: "auto 240px", gap: 12,
  border: "1px solid #d0d7de", borderRadius: 8,
});
export const Bar = styled("div", {
  background: "#0969da", borderRadius: "4px 4px 0 0", transition: "height 200ms ease",
  ":hover": { background: "#0550ae" },
});`,
  },
  Modal: {
    users: ["billing", "inbox"],
    code: `export const Backdrop = styled("div", {
  position: "fixed", inset: 0, background: "rgba(31,35,40,0.5)", display: "grid", placeItems: "center", zIndex: 100,
});
export const Dialog = styled("div", {
  width: "min(560px, 90vw)", padding: 24, borderRadius: 12, background: "#ffffff",
  boxShadow: "0 8px 24px rgba(140,149,159,0.2)",
});`,
  },
  Form: {
    users: ["settings", "billing", "docs", "users"],
    void: ["Input"],
    code: `export const Field = styled("label", { display: "grid", gap: 4, fontSize: 14, fontWeight: 600, color: "#1f2328" });
export const Input = styled("input", {
  paddingInline: 12, paddingBlock: 8, border: "1px solid #d0d7de", borderRadius: 6, fontSize: 14,
  background: "#ffffff", color: "#1f2328",
  "&:focus": { outline: "2px solid #0969da", borderColor: "#0969da" },
  "&::placeholder": { color: "#8c959f" },
});`,
  },
  Pagination: {
    users: ["users", "reports"],
    code: `export const Pager = styled("nav", { display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 16 });
export const PageLink = styled("a", {
  minWidth: 32, paddingInline: 8, paddingBlock: 4, textAlign: "center", borderRadius: 6, color: "#0969da",
  "&[aria-current=page]": { background: "#0969da", color: "#ffffff" },
});`,
  },
};

const exportsOf = (code: string) => [...code.matchAll(/export const (\w+)/g)].map((match) => match[1]!);
const voidExports = new Set(Object.values(components).flatMap((component) => component.void ?? []));
const element = (name: string) => (voidExports.has(name) ? `<${name} />` : `<${name}>${name}</${name}>`);

for (const [name, { code }] of Object.entries(components)) {
  writeFileSync(path.join(src, "ui", `${name}.tsx`), `import { styled } from "kiln";\n\n${code}\n`);
}

const baseRoutes = ["dashboard", "users", "settings", "billing", "analytics", "reports", "inbox", "docs"];
const routes = Array.from({ length: routeCount }, (_, i) =>
  i < baseRoutes.length ? baseRoutes[i]! : `${baseRoutes[i % baseRoutes.length]}${Math.floor(i / baseRoutes.length)}`,
);
const baseOf = (name: string) => name.replace(/\d+$/, "");
const tags = ["div", "section", "header", "span", "p", "ul", "li", "aside", "article", "footer"];

function routeModule(name: string, seed: number, count: number, specificRate: number): string {
  const rand = mulberry32(1000 + seed);
  const counter = { k: 0 };
  const used = Object.entries(components).filter(
    ([, component]) => component.users.includes(baseOf(name)) || component.users.includes("entry"),
  );
  const imports = used.map(([file, { code }]) => `import { ${exportsOf(code).join(", ")} } from "../ui/${file}.tsx";`);
  const names = used.flatMap(([, { code }]) => exportsOf(code));
  const rendered = new Set<string>();
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const tag = tags[Math.floor(rand() * tags.length)]!;
    lines.push(`<${tag} css={${styleObject(rand, seed, counter, specificRate)}}>${name} ${i}</${tag}>`);
    if (i % 4 === 0) {
      const component = names[Math.floor(rand() * names.length)]!;
      rendered.add(component);
      lines.push(element(component));
    }
  }
  // Every imported component renders at least once, so no bundler drops an import as unused.
  for (const component of names) if (!rendered.has(component)) lines.push(element(component));
  const signature = name === "home" ? "export function Home()" : "export default function Route()";
  return `${imports.join("\n")}

${signature} {
  return (
    <Stack>
${lines.join("\n")}
    </Stack>
  );
}
`;
}

routes.forEach((name, index) => {
  writeFileSync(path.join(src, "routes", `${name}.tsx`), routeModule(name, index + 1, elementCount, 0.25));
});
writeFileSync(path.join(src, "routes", "home.tsx"), routeModule("home", 0, 24, 0.2));

writeFileSync(
  path.join(src, "App.tsx"),
  `import { lazy, Suspense, useEffect, useState } from "react";
import { styled } from "kiln";

import { Home } from "./routes/home.tsx";
import { Badge } from "./ui/Badge.tsx";
import { Row } from "./ui/Stack.tsx";

const routes = {
${routes.map((name) => `${name}: lazy(() => import("./routes/${name}.tsx")),`).join("\n")}
};

const NavLink = styled("a", {
  display: "block", paddingInline: 12, paddingBlock: 8, borderRadius: 6, color: "#1f2328", textDecoration: "none",
  ":hover": { background: "#eaeef2" },
  "&[aria-current=page]": { background: "#ddf4ff", color: "#0969da", fontWeight: 600 },
});

function useHash() {
  const [hash, setHash] = useState(() => location.hash.slice(1));
  useEffect(() => {
    const update = () => setHash(location.hash.slice(1));
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const Route = Object.hasOwn(routes, hash) ? routes[hash as keyof typeof routes] : undefined;
  return (
    <div css={{ display: "grid", gridTemplateColumns: "240px 1fr", minHeight: "100vh", fontFamily: "system-ui", "@media (max-width: 768px)": { display: "block" } }}>
      <aside css={{ padding: 16, borderRight: "1px solid #d0d7de", background: "#f6f8fa" }}>
        <Row css={{ justifyContent: "space-between", marginBottom: 16 }}>
          <strong css={{ fontSize: 16 }}>Acme</strong>
          <Badge>beta</Badge>
        </Row>
        <nav css={{ display: "grid", gap: 4 }}>
          <NavLink href="#" aria-current={Route ? undefined : "page"}>home</NavLink>
${routes.map((name) => `<NavLink href="#${name}" aria-current={hash === "${name}" ? "page" : undefined}>${name}</NavLink>`).join("\n")}
        </nav>
      </aside>
      <main css={{ padding: 24, minWidth: 0 }}>
        <Suspense fallback={<p css={{ color: "#57606a" }}>Loading…</p>}>{Route ? <Route /> : <Home />}</Suspense>
      </main>
    </div>
  );
}
`,
);

writeFileSync(
  path.join(src, "main.tsx"),
  `import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(<App />);
`,
);

// On Windows `vp` is a .cmd shim, which Node only runs through a shell.
const fmt = spawnSync("vp", ["fmt", src], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
if (fmt.status !== 0) throw fmt.error ?? new Error(`vp fmt exited with ${fmt.status}`);
