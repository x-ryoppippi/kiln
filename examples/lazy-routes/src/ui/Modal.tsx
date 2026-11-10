import { styled } from "kiln";

export const Dialog = styled("dialog", {
  width: "min(560px, 90vw)",
  padding: 24,
  border: "none",
  borderRadius: 12,
  background: "#ffffff",
  boxShadow: "0 8px 24px rgba(140,149,159,0.2)",
  "::backdrop": { background: "rgba(31,35,40,0.5)" },
});
