import { styled } from "kiln";

export const Backdrop = styled("div", {
  position: "fixed",
  inset: 0,
  background: "rgba(31,35,40,0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 100,
});
export const Dialog = styled("div", {
  width: "min(560px, 90vw)",
  padding: 24,
  borderRadius: 12,
  background: "#ffffff",
  boxShadow: "0 8px 24px rgba(140,149,159,0.2)",
});
