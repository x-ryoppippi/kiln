// Writes the lazy-routes app for each compared library, each in the way its documentation styles a component, an
// element and an override of a component's styles.
import { styleSource, type LazyRoutes, type RouteModule, type Style, type UiExport } from "../gen-lazy-routes.ts";
import { canonical, cssText, kebab, objectSource, type Block, type Declaration } from "./style.ts";

// A module being written: the imports, declarations and side files its styles need, collected as it renders.
class Module {
  readonly imports = new Set<string>();
  readonly hoisted: string[] = [];
  // StyleX's `stylex.create` entries, or the exports of vanilla-extract's `.css.ts` file beside the module.
  readonly styles: string[] = [];
  readonly path: string;
  #next = 0;
  constructor(path: string) {
    this.path = path;
  }
  id(prefix = "s"): string {
    return `${prefix}${this.#next++}`;
  }
  // The relative path from this module to `src`.
  get up(): string {
    return this.path.includes("/") ? "../" : "./";
  }
  get base(): string {
    return this.path.slice(this.path.lastIndexOf("/") + 1);
  }
}

type Declared = UiExport & { exported: boolean };
export type Library = {
  jsxImportSource?: string;
  // Contents of `src/index.css`, which `main.tsx` imports.
  indexCss?: string;
  // A styled component.
  declare: (module: Module, component: Declared) => string;
  // A host element with styles of its own.
  element: (module: Module, tag: string, style: Style, children: string) => string;
  // A styled component with styles that override its own.
  override: (module: Module, component: UiExport, style: Style, children: string) => string;
  // Code that follows the module's components, such as StyleX's `stylex.create` call.
  finish?: (module: Module) => string;
  // Files beside the module, keyed by their path relative to `src`.
  sideFiles?: (module: Module) => [string, string][];
};

const exportKeyword = (component: Declared) => (component.exported ? "export " : "");

// The `css` prop and `styled(tag, styles)` with the fixture's own style objects, as nishiki and restyle take them.
const cssProp = (from: string): Library => ({
  jsxImportSource: from,
  declare: (module, component) => {
    module.imports.add(`import { styled } from "${from}";`);
    return `${exportKeyword(component)}const ${component.name} = styled("${component.tag}", ${styleSource(component.style)});`;
  },
  element: (_, tag, style, children) => `<${tag} css={${styleSource(style)}}>${children}</${tag}>`,
  override: (_, component, style, children) =>
    `<${component.name} css={${styleSource(style)}}>${children}</${component.name}>`,
});

// Class names joined onto a host element, for libraries whose styles compile to class names alone.
const styledHelper = `import { createElement, type ComponentProps, type JSX } from "react";

export function styled<T extends keyof JSX.IntrinsicElements>(tag: T, className?: string) {
  return (props: ComponentProps<T>) =>
    createElement(tag, {
      ...props,
      className: [className, (props as { className?: string }).className].filter(Boolean).join(" ") || undefined,
    });
}
`;

const vanillaExtract: Library = {
  declare: (module, component) => {
    module.imports.add(`import { styled } from "${module.up}styled.tsx";`);
    module.imports.add(`import * as styles from "./${module.base}.css.ts";`);
    module.styles.push(`export const ${component.name} = style(${vanillaObject(canonical(component.style))});`);
    return `${exportKeyword(component)}const ${component.name} = styled("${component.tag}", styles.${component.name});`;
  },
  element: (module, tag, style, children) => {
    const id = module.id();
    module.imports.add(`import * as styles from "./${module.base}.css.ts";`);
    module.styles.push(`export const ${id} = style(${vanillaObject(canonical(style))});`);
    return `<${tag} className={styles.${id}}>${children}</${tag}>`;
  },
  override: (module, component, style, children) => {
    const id = module.id();
    module.imports.add(`import * as styles from "./${module.base}.css.ts";`);
    module.styles.push(`export const ${id} = style(${vanillaObject(canonical(style))});`);
    return `<${component.name} className={styles.${id}}>${children}</${component.name}>`;
  },
  sideFiles: (module) =>
    module.styles.length
      ? [[`${module.path}.css.ts`, `import { style } from "@vanilla-extract/css";\n\n${module.styles.join("\n")}\n`]]
      : [],
};

