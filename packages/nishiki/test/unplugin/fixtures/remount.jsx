import { styled } from "@nishikijs/react";

const Field = styled("input", ({ $tone }) => ({ color: $tone }));
const Plain = styled("input", { margin: 0 });
const Wrapped = styled(Field, ({ $size }) => ({ padding: $size }));

// Each case renders one input for a tone, which may set a custom property, keep a rule of its own or set nothing.
export const cases = {
  hostProp: (tone) => <input css={{ color: tone }} />,
  hostKeyed: (tone) => <input key="field" css={{ color: tone }} />,
  hostOptional: (tone) => <input css={tone ? { color: tone } : undefined} />,
  hostStatic: () => <input css={{ margin: 0 }} />,
  styledProp: (tone) => <Field $tone={tone} />,
  styledCss: (tone) => <Plain css={{ color: tone }} />,
  wrapped: (tone) => <Wrapped $tone={tone} $size={tone ? 4 : undefined} />,
  wrappedCss: (tone) => <Wrapped css={tone ? { color: tone } : undefined} />,
};
