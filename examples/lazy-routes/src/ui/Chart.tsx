import { styled } from "kiln";

export const ChartFrame = styled("figure", {
  margin: 0,
  padding: 16,
  display: "grid",
  gridTemplateRows: "auto 240px",
  gap: 12,
  border: "1px solid #d0d7de",
  borderRadius: 8,
});
export const Bar = styled("div", {
  background: "#0969da",
  borderRadius: "4px 4px 0 0",
  transition: "height 200ms ease",
  ":hover": { background: "#0550ae" },
});
