import { styled } from "kiln";

type Tone = "info" | "success" | "danger";

const Badge = styled("span", ({ $tone }: { $tone: Tone }) => ({
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: 14,
  color: "white",
  background: $tone === "danger" ? "crimson" : $tone === "success" ? "seagreen" : "steelblue",
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
