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
};
