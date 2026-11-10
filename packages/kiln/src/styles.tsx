import * as React from "react";

import { LAYER_ORDER, type Rule } from "./core/index.ts";

const PRECEDENCE = "kiln";

/**
 * Inserts atomic rules through React's style hoisting, which dedupes them by `href`.
 * The layer order is emitted first so it is always the first rule React inserts for this precedence.
 */
export function Styles({ rules, nonce }: { rules: readonly Rule[]; nonce?: string }): React.ReactNode {
  if (rules.length === 0) return null;
  const shared = nonce ? { nonce } : {};
  return [
    <style key="kiln-layers" href="kiln-layers" precedence={PRECEDENCE} {...shared}>
      {LAYER_ORDER}
    </style>,
    ...rules.map(([className, text]) => (
      <style key={className} href={className} precedence={PRECEDENCE} {...shared}>
        {text}
      </style>
    )),
  ];
}

if (import.meta.vitest) {
  const { describe, expect, it } = import.meta.vitest;
  const { renderToReadableStream, renderToString } = await import("react-dom/server");
  const { compileEntry } = await import("./core/index.ts");

  const [, , rules] = compileEntry(":hover", { color: "red", margin: 0 });
  const stream = async (element: React.ReactNode, styleNonce: string) => {
    const result = await renderToReadableStream(element, { nonce: { style: styleNonce } });
    await result.allReady;
    return new Response(result).text();
  };
  const page = (body: React.ReactNode) =>
    renderToString(
      <html>
        <head />
        <body>{body}</body>
      </html>,
    );

  describe("Styles", () => {
    it("renders nothing without rules", () => {
      expect(Styles({ rules: [] })).toBeNull();
      expect(page(<Styles rules={[]} nonce="abc" />)).not.toContain("<style");
    });

    it("emits the layer order first, then one hoistable style per rule keyed by its class", () => {
      const elements = Styles({ rules }) as React.ReactElement<{ href: string; precedence: string }>[];
      expect(elements.map((element) => element.props.href)).toEqual(["kiln-layers", ...rules.map(([name]) => name)]);
      expect(elements.map((element) => element.key)).toEqual(["kiln-layers", ...rules.map(([name]) => name)]);
      expect(new Set(elements.map((element) => element.props.precedence))).toEqual(new Set(["kiln"]));
    });

    it("passes the nonce to every style element", async () => {
      const elements = Styles({ rules, nonce: "abc" }) as React.ReactElement<{ nonce?: string }>[];
      expect(elements.map((element) => element.props.nonce)).toEqual(["abc", "abc", "abc"]);
      // React only emits the nonce of hoisted styles when the render is given the same style nonce.
      const output = await stream(
        <html>
          <head />
          <body>
            <Styles rules={rules} nonce="abc" />
          </body>
        </html>,
        "abc",
      );
      expect(output).toMatch(/<style nonce="abc" data-precedence="kiln" data-href="[^"]+">@layer k0,/);
      const plain = Styles({ rules }) as React.ReactElement<object>[];
      expect(plain.every((element) => !("nonce" in element.props))).toBe(true);
    });

    it("lets React dedupe rules rendered more than once", () => {
      const output = page(
        <>
          <Styles rules={rules} />
          <Styles rules={rules} />
        </>,
      );
      expect(output.split(LAYER_ORDER)).toHaveLength(2);
      expect(output.split(rules[0]![1])).toHaveLength(2);
    });
  });
}
