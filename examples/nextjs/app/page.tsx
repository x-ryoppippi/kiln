import { styled } from "kiln";

import { Counter } from "./counter.tsx";

const Card = styled("section", {
  display: "grid",
  gap: 12,
  padding: 24,
  borderRadius: 12,
  background: "white",
  boxShadow: "0 1px 3px rgb(0 0 0 / 0.12)",
  ":hover": { boxShadow: "0 4px 12px rgb(0 0 0 / 0.16)" },
});

const Badge = styled("span", ({ $tone }: { $tone: "server" | "client" }) => ({
  justifySelf: "start",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  color: "white",
  background: $tone === "server" ? "#8250df" : "#1a7f37",
}));

export default function Page() {
  const renderedAt = new Date().getUTCFullYear();

  return (
    <main css={{ display: "grid", gap: 16, maxWidth: 640, margin: "0 auto", padding: 32 }}>
      <h1 css={{ margin: 0, fontSize: 28 }}>kiln + Next.js</h1>
      <Card data-testid="server-card">
        <Badge $tone="server">Server Component</Badge>
        <p css={{ margin: 0, color: "#57606a" }}>
          Styled without a client boundary. Rendered in <strong css={{ color: "#8250df" }}>{renderedAt}</strong>.
        </p>
      </Card>
      <Card>
        <Badge $tone="client">Client Component</Badge>
        <Counter />
      </Card>
    </main>
  );
}
