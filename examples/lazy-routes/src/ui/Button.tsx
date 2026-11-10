import { styled } from "kiln";

export const Button = styled("button", {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  paddingInline: 12,
  paddingBlock: 8,
  border: "1px solid #d0d7de",
  borderRadius: 6,
  background: "#f6f8fa",
  color: "#1f2328",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  ":hover": { background: "#eaeef2" },
  "&:focus-visible": { outline: "2px solid #0969da", outlineOffset: 2 },
  "&[data-variant=primary]": { background: "#1f883d", color: "#ffffff", border: "none" },
});
