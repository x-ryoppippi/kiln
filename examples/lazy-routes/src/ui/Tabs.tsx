import { styled } from "kiln";

export const TabList = styled("div", { display: "flex", gap: 4, borderBottom: "1px solid #d0d7de", marginBottom: 16 });
export const Tab = styled("button", {
  paddingInline: 16,
  paddingBlock: 8,
  border: "none",
  background: "none",
  cursor: "pointer",
  fontSize: 14,
  color: "#57606a",
  borderBottom: "2px solid transparent",
  "&[aria-selected=true]": { color: "#1f2328", fontWeight: 600, borderBottom: "2px solid #fd8c73" },
  ":hover": { color: "#1f2328" },
});
