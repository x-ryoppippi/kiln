import { styled } from "kiln";

export const Field = styled("label", { display: "grid", gap: 4, fontSize: 14, fontWeight: 600, color: "#1f2328" });
export const Input = styled("input", {
  paddingInline: 12,
  paddingBlock: 8,
  border: "1px solid #d0d7de",
  borderRadius: 6,
  fontSize: 14,
  background: "#ffffff",
  color: "#1f2328",
  "&:focus": { outline: "2px solid #0969da", borderColor: "#0969da" },
  "&::placeholder": { color: "#8c959f" },
});
