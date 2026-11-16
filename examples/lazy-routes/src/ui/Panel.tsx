import { styled } from "kiln";

export const Panel = styled("section", {
  padding: 8,
  borderRadius: 8,
  background: "#f6f8fa",
  "@media (min-width: 40rem)": { padding: 12 },
  "@media (min-width: 64rem)": { padding: 16 },
});
