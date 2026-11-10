import { styled } from "kiln";

export const Card = styled("section", {
  padding: 16,
  border: "1px solid #d0d7de",
  borderRadius: 8,
  background: "#ffffff",
  boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
  "@media (max-width: 768px)": { padding: 12 },
});
