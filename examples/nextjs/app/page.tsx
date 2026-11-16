import { Counter } from "./counter.tsx";
import { Badge, Card, Main, Title } from "./ui.tsx";

export default function Page() {
  const renderedAt = new Date().getUTCFullYear();

  return (
    <Main>
      <Title>kiln + Next.js</Title>
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
    </Main>
  );
}
