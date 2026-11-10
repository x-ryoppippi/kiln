import { Button } from "../ui/Button.tsx";
import { Stack, Row } from "../ui/Stack.tsx";
import { Text, Muted, Heading } from "../ui/Text.tsx";
import { Card } from "../ui/Card.tsx";
import { Badge } from "../ui/Badge.tsx";

export function Home() {
  return (
    <Stack>
      <aside
        css={{
          borderRadius: 12,
          gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
          padding: 4,
          width: "203px",
          letterSpacing: "0.02em",
          color: "#1f2328",
          display: "flex",
        }}
      >
        home 0
      </aside>
      <Muted>Muted</Muted>
      <article css={{ marginTop: 8, color: "#1f2328", height: "52px", minHeight: "163px" }}>home 1</article>
      <aside
        css={{
          fontWeight: 600,
          gap: 12,
          maxWidth: "496px",
          borderRadius: 6,
          color: "#1f2328",
          ":hover": { display: "flex" },
        }}
      >
        home 2
      </aside>
      <aside
        css={{
          display: "flex",
          textAlign: "right",
          color: "hsl(235 60% 40%)",
          background: "hsl(174 80% 96%)",
          padding: 12,
          gap: 8,
          textOverflow: "ellipsis",
        }}
      >
        home 3
      </aside>
      <article
        css={{
          transform: "translateY(3px)",
          textAlign: "left",
          flex: 1,
          background: "#ffffff",
          margin: 8,
          ":hover": { display: "flex" },
        }}
      >
        home 4
      </article>
      <Heading>Heading</Heading>
      <div
        css={{
          gap: 8,
          marginTop: 16,
          display: "flex",
          padding: 4,
          aspectRatio: "7 / 3",
          borderLeft: "4px solid hsl(117 70% 50%)",
        }}
      >
        home 5
      </div>
      <footer
        css={{
          zIndex: 20,
          color: "#0969da",
          borderRadius: 6,
          opacity: 0.3,
          alignItems: "center",
          fontWeight: 600,
          border: "1px solid #d0d7de",
        }}
      >
        home 6
      </footer>
      <div css={{ background: "#ffffff", fontWeight: 600, display: "flex" }}>home 7</div>
      <ul
        css={{
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          padding: 32,
          display: "flex",
          cursor: "pointer",
          paddingInline: 12,
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        home 8
      </ul>
      <Button>Button</Button>
      <header css={{ display: "flex", color: "#0969da", textAlign: "center", gridArea: "area12" }}>home 9</header>
      <p
        css={{
          top: "13px",
          flexDirection: "column",
          color: "#1a7f37",
          gridTemplateColumns: "repeat(6, minmax(134px, 1fr))",
          justifyContent: "flex-end",
        }}
      >
        home 10
      </p>
      <ul css={{ color: "#1f2328", width: "245px", display: "flex" }}>home 11</ul>
      <header css={{ marginTop: 8, textAlign: "center", gap: 8, display: "flex", height: "80px", borderRadius: 999 }}>
        home 12
      </header>
      <Button>Button</Button>
      <ul
        css={{
          fontSize: 14,
          minHeight: "177px",
          color: "#1f2328",
          ":hover": { marginBottom: 16 },
          "@media (max-width: 768px)": { display: "block", padding: 12 },
        }}
      >
        home 13
      </ul>
      <aside
        css={{
          color: "#1f2328",
          paddingBlock: 4,
          display: "block",
          padding: 8,
          maxWidth: "552px",
          margin: "0 auto",
          ":hover": { color: "#1f2328" },
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        home 14
      </aside>
      <aside css={{ background: "hsl(220 80% 96%)", paddingBlock: 4, marginTop: 0 }}>home 15</aside>
      <ul css={{ padding: 8, display: "block", whiteSpace: "nowrap", transform: "translateY(-1px)", gap: 8 }}>
        home 16
      </ul>
      <Text>Text</Text>
      <aside css={{ color: "#1f2328", gap: 8, fontSize: 14, padding: 8 }}>home 17</aside>
      <li css={{ flexDirection: "column", display: "flex", color: "#57606a" }}>home 18</li>
      <li css={{ padding: 16, background: "#ffffff", color: "#1f2328", minWidth: 0, ":hover": { color: "#1f2328" } }}>
        home 19
      </li>
      <span css={{ paddingInline: 8, display: "flex", color: "#1f2328", lineHeight: 1.5, fontWeight: 600 }}>
        home 20
      </span>
      <Stack>Stack</Stack>
      <ul
        css={{
          paddingInline: 24,
          aspectRatio: "6 / 3",
          borderLeft: "4px solid hsl(139 70% 50%)",
          color: "#1f2328",
          flexDirection: "column",
        }}
      >
        home 21
      </ul>
      <li
        css={{
          width: "auto",
          display: "flex",
          fontWeight: 500,
          background: "#0969da",
          paddingInline: 8,
          zIndex: 34,
          gap: 8,
        }}
      >
        home 22
      </li>
      <ul
        css={{
          background: "#ffffff",
          opacity: 0.8,
          gridArea: "area26",
          paddingBlock: 4,
          top: "27px",
          gridTemplateColumns: "repeat(5, minmax(148px, 1fr))",
          ":hover": { lineHeight: 1.5 },
        }}
      >
        home 23
      </ul>
      <Row>Row</Row>
      <Card>Card</Card>
      <Badge>Badge</Badge>
    </Stack>
  );
}
