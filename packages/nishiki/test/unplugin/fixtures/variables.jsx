import { styled } from "@nishikijs/react";

const Box = styled("div", ({ $pad, $tone }) => ({ padding: $pad, color: $tone, margin: 0 }));
const Cell = styled("span", { display: "inline-block", width: 1 });
const Wide = styled(Cell, ({ $width }) => ({ width: $width, ":hover": { color: "blue" } }));
const Line = styled("p", ({ $height }) => [{ lineHeight: 1.5 }, $height !== 2 && { lineHeight: $height }]);
const on = true;

// Lengths, and values that set nothing, which a runtime value may take.
const LENGTHS = [undefined, null, false, true, "", 0, 4, -2, 1.5, "2px", "1px 3px"];
const TONES = [undefined, null, false, "", "red", "blue"];

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
  styledResolver: [LENGTHS, (value) => <Box $pad={value} $tone="red" />],
  styledResolverTone: [TONES, (tone) => <Box $pad={1} $tone={tone} />],
  styledOverriddenByCss: [LENGTHS, (value) => <Box $pad={value} css={{ padding: 9 }} />],
  styledCssOverrides: [LENGTHS, (value) => <Box $pad={8} css={{ padding: value }} />],
  styledOwnStyle: [LENGTHS, (value) => <Box $pad={value} className="own" style={{ color: "green", margin: 3 }} />],
  wrapped: [LENGTHS, (value) => <Wide $width={value} />],
  wrappedCss: [LENGTHS, (value) => <Wide $width={5} css={{ width: value }} />],
  styledHostCss: [LENGTHS, (value) => <Cell css={{ width: value, margin: value }} />],
  unitless: [LENGTHS, (value) => <Line $height={value} />],
};
