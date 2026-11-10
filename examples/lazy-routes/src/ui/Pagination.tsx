import { styled } from "kiln";

export const Pager = styled("nav", { display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 16 });
export const PageLink = styled("a", {
  minWidth: 32,
  paddingInline: 8,
  paddingBlock: 4,
  textAlign: "center",
  borderRadius: 6,
  color: "#0969da",
  "&[aria-current=page]": { background: "#0969da", color: "#ffffff" },
});
