import * as React from "react";

import { resolve } from "./core/index.ts";
import { Styles } from "./styles.tsx";
import type { Styles as StyleInput } from "./types.ts";

const STYLED = Symbol.for("kiln.styled");

type StyleResolver<StyleProps> = (styleProps: StyleProps) => StyleInput;

type StyledProps<Props, StyleProps> = Omit<Props, keyof StyleProps> &
  StyleProps & { className?: string; css?: StyleInput };

/**
 * Create a component that forwards generated class names to `Component`.
 * Props read by a style resolver are treated as style props and not forwarded.
 */
export function styled<
  Component extends keyof React.JSX.IntrinsicElements | React.JSXElementConstructor<any>,
  StyleProps extends object = {},
>(
  Component: Component,
  styles?: StyleInput | StyleResolver<StyleProps>,
): React.FunctionComponent<StyledProps<React.ComponentProps<Component>, StyleProps>> {
  const wrapsStyled = typeof Component === "function" && STYLED in Component;

  function StyledComponent({
    className: classNameProp,
    css: cssProp,
    ...props
  }: StyledProps<React.ComponentProps<Component>, StyleProps>): React.ReactNode {
    let base: StyleInput;

    if (typeof styles === "function") {
      const accessed = new Set<string>();
      base = styles(
        new Proxy(props, {
          get(target, prop: string) {
            accessed.add(prop);
            return target[prop as keyof typeof target];
          },
        }) as StyleProps,
      );
      for (const prop of accessed) delete props[prop as keyof typeof props];
    } else {
      base = styles;
    }

    // A wrapped styled component merges these styles with its own per key; class names would only concatenate.
    if (wrapsStyled) {
      return React.createElement(Component, { ...props, className: classNameProp, css: [base, cssProp] });
    }

    const [className, rules] = resolve([base, cssProp]);
    const merged = classNameProp ? classNameProp + " " + className : className;

    return (
      <>
        {React.createElement(Component, { ...props, className: merged })}
        <Styles rules={rules} />
      </>
    );
  }

  return Object.assign(StyledComponent, { [STYLED]: true });
}
