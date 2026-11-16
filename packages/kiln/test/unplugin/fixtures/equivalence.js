import { css as style } from "kiln";

const dynamic = { color: "blue", margin: 4 };
const key = "padding";
const tone = "red";
const display = "grid";
const pick = (styles) => styles;

export const cases = {
  literal: () =>
    style({ color: "red", padding: 8, ":hover": { color: "blue" }, "@media (min-width: 1px)": { margin: 0 } }),
  spreadFirst: () => style({ ...dynamic, color: "red" }),
  spreadLast: () => style({ color: "red", ...dynamic }),
  computedFirst: () => style({ [key]: 1, padding: 2 }),
  computedLast: () => style({ padding: 2, [key]: 1 }),
  mixed: () => style({ color: tone, padding: 2, margin: dynamic.margin }),
  // oxlint-disable-next-line no-dupe-keys -- the duplicate is the case under test
  duplicate: () => style({ color: "red", color: "green" }),
  // oxlint-disable-next-line no-dupe-keys -- the duplicate is the case under test
  duplicateDynamicFirst: () => style({ color: tone, margin: 1, color: "green" }),
  // oxlint-disable-next-line no-dupe-keys -- the duplicate is the case under test
  duplicateDynamicLast: () => style({ color: "green", margin: 1, color: tone }),
  nullish: () => style({ color: null, padding: 1, margin: undefined }),
  unsetAfterSpread: () => style({ ...dynamic, color: null, margin: undefined, padding: 1 }),
  numbers: () => style({ width: -1, lineHeight: 1.5, "--x": 2, opacity: `0.5`, aspectRatio: 1.5, zIndex: -0 }),
  nestedDynamic: () => style({ padding: 1, ":hover": { color: tone } }),
  multiple: () => style({ color: "red", margin: 1 }, { color: tone }, { margin: 2 }),
  falsyArguments: () => style(null, { color: "red" }, false, undefined, { margin: 0 }),
  typed: () => style({ color: "red" }),
  numericKeys: () => style({ 1: "a", color: "red", 0x10: 2 }),
  quotedKeys: () => style({ "&[title='a\"b']": { color: "red" }, '[data-x="y"] &': { margin: 0 }, "--a-b": "1" }),
  templates: () => style({ [`color`]: `red`, margin: `${tone.length}px`, padding: 1 }),
  shorthand: () => style({ display, padding: 1 }),
  getter: () =>
    style({
      margin: 0,
      get color() {
        return tone;
      },
      padding: 1,
    }),
  selectorLists: () => style({ "&:hover, span": { color: "red" }, ":focus, :active": { ":hover": { margin: 0 } } }),
  atRules: () =>
    style({
      "@supports (display: grid)": { "@media (min-width: 600px)": { display: "grid", ":hover": { color: "red" } } },
      "@container card (min-width: 1px)": { padding: 1 },
    }),
  nestedCall: () => style({ margin: pick(style({ padding: 1 }))[0] ? 1 : 2, color: "red" }),
  nestedCallInDynamic: () => style({ color: tone, margin: pick(style({ padding: 1 }))[0] ? 1 : 2 }),
  deep: () => style({ ":a": { ":b": { ":c": { ":d": { color: "red", margin: 0 } } } } }),
  overrideMovesLast: () =>
    style(
      { "@media (min-width: 900px)": { padding: 8 }, "@media (min-width: 600px)": { padding: 4 } },
      { "@media (min-width: 900px)": { padding: 16 } },
    ),
  ampersandMerge: () => style({ ":hover": { color: "red" }, padding: 1, "&:hover": { color: "blue" } }),
  ampersandAcrossInputs: () => style({ ":hover": { color: "red", margin: 0 } }, { " &:hover": { color: "blue" } }),
  ampersandDynamicFirst: () => style({ "&:hover": { color: tone }, padding: 1, ":hover": { color: "blue" } }),
  ampersandDynamicLast: () => style({ ":hover": { color: "blue" }, padding: 1, "&:hover": { color: tone } }),
  selectorListOverride: () => style({ ":hover, :focus": { color: "red" }, margin: 0, "&:focus": { color: "blue" } }),
  selectorListOverridden: () => style({ ":focus": { color: "blue" }, margin: 0, "&:hover, :focus": { color: "red" } }),
  dynamicSelectorList: () => style({ ":focus": { color: "blue" }, margin: 0, ":hover, :focus": { color: tone } }),
  dynamicSelectorListFirst: () => style({ ":hover, :focus": { color: tone }, margin: 0, ":focus": { color: "blue" } }),
  nestedDuplicate: () => style({ "@media print": { ":hover": { color: "red" }, "&:hover": { color: "blue" } } }),
  overriddenSideEffect: () => {
    let count = 0;
    // oxlint-disable-next-line no-dupe-keys -- the duplicate is the case under test
    return style({ margin: ++count, padding: 1, margin: 0, width: count });
  },
  dynamicAfterStatic: () =>
    style({ "@media (min-width: 900px)": { padding: 8 }, "@media (min-width: 600px)": { padding: key.length } }),
};

// Cases whose class names and rules must also come out in the same order, since the order of rules for one property
// under different conditions decides which wins.
export const ordered = [
  "overrideMovesLast",
  "ampersandMerge",
  "ampersandAcrossInputs",
  "ampersandDynamicFirst",
  "selectorListOverride",
  "selectorListOverridden",
  "dynamicSelectorListFirst",
  "nestedDuplicate",
];

// The compiled form applies every runtime value before every compiled entry, so a runtime value written after a
// compiled key comes out in front of it.
export const misordered = ["ampersandDynamicLast", "dynamicSelectorList", "dynamicAfterStatic"];
