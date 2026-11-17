import { styled } from "@nishikijs/react";

type Tone = "info" | "success" | "danger";

const Badge = styled("span", ({ $tone }: { $tone: Tone }) => ({
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: 14,
  color: "white",
  background: $tone === "danger" ? "#cf222e" : $tone === "success" ? "#1a7f37" : "#0969da",
}));

export default function Badges() {
  return (
    <div css={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <Badge $tone="info">Queued</Badge>
      <Badge $tone="success">Passed</Badge>
      <Badge $tone="danger">Failed</Badge>
    </div>
  );
}
