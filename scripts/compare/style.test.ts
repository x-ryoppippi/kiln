import { describe, expect, it } from "vite-plus/test";

import type { LazyRoutes, Style } from "../gen-lazy-routes.ts";
import { propertiesOf } from "./style.ts";

describe("propertiesOf", () => {
  it("lists every property set anywhere in the app, nested states and media queries included", () => {
    const empty: Style = {};
    const app: LazyRoutes = {
      ui: [
        {
          file: "Button",
          exports: [{ name: "Button", tag: "button", void: false, style: { padding: 8, "&:hover": { opacity: 0.8 } } }],
        },
      ],
      home: {
        name: "home",
        uses: [],
        elements: [{ kind: "box", tag: "div", style: { fontFamily: "serif" }, text: "" }],
      },
      routes: [
        {
          name: "a",
          uses: [],
          elements: [
            { kind: "panel", style: { "@media (max-width: 768px)": { gridArea: "main" } }, text: "" },
            { kind: "component", name: "Button", void: false },
          ],
        },
      ],
      shell: {
        navLink: { borderBottom: "1px solid" },
        layout: empty,
        aside: empty,
        brandRow: empty,
        brand: empty,
        nav: empty,
        main: empty,
        fallback: empty,
      },
    };
    expect(propertiesOf(app)).toEqual(["border-bottom", "font-family", "grid-area", "opacity", "padding"]);
  });
});
