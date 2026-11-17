import { css as style, styled } from "@nishikijs/react";

const dynamic = { color: "blue", margin: 4 };
const key = "padding";
const tone = "red";
const display = "grid";
const pick = (styles) => styles;
const breakpoints = { "@media (min-width: 600px)": { padding: 4 }, "@media (min-width: 900px)": { padding: 8 } };
const states = { ":hover": { color: "red" }, ":focus": { color: "blue" } };
const __proto__ = { color: "red" };
// Read only as style input, so they compile in place.
const shared = { color: "red", padding: 4 };
const sharedList = [shared, { margin: 0 }];
const sharedLater = { ":hover": { color: "blue" }, margin: tone.length };
const on = true;
const off = false;
const nothing = null;
const reader = {
  get padding() {
    return this.margin + 1;
  },
};
// A styled component's class names and rules, in the shape `css` returns them.
const rendered = (Component, props) => {
  const [element, rules] = Component(props).props.children;
  return [element.props.className, () => rules];
};

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
  numbers: () =>
    // oxlint-disable-next-line no-loss-of-precision -- a literal JSON cannot write is the case under test
    style({ width: -1, lineHeight: 1.5, "--x": 2, opacity: `0.5`, aspectRatio: 1.5, zIndex: -0, maxWidth: 1e999 }),
  nestedDynamic: () => style({ padding: 1, ":hover": { color: tone } }),
  multiple: () => style({ color: "red", margin: 1 }, { color: tone }, { margin: 2 }),
  falsyArguments: () => style(null, { color: "red" }, false, undefined, { margin: 0 }),
  typed: () => style({ color: "red" }),
  numericKeys: () => style({ 1: "a", color: "red", 0x10: 2 }),
  integerKeysFirst: () =>
    style({ color: "red", 2: "a", "-1": "b", 1: "c", "01": "d", 4294967294: "e", 4294967295: "f" }),
  integerKeysFirstWithRuntime: () => style({ color: tone, 2: "a", margin: 0, 1: "c" }),
  // Only a non-computed `__proto__` key sets the prototype, whose keys `resolve` reads after the object's own.
  protoSetter: () => style({ __proto__: { color: "red", padding: 2 }, padding: 1 }),
  protoSetterNull: () => style({ __proto__: null, color: "red" }),
  protoSetterPrimitive: () => style({ __proto__: "red", color: "red" }),
  protoSetterUndefined: () => style({ __proto__: undefined, color: "red" }),
  protoSetterWithRuntime: () => style({ __proto__: { margin: 0 }, color: tone, padding: 1 }),
  protoSetterNested: () => style({ ":hover": { __proto__: { color: "red" }, margin: 0 } }),
  protoComputed: () => style({ ["__proto__"]: { color: "red" }, padding: 1 }),
  protoComputedTemplate: () => style({ [`__proto__`]: { color: "red" } }),
  protoComputedWithRuntime: () => style({ ["__proto__"]: { color: "red" }, margin: tone }),
  protoComputedAndSetter: () => style({ ["__proto__"]: { color: "red" }, __proto__: { margin: 0 }, padding: 1 }),
  protoShorthand: () => style({ __proto__, padding: 1 }),
  // A getter in the literal or on a runtime prototype reads the object's own values through `this`.
  getterReadsThis: () =>
    style({
      color: "RED",
      get backgroundColor() {
        return this.color.toLowerCase();
      },
    }),
  protoGetterReadsThis: () => style({ __proto__: reader, margin: 0 }),
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
  /* oxlint-disable no-dupe-keys -- the duplicates are the cases under test */
  repeatedAlias: () =>
    style({ ":hover": { color: "red" }, "&:hover": { color: "blue" }, ":hover": { color: "green" } }),
  repeatedCondition: () =>
    style({
      "@media (min-width: 600px)": { padding: 1 },
      "@media (min-width: 900px)": { padding: 2 },
      "@media (min-width: 600px)": { padding: 3 },
    }),
  repeatedDynamicLast: () =>
    style({ ":hover": { color: "red" }, "&:hover": { color: "blue" }, ":hover": { color: tone } }),
  repeatedAcrossSpread: () =>
    style({
      ":hover": { color: "red" },
      ...dynamic,
      "&:hover": { color: "blue" },
      ":hover": { color: "green" },
      padding: 1,
    }),
  repeatedAccessor: () =>
    style({
      get ":hover"() {
        throw new Error("resolve read a getter its object literal had overridden");
      },
      "&:hover": { color: "blue" },
      ":hover": { color: "red" },
      padding: 1,
    }),
  repeatedMethod: () => style({ color() {}, padding: 1, color: "green", margin: 2 }),
  overriddenNotRead: () => {
    let made = 0;
    let reads = 0;
    const probe = () => {
      made++;
      return {
        get color() {
          reads++;
          return "blue";
        },
      };
    };
    const result = style({ ":hover": probe(), padding: 1, ":hover": { color: "red" }, width: made });
    if (reads > 0) throw new Error("resolve read a value its object literal had overridden");
    return result;
  },
  overriddenInOrder: () => {
    const log = [];
    const step = (name, value) => (log.push(name), value);
    const result = style({ margin: step("a", 1), color: step("b", tone), margin: 0, padding: step("c", 2) });
    if (log.join() !== "a,b,c") throw new Error("values evaluated out of order: " + log.join());
    return result;
  },
  repeatedConditionOnLadder: () =>
    style({
      "@media (min-width: 40rem)": { padding: 1 },
      "@media (min-width: 64rem)": { padding: 2 },
      "@media (min-width: 40rem)": { padding: 3 },
    }),
  /* oxlint-enable no-dupe-keys */
  dynamicAfterStatic: () =>
    style({ "@media (min-width: 900px)": { padding: 8 }, "@media (min-width: 600px)": { padding: key.length } }),
  spreadThenRepeated: () => style({ ...breakpoints, "@media (min-width: 600px)": { padding: 16 } }),
  spreadThenAlias: () => style({ ...states, "&:hover": { color: "green" } }),
  spreadThenSelectorList: () => style({ ...states, ":hover, :active": { color: "green" } }),
  spreadThenRepeatedAcrossInputs: () =>
    style(
      { ...breakpoints, "@media (min-width: 600px)": { padding: 16 } },
      { "@media (min-width: 900px)": { padding: 2 } },
    ),
  list: () => style([{ color: "red", padding: 1 }, [{ margin: 0 }, off && { color: "blue" }], on && { color: tone }]),
  listOverride: () =>
    style([{ "@media (min-width: 900px)": { padding: 8 } }, on && { "@media (min-width: 600px)": { padding: 4 } }], {
      "@media (min-width: 900px)": { padding: 16 },
    }),
  conditional: () =>
    style(
      on ? { color: "red" } : { color: "blue" },
      off ? { margin: 0 } : null,
      on ? { padding: tone.length, ":hover": { color: "blue" } } : undefined,
    ),
  logical: () =>
    style(
      nothing || { color: "red" },
      nothing ?? { margin: 0 },
      on && { padding: 1 },
      off || { ":hover": { color: "blue" } },
      tone.length - 3 && { color: "green" },
    ),
  emptyObject: () => style({}, { color: "red" }, {}),
  styledResolver: () =>
    rendered(
      styled("div", ({ $tone }) => ({ color: $tone, padding: 1, ":hover": { color: "blue" } })),
      { $tone: "red" },
    ),
  styledResolverReturns: () => {
    const Box = styled("div", function ({ $on }, props) {
      const inner = () => ({ margin: 0 });
      if ($on) {
        return [
          { "@media (min-width: 900px)": { padding: 8 } },
          props.id && { "@media (min-width: 600px)": { padding: 4 } },
        ];
      }
      return inner().margin === 0 ? { padding: 4 } : null;
    });
    return rendered(Box, { $on: true, id: "x", css: { "@media (min-width: 900px)": { padding: 16 } } });
  },
  styledResolverWrapped: () => {
    const Inner = styled("div", ({ $size }) => ({ padding: $size, color: "red" }));
    const Outer = styled(Inner, ({ $tone }) => (off ? null : { color: $tone, ":hover": { margin: 0 } }));
    const element = Outer({ $size: 2, $tone: "blue" });
    return rendered(element.type, element.props);
  },
  sharedConstant: () => style(shared, { padding: 1 }),
  sharedConstantList: () => style([sharedList, on && sharedLater], { margin: 2 }),
  sharedConstantStyled: () => rendered(styled("div", [shared, { margin: 2 }]), {}),
  styledSpreadThenRepeated: () =>
    rendered(styled("div", { ...breakpoints, "@media (min-width: 600px)": { padding: 16 } }), {}),
  styledWithCssProp: () =>
    rendered(styled("div", { ...breakpoints, color: "red" }), { css: { "@media (min-width: 600px)": { padding: 2 } } }),
  styledWrapped: () => {
    const Inner = styled("div", { ...breakpoints, "@media (min-width: 600px)": { padding: 16 } });
    const Outer = styled(Inner, { ...states, "@media (min-width: 900px)": { padding: 32 } });
    const element = Outer({});
    return rendered(element.type, element.props);
  },
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
  "repeatedAlias",
  "repeatedCondition",
  "repeatedDynamicLast",
  "repeatedAcrossSpread",
  "repeatedAccessor",
  "repeatedMethod",
  "ampersandDynamicLast",
  "dynamicSelectorList",
  "dynamicAfterStatic",
  "numericKeys",
  "integerKeysFirst",
  "integerKeysFirstWithRuntime",
  "protoSetter",
  "protoSetterNull",
  "protoSetterPrimitive",
  "protoSetterUndefined",
  "protoSetterWithRuntime",
  "protoSetterNested",
  "protoComputed",
  "protoComputedTemplate",
  "protoComputedWithRuntime",
  "protoComputedAndSetter",
  "protoShorthand",
  "getterReadsThis",
  "protoGetterReadsThis",
  "getter",
  "spreadThenRepeated",
  "spreadThenAlias",
  "spreadThenSelectorList",
  "spreadThenRepeatedAcrossInputs",
  "listOverride",
  "styledResolverReturns",
  "styledResolverWrapped",
  "styledSpreadThenRepeated",
  "styledWithCssProp",
  "styledWrapped",
];

// Cases left entirely to runtime: any object with an accessor is skipped, because a getter may read the object's values through `this`.
export const uncompiled = ["getterReadsThis", "protoGetterReadsThis", "getter", "repeatedAccessor"];
