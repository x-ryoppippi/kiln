import { styled } from "kiln";

export const Table = styled("table", { width: "100%", borderCollapse: "collapse", fontSize: 14 });
export const Th = styled("th", {
  textAlign: "left",
  paddingInline: 12,
  paddingBlock: 8,
  borderBottom: "1px solid #d0d7de",
  fontWeight: 600,
  color: "#57606a",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
});
export const Td = styled("td", {
  paddingInline: 12,
  paddingBlock: 8,
  borderBottom: "1px solid #eaeef2",
  whiteSpace: "nowrap",
  ":hover": { background: "#f6f8fa" },
});
