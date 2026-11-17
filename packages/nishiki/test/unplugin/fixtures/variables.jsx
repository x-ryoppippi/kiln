import { styled } from "@nishikijs/react";

const Box = styled("div", ({ $pad, $tone }) => ({ padding: $pad, color: $tone, margin: 0 }));
const Cell = styled("span", { display: "inline-block", width: 1 });
const Wide = styled(Cell, ({ $width }) => ({ width: $width, ":hover": { color: "blue" } }));
const Line = styled("p", ({ $height }) => [{ lineHeight: 1.5 }, $height !== 2 && { lineHeight: $height }]);
const on = true;

// CSS-wide keywords, which mean something else as the value of a custom property than as the value of the property.
export const KEYWORDS = ["inherit", "initial", "unset", "revert", "revert-layer", " Inherit ", "var(--none, initial)"];
// Lengths, and values that set nothing, which a runtime value may take.
const LENGTHS = [undefined, null, false, true, "", 0, 4, -2, 1.5, "2px", "1px 3px", ...KEYWORDS];
const TONES = [undefined, null, false, "", "red", "blue", ...KEYWORDS];

// Each case renders, for each of its values, elements whose computed styles must not depend on whether the compiler ran.
export const cases = {
  hostProp: [LENGTHS, (value) => <div css={{ padding: value, margin: 4 }} />],
  hostPropList: [LENGTHS, (value) => <div css={[{ padding: 1, margin: 2 }, on && { padding: value }]} />],
  hostPropOverridden: [LENGTHS, (value) => <div css={[{ padding: value }, { padding: 5 }]} />],
  ownStyle: [
    LENGTHS,
    (value) => (
      <div style={{ paddingTop: 7, "--gap": "3px" }} css={{ padding: value, "--gap": value, margin: value }} />
    ),
  ],
  // A child whose value is unset must not read the custom property its parent sets.
  inheritance: [
    LENGTHS,
    (value) => (
      <section css={{ padding: value, "--gap": typeof value === "number" ? `${value}px` : value }}>
        <div css={{ padding: undefined, margin: "var(--gap, 1px)" }}>
          <i css={{ padding: value === 4 ? undefined : value }} />
        </div>
        <b css={{ padding: 9 }} />
      </section>
    ),
  ],
  inheritedColour: [
    TONES,
    (tone) => (
      <main css={{ color: "green" }}>
        <div css={{ color: tone }}>
          <p css={{ color: undefined }} />
          <em css={{ color: tone === "red" ? "blue" : tone }} />
        </div>
      </main>
    ),
  ],
  // A keyword on a child whose parent sets the property, with a literal or a runtime value of its own.
  keywordUnderParent: [
    LENGTHS,
    (value) => (
      <main css={{ padding: 6, color: "green", "--gap": "2px" }}>
        <section css={{ padding: on ? 5 : 0, color: on ? "red" : "blue", "--gap": on ? "3px" : "" }}>
          <div css={{ padding: value, color: value, "--gap": value, margin: "var(--gap, 1px)" }} />
        </section>
        <div css={{ padding: value, color: value, "--gap": value, margin: "var(--gap, 1px)" }} />
      </main>
    ),
  ],
  styledResolver: [LENGTHS, (value) => <Box $pad={value} $tone="red" />],
  styledResolverTone: [TONES, (tone) => <Box $pad={1} $tone={tone} />],
  styledOverriddenByCss: [LENGTHS, (value) => <Box $pad={value} css={{ padding: 9 }} />],
  styledCssOverrides: [LENGTHS, (value) => <Box $pad={8} css={{ padding: value }} />],
  styledOwnStyle: [LENGTHS, (value) => <Box $pad={value} className="own" style={{ color: "green", margin: 3 }} />],
  wrapped: [LENGTHS, (value) => <Wide $width={value} />],
  wrappedCss: [LENGTHS, (value) => <Wide $width={5} css={{ width: value }} />],
  styledHostCss: [LENGTHS, (value) => <Cell css={{ width: value, margin: value }} />],
  unitless: [LENGTHS, (value) => <Line $height={value} />],
  // A semicolon in a string or URL is part of the value, not the end of a declaration in the style attribute.
  semicolons: [
    ['url("data:image/svg+xml;base64,PHN2Zy8+")', "url(data:a;b)", '"a;b"', "none", undefined],
    (value) => <div css={{ backgroundImage: value, content: value, color: "red" }} />,
  ],
};