// vanilla-extract takes simple pseudo-classes and pseudo-elements as top-level keys, and other selectors under
// `selectors`, where they cannot nest further.
function vanillaObject(block: Block, nested = false): string {
  const entries = block.declarations.map(({ property, value }) => `${property}: ${JSON.stringify(value)}`);
  const selectors: string[] = [];
  for (const { selector, block: inner } of block.selectors) {
    if (!nested && /^&::?[a-z-]+$/.test(selector))
      entries.push(`${JSON.stringify(selector.slice(1))}: ${vanillaObject(inner, true)}`);
    else selectors.push(`${JSON.stringify(selector)}: ${vanillaObject(inner, true)}`);
  }
  if (selectors.length) entries.push(`selectors: { ${selectors.join(", ")} }`);
  if (block.media.length) {
    if (nested) throw new Error("vanilla-extract cannot nest @media in a selector");
    const queries = block.media.map(({ query, block }) => `${JSON.stringify(query)}: ${vanillaObject(block, true)}`);
    entries.push(`"@media": { ${queries.join(", ")} }`);
  }
  return `{ ${entries.join(", ")} }`;
}

// Tailwind's own utility where it states exactly the declaration, otherwise an arbitrary value or property.
const KEYWORDS: Record<string, Record<string, string>> = {
  display: {
    flex: "flex",
    grid: "grid",
    block: "block",
    "inline-flex": "inline-flex",
    "inline-grid": "inline-grid",
    none: "hidden",
  },
  flexDirection: { column: "flex-col", row: "flex-row" },
  // `items-start` and `justify-start` state `flex-start`, which is not `start`.
  alignItems: {
    center: "items-center",
    "flex-start": "items-start",
    "flex-end": "items-end",
    baseline: "items-baseline",
  },
  justifyContent: { "space-between": "justify-between", center: "justify-center", "flex-end": "justify-end" },
  position: { relative: "relative", absolute: "absolute", sticky: "sticky" },
  flexWrap: { wrap: "flex-wrap" },
  textAlign: { left: "text-left", center: "text-center", right: "text-right" },
  overflow: { hidden: "overflow-hidden", auto: "overflow-auto" },
  whiteSpace: { nowrap: "whitespace-nowrap" },
  textOverflow: { ellipsis: "text-ellipsis" },
  textTransform: { uppercase: "uppercase" },
  cursor: { pointer: "cursor-pointer" },
  width: { "100%": "w-full", auto: "w-auto" },
  flex: { "1": "flex-1", none: "flex-none" },
  fontWeight: { "400": "font-normal", "500": "font-medium", "600": "font-semibold", "700": "font-bold" },
  borderCollapse: { collapse: "border-collapse" },
  placeItems: { center: "place-items-center" },
};
// Properties on Tailwind's spacing scale, where a multiple of 4px is a step of `--spacing`.
const SPACING: Record<string, string> = {
  padding: "p",
  paddingInline: "px",
  paddingBlock: "py",
  margin: "m",
  marginTop: "mt",
  marginBottom: "mb",
  gap: "gap",
  top: "top",
  width: "w",
  height: "h",
  minWidth: "min-w",
};
const ARBITRARY: Record<string, string> = {
  fontSize: "text",
  borderRadius: "rounded",
  lineHeight: "leading",
  opacity: "opacity",
  letterSpacing: "tracking",
  boxShadow: "shadow",
  maxWidth: "max-w",
  minHeight: "min-h",
};
const COLOUR = /^(#|hsl\(|rgba?\()/;
const arbitrary = (value: string) => value.replaceAll(" ", "_");
const colour = (value: string) => (value === "transparent" ? "transparent" : `[${arbitrary(value)}]`);
// A border as width, style and colour utilities, which Tailwind orders so that a side's beat the whole border's, as
// the longer property does in nishiki.
const BORDERS: Record<string, string> = {
  border: "border",
  borderBottom: "border-b",
  borderLeft: "border-l",
  borderRight: "border-r",
};

function utility(property: string, value: string): string {
  const keyword = KEYWORDS[property]?.[value];
  if (keyword) return keyword;
  // An arbitrary `border: none` would sort after, and so beat, a side's width utility.
  if (property === "border" && value === "none") return "border-0";
  const border = BORDERS[property] && /^(\d+)px (solid|dashed) (.+)$/.exec(value);
  if (border) {
    const [, width, style, colour_] = border;
    return [
      width === "1" ? BORDERS[property] : `${BORDERS[property]}-${width}`,
      ...(style === "solid" ? [] : [`border-${style}`]),
      `${BORDERS[property]}-${colour(colour_!)}`,
    ].join(" ");
  }
  const spacing = SPACING[property];
  const pixels = /^(\d+)px$/.exec(value)?.[1];
  if (spacing && value === "0") return `${spacing}-0`;
  if (spacing && pixels && Number(pixels) % 4 === 0) return `${spacing}-${Number(pixels) / 4}`;
  if (spacing && !value.includes(" ")) return `${spacing}-[${value}]`;
  if (property === "zIndex") return `z-${value}`;
  if (property === "color" && COLOUR.test(value)) return `text-[${arbitrary(value)}]`;
  if (property === "background" && COLOUR.test(value)) return `bg-[${arbitrary(value)}]`;
  if (property === "borderColor" && COLOUR.test(value)) return `border-[${arbitrary(value)}]`;
  if (ARBITRARY[property]) return `${ARBITRARY[property]}-[${arbitrary(value)}]`;
  return `[${kebab(property)}:${arbitrary(value)}]`;
}

function variant(selector: string): string {
  const pseudo = /^&::?([a-z-]+)$/.exec(selector)?.[1];
  if (pseudo) return pseudo;
  const attribute = /^&\[(data|aria)-([a-z-]+)=([a-z0-9-]+)\]$/.exec(selector);
  if (attribute) return `${attribute[1]}-[${attribute[2]}=${attribute[3]}]`;
  return `[${arbitrary(selector)}]`;
}

function mediaVariant(query: string): string {
  const width = /^\((min|max)-width: ([\d.]+(?:px|rem|em))\)$/.exec(query);
  return width ? `${width[1]}-[${width[2]}]` : `[@media${arbitrary(query)}]`;
}

function classes(block: Block, prefix = ""): string[] {
  return [
    ...block.declarations.flatMap(({ property, value }) =>
      utility(property, value)
        .split(" ")
        .map((name) => prefix + name),
    ),
    ...block.selectors.flatMap(({ selector, block }) => classes(block, `${prefix}${variant(selector)}:`)),
    ...block.media.flatMap(({ query, block }) => classes(block, `${prefix}${mediaVariant(query)}:`)),
  ];
}
const classNames = (style: Style) => classes(canonical(style)).join(" ");

const tailwind: Library = {
  indexCss: `@layer theme, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities) source(none);
@source "./";
`,
  declare: (module, component) => {
    module.imports.add(`import { styled } from "${module.up}styled.tsx";`);
    return `${exportKeyword(component)}const ${component.name} = styled("${component.tag}", "${classNames(component.style)}");`;
  },
  element: (_, tag, style, children) => `<${tag} className="${classNames(style)}">${children}</${tag}>`,
  override: (_, component, style, children) =>
    `<${component.name} className="${classNames(style)}">${children}</${component.name}>`,
};

const unstyled: Library = {
  declare: (module, component) => {
    module.imports.add(`import { styled } from "${module.up}styled.tsx";`);
    return `${exportKeyword(component)}const ${component.name} = styled("${component.tag}");`;
  },
  element: (_, tag, __, children) => `<${tag}>${children}</${tag}>`,
  override: (_, component, __, children) => `<${component.name}>${children}</${component.name}>`,
};

const styledComponents: Library = {
  declare: (module, component) => {
    module.imports.add(`import styled from "styled-components";`);
    return `${exportKeyword(component)}const ${component.name} = styled.${component.tag}(${objectSource(canonical(component.style))});`;
  },
  // Without the Babel plugin, styled-components has no `css` prop: an element styled in place is a component of
  // its own, which is what the plugin would compile it to.
  element: (module, tag, style, children) => {
    const id = module.id("S");
    module.imports.add(`import styled from "styled-components";`);
    module.hoisted.push(`const ${id} = styled.${tag}(${objectSource(canonical(style))});`);
    return `<${id}>${children}</${id}>`;
  },
  override: (module, component, style, children) => {
    const id = module.id("S");
    module.imports.add(`import styled from "styled-components";`);
    module.hoisted.push(`const ${id} = styled(${component.name})(${objectSource(canonical(style))});`);
    return `<${id}>${children}</${id}>`;
  },
};

const emotion: Library = {
  jsxImportSource: "@emotion/react",
  declare: (module, component) => {
    module.imports.add(`import styled from "@emotion/styled";`);
    return `${exportKeyword(component)}const ${component.name} = styled("${component.tag}")(${styleSource(component.style)});`;
  },
  element: (_, tag, style, children) => `<${tag} css={${styleSource(style)}}>${children}</${tag}>`,
  override: (_, component, style, children) =>
    `<${component.name} css={${styleSource(style)}}>${children}</${component.name}>`,
};

const linaria: Library = {
  declare: (module, component) => {
    module.imports.add(`import { styled } from "@linaria/react";`);
    return `${exportKeyword(component)}const ${component.name} = styled.${component.tag}\`${cssText(canonical(component.style))}\`;`;
  },
  element: (module, tag, style, children) => {
    const id = module.id();
    module.imports.add(`import { css } from "@linaria/core";`);
    module.hoisted.push(`const ${id} = css\`${cssText(canonical(style))}\`;`);
    return `<${tag} className={${id}}>${children}</${tag}>`;
  },
  override: (module, component, style, children) => {
    const id = module.id();
    module.imports.add(`import { css } from "@linaria/core";`);
    module.hoisted.push(`const ${id} = css\`${cssText(canonical(style))}\`;`);
    return `<${component.name} className={${id}}>${children}</${component.name}>`;
  },
};

const panda: Library = {
  indexCss: "@layer reset, base, tokens, recipes, utilities;\n",
  declare: (module, component) => {
    module.imports.add(`import { styled } from "styled-system/jsx";`);
    return `${exportKeyword(component)}const ${component.name} = styled("${component.tag}", { base: ${objectSource(canonical(component.style))} });`;
  },
  element: (module, tag, style, children) => {
    module.imports.add(`import { css } from "styled-system/css";`);
    return `<${tag} className={css(${objectSource(canonical(style))})}>${children}</${tag}>`;
  },
  override: (_, component, style, children) =>
    `<${component.name} css={${objectSource(canonical(style))}}>${children}</${component.name}>`,
};

// StyleX states each property once, with its value under each condition; pseudo-elements are top-level keys, and a
// selector on the element's own attributes is a style applied when the component's prop has that value.
type StyleXProperty = Map<string, string>;
type StyleXStyle = { properties: Map<string, StyleXProperty>; pseudoElements: [string, StyleXStyle][] };

// StyleX leaves out the `background`, `border` and `outline` shorthands, so they are written as the longhands they
// set.
function longhands({ property, value }: Declaration): Declaration[] {
  if (property === "background") {
    return COLOUR.test(value) || value === "transparent"
      ? [{ property: "backgroundColor", value }]
      : [
          { property: "backgroundColor", value: "transparent" },
          { property: "backgroundImage", value },
        ];
  }
  const side = /^(border|outline)(Top|Right|Bottom|Left)?$/.exec(property);
  if (!side) return [{ property, value }];
  if (value === "none") return [{ property: `${property}Style`, value: "none" }];
  const parts = /^(\S+) (\S+) (.+)$/.exec(value);
  if (!parts) throw new Error(`cannot split ${property}: ${value}`);
  return [
    { property: `${property}Width`, value: parts[1]! },
    { property: `${property}Style`, value: parts[2]! },
    { property: `${property}Color`, value: parts[3]! },
  ];
}

function stylexStyle(block: Block): StyleXStyle {
  const style: StyleXStyle = { properties: new Map(), pseudoElements: [] };
  const add = (inner: Block, condition: string) => {
    if (inner.selectors.length || inner.media.length) throw new Error("StyleX conditions do not nest here");
    for (const { property, value } of inner.declarations.flatMap(longhands)) {
      const conditions = style.properties.get(property) ?? new Map();
      conditions.set(condition, value);
      style.properties.set(property, conditions);
    }
  };
  add({ ...block, selectors: [], media: [] }, "default");
  for (const { selector, block: inner } of block.selectors) {
    if (selector.startsWith("&::")) style.pseudoElements.push([selector.slice(1), stylexStyle(inner)]);
    else if (/^&:[a-z-]+$/.test(selector)) add(inner, selector.slice(1));
    else if (!selector.startsWith("&[")) throw new Error(`StyleX has no equivalent of ${selector}`);
  }
  for (const { query, block: inner } of block.media) add(inner, `@media ${query}`);
  return style;
}

function stylexSource(style: StyleXStyle): string {
  const entries = [...style.properties].map(([property, conditions]) => {
    if (conditions.size === 1 && conditions.has("default"))
      return `${property}: ${JSON.stringify(conditions.get("default"))}`;
    const values = [
      ["default", conditions.get("default") ?? null] as const,
      ...[...conditions].filter(([key]) => key !== "default"),
    ];
    return `${property}: { ${values.map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(", ")} }`;
  });
  for (const [pseudo, inner] of style.pseudoElements) entries.push(`${JSON.stringify(pseudo)}: ${stylexSource(inner)}`);
  return `{ ${entries.join(", ")} }`;
}

// StyleX resolves a property as a whole, so an override that adds a condition restates the conditions it keeps.
function stylexOverride(base: Style, override: Style): string {
  const own = stylexStyle(canonical(base));
  const merged = stylexStyle(canonical(override));
  for (const [property, conditions] of merged.properties) {
    merged.properties.set(property, new Map([...(own.properties.get(property) ?? []), ...conditions]));
  }
  return stylexSource(merged);
}

const stylex: Library = {
  // The plugin appends its rules to a stylesheet the build already emits.
  indexCss: "/* StyleX */\n",
  declare: (module, component) => {
    module.imports.add(`import * as stylex from "@stylexjs/stylex";`);
    module.imports.add(`import type { ComponentProps } from "react";`);
    const block = canonical(component.style);
    module.styles.push(`${component.name}: ${stylexSource(stylexStyle(block))}`);
    const applied = [`styles.${component.name}`];
    block.selectors.forEach(({ selector, block: inner }, index) => {
      const attribute = /^&\[([a-z-]+)=([a-z0-9-]+)\]$/.exec(selector);
      if (!attribute) return;
      const key = `${component.name}_${index}`;
      module.styles.push(`${key}: ${stylexSource(stylexStyle(inner))}`);
      applied.push(
        `String(props[${JSON.stringify(attribute[1])}]) === ${JSON.stringify(attribute[2])} && styles.${key}`,
      );
    });
    const tag = component.tag;
    return `${exportKeyword(component)}function ${component.name}({ xstyle, ...props }: ComponentProps<"${tag}"> & { xstyle?: stylex.StyleXStyles }) {
  return <${tag} {...props} {...stylex.props(${[...applied, "xstyle"].join(", ")})} />;
}`;
  },
  element: (module, tag, style, children) => {
    const id = module.id();
    module.imports.add(`import * as stylex from "@stylexjs/stylex";`);
    module.styles.push(`${id}: ${stylexSource(stylexStyle(canonical(style)))}`);
    return `<${tag} {...stylex.props(styles.${id})}>${children}</${tag}>`;
  },
  override: (module, component, style, children) => {
    const id = module.id();
    module.styles.push(`${id}: ${stylexOverride(component.style, style)}`);
    return `<${component.name} xstyle={styles.${id}}>${children}</${component.name}>`;
  },
  finish: (module) =>
    module.styles.length ? `\nconst styles = stylex.create({\n${module.styles.join(",\n")}\n});\n` : "",
};

export const LIBRARIES = {
  unstyled,
  nishiki: cssProp("@nishikijs/react"),
  restyle: cssProp("restyle"),
  emotion,
  "styled-components": styledComponents,
  linaria,
  "vanilla-extract": vanillaExtract,
  stylex,
  panda,
  tailwind,
} satisfies Record<string, Library>;
export type LibraryName = keyof typeof LIBRARIES;

// The app's files for a library, keyed by their path relative to `src`.
export function emit(library: Library, app: LazyRoutes): Map<string, string> {
  const files = new Map<string, string>();
  const write = (module: Module, body: string) => {
    const head = [...module.imports].join("\n");
    files.set(
      `${module.path}.tsx`,
      `${head}\n\n${module.hoisted.join("\n")}\n\n${body}\n${library.finish?.(module) ?? ""}`,
    );
    for (const [file, code] of library.sideFiles?.(module) ?? []) files.set(file, code);
  };
  const exported = new Map(app.ui.flatMap((module) => module.exports.map((component) => [component.name, component])));
  const component = (name: string) => exported.get(name)!;

  for (const module of app.ui) {
    const writer = new Module(`ui/${module.file}`);
    write(
      writer,
      module.exports.map((component) => library.declare(writer, { ...component, exported: true })).join("\n\n"),
    );
  }

  const routeModule = (route: RouteModule, signature: string) => {
    const writer = new Module(`routes/${route.name}`);
    for (const module of route.uses) {
      writer.imports.add(
        `import { ${module.exports.map(({ name }) => name).join(", ")} } from "../ui/${module.file}.tsx";`,
      );
    }
    const elements = route.elements.map((element) => {
      switch (element.kind) {
        case "box":
          return library.element(writer, element.tag, element.style, element.text);
        case "component":
          return element.void ? `<${element.name} />` : `<${element.name}>${element.name}</${element.name}>`;
        case "panel":
          return library.override(writer, component("Panel"), element.style, element.text);
      }
    });
    write(writer, `${signature} {\n  return (\n    <Stack>\n${elements.join("\n")}\n    </Stack>\n  );\n}\n`);
  };
  for (const route of app.routes) routeModule(route, "export default function Route()");
  routeModule(app.home, "export function Home()");

  const { shell } = app;
  const names = app.routes.map((route) => route.name);
  const writer = new Module("App");
  writer.imports.add(`import { lazy, startTransition, Suspense, useEffect, useState } from "react";`);
  writer.imports.add(`import { Home } from "./routes/home.tsx";`);
  writer.imports.add(`import { Badge } from "./ui/Badge.tsx";`);
  writer.imports.add(`import { Row } from "./ui/Stack.tsx";`);
  const navLink = library.declare(writer, {
    name: "NavLink",
    tag: "a",
    style: shell.navLink,
    void: false,
    exported: false,
  });
  const links = [
    `<NavLink href="#" aria-current={Route ? undefined : "page"}>home</NavLink>`,
    ...names.map(
      (name) => `<NavLink href="#${name}" aria-current={hash === "${name}" ? "page" : undefined}>${name}</NavLink>`,
    ),
  ].join("\n");
  const layout = library.element(
    writer,
    "div",
    shell.layout,
    [
      library.element(
        writer,
        "aside",
        shell.aside,
        library.override(
          writer,
          component("Row"),
          shell.brandRow,
          `${library.element(writer, "strong", shell.brand, "Acme")}<Badge>beta</Badge>`,
        ) + library.element(writer, "nav", shell.nav, links),
      ),
      library.element(
        writer,
        "main",
        shell.main,
        `<Suspense fallback={${library.element(writer, "p", shell.fallback, "Loading…")}}>{Route ? <Route /> : <Home />}</Suspense>`,
      ),
    ].join("\n"),
  );
  write(
    writer,
    `const routes = {
${names.map((name) => `${name}: lazy(() => import("./routes/${name}.tsx")),`).join("\n")}
};

${navLink}

function useHash() {
  const [hash, setHash] = useState(() => location.hash.slice(1));
  useEffect(() => {
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
${layout}
  );
}
`,
  );

  files.set(
    "main.tsx",
    `import { createRoot } from "react-dom/client";
${library.indexCss ? `\nimport "./index.css";` : ""}
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(<App />);
`,
  );
  if (library.indexCss) files.set("index.css", library.indexCss);
  if ([...files.values()].some((code) => code.includes("styled.tsx"))) files.set("styled.tsx", styledHelper);
  return files;
}
