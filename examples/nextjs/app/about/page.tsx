import { styled } from "@nishikijs/react";

import { Badge, Card, Main, Title } from "../ui.tsx";

const Steps = styled("ol", {
  display: "grid",
  gap: 8,
  margin: 0,
  paddingLeft: 20,
  color: "#57606a",
  "::marker": { color: "#bf8700", fontWeight: 700 },
});

export const metadata = { title: "About · nishiki + Next.js" };

export default function AboutPage() {
  return (
    <Main>
      <Title>About</Title>
      <Card data-testid="about-card">
        <Badge $tone="server">Server Component</Badge>
        <p css={{ margin: 0, fontStyle: "italic", color: "#6e7781" }}>
          nishiki compiles every style at build time into atomic classes.
        </p>
        <Steps>
          <li>Write styles next to the components that use them.</li>
          <li>Each declaration becomes one class, shared by every component that uses it.</li>
          <li>Each page links only the stylesheets its layouts do not already load.</li>
        </Steps>
      </Card>
    </Main>
  );
}
