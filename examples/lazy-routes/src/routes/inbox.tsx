import { Button } from "../ui/Button.tsx";
import { Stack, Row } from "../ui/Stack.tsx";
import { Text, Muted, Heading } from "../ui/Text.tsx";
import { Card } from "../ui/Card.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Avatar } from "../ui/Avatar.tsx";
import { Dialog } from "../ui/Modal.tsx";

export default function Route() {
  return (
    <Stack>
      <article
        css={{
          transform: "translateY(3px)",
          color: "#1f2328",
          aspectRatio: "4 / 3",
          borderLeft: "4px solid hsl(153 70% 50%)",
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        inbox 0
      </article>
      <Button>Button</Button>
      <section
        css={{
          marginTop: 0,
          position: "sticky",
          lineHeight: 1.5,
          display: "flex",
          background: "#1f2328",
          borderRadius: 12,
          zIndex: 272,
        }}
      >
        inbox 1
      </section>
      <div
        css={{
          display: "flex",
          padding: 48,
          fontWeight: 500,
          alignItems: "center",
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          margin: 0,
        }}
      >
        inbox 2
      </div>
      <header
        css={{
          borderRadius: 6,
          display: "flex",
          marginTop: 0,
          width: "auto",
          overflow: "hidden",
          opacity: 0.3,
          color: "#1f2328",
        }}
      >
        inbox 3
      </header>
      <span
        css={{
          gap: 8,
          fontSize: 14,
          display: "flex",
          letterSpacing: "0.02em",
          "@media (max-width: 768px)": { display: "block", padding: 8 },
        }}
      >
        inbox 4
      </span>
      <Row>Row</Row>
      <li css={{ padding: 4, margin: 0, gap: 16 }}>inbox 5</li>
      <ul
        css={{
          color: "#1f2328",
          padding: 4,
          paddingInline: 12,
          gridArea: "area264",
          borderRadius: 4,
          border: "1px solid #d0d7de",
          gap: 16,
        }}
      >
        inbox 6
      </ul>
      <aside
        css={{ top: "265px", background: "#fff8c5", display: "flex", boxShadow: "0 8px 24px rgba(140,149,159,0.2)" }}
      >
        inbox 7
      </aside>
      <li css={{ gap: 8, fontWeight: 600, display: "flex" }}>inbox 8</li>
      <Card>Card</Card>
      <section
        css={{
          fontSize: 14,
          paddingInline: 16,
          gridTemplateColumns: "repeat(3, minmax(386px, 1fr))",
          justifyContent: "space-between",
          background: "#f6f8fa",
          display: "flex",
        }}
      >
        inbox 9
      </section>
      <section css={{ background: "#eaeef2", display: "flex", width: "1001px", gap: 8, border: "none" }}>
        inbox 10
      </section>
      <span css={{ display: "inline-flex", justifyContent: "space-between", fontSize: 24, paddingBlock: 8 }}>
        inbox 11
      </span>
      <article
        css={{
          padding: 4,
          textAlign: "left",
          display: "flex",
          height: "584px",
          minHeight: "429px",
          justifyContent: "space-between",
          maxWidth: "1560px",
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        inbox 12
      </article>
      <Button>Button</Button>
      <ul
        css={{
          fontWeight: 600,
          color: "hsl(137 60% 40%)",
          boxShadow: "0 8px 24px rgba(140,149,159,0.2)",
          paddingBlock: 4,
        }}
      >
        inbox 13
      </ul>
      <ul
        css={{
          border: "1px solid #eaeef2",
          borderBottom: "1px solid #d0d7de",
          flex: 1,
          background: "hsl(328 80% 96%)",
          fontSize: 14,
          ":hover": { margin: 0 },
        }}
      >
        inbox 14
      </ul>
      <article
        css={{
          margin: 0,
          textAlign: "left",
          transform: "translateY(-1px)",
          aspectRatio: "8 / 3",
          padding: 4,
          borderLeft: "4px solid hsl(175 70% 50%)",
          display: "flex",
          ":hover": { display: "flex" },
        }}
      >
        inbox 15
      </article>
      <ul css={{ zIndex: 286, display: "flex", color: "#1f2328", gap: 8, opacity: 0.8, padding: 4 }}>inbox 16</ul>
      <Muted>Muted</Muted>
      <ul css={{ whiteSpace: "nowrap", gap: 8, display: "flex", padding: 4 }}>inbox 17</ul>
      <article css={{ display: "flex", gridArea: "area278", color: "#1f2328" }}>inbox 18</article>
      <span
        css={{
          top: "279px",
          flex: "none",
          gridTemplateColumns: "repeat(2, minmax(400px, 1fr))",
          fontWeight: 600,
          width: "1043px",
        }}
      >
        inbox 19
      </span>
      <footer
        css={{
          color: "#1f2328",
          fontWeight: 600,
          justifyContent: "space-between",
          gap: 8,
          ":hover": { whiteSpace: "nowrap" },
        }}
      >
        inbox 20
      </footer>
      <Dialog>Dialog</Dialog>
      <div css={{ padding: 4, background: "#ddf4ff", height: "612px", position: "relative" }}>inbox 21</div>
      <div
        css={{
          minHeight: "443px",
          paddingInline: 8,
          maxWidth: "1616px",
          paddingBlock: 4,
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        inbox 22
      </div>
      <div
        css={{
          color: "hsl(75 60% 40%)",
          margin: 0,
          background: "hsl(14 80% 96%)",
          paddingInline: 8,
          "@media (max-width: 768px)": { display: "block", padding: 12 },
        }}
      >
        inbox 23
      </div>
      <span css={{ transform: "translateY(4px)", lineHeight: 1.5, position: "sticky", aspectRatio: "7 / 3" }}>
        inbox 24
      </span>
      <Row>Row</Row>
      <ul
        css={{
          textTransform: "uppercase",
          borderLeft: "4px solid hsl(197 70% 50%)",
          zIndex: 300,
          color: "#1f2328",
          fontWeight: 600,
          margin: 0,
        }}
      >
        inbox 25
      </ul>
      <p css={{ background: "#ffffff", alignItems: "start", opacity: 0.4, padding: 4, color: "#ffffff" }}>inbox 26</p>
      <footer
        css={{
          gridArea: "area292",
          top: "293px",
          fontSize: 14,
          gridTemplateColumns: "repeat(6, minmax(414px, 1fr))",
          padding: 16,
          alignItems: "center",
          color: "#1f2328",
        }}
      >
        inbox 27
      </footer>
      <section css={{ display: "flex", borderBottom: "1px solid #d0d7de", width: "1085px", height: "640px" }}>
        inbox 28
      </section>
      <Row>Row</Row>
      <li css={{ color: "#1f2328", textAlign: "left", padding: 4 }}>inbox 29</li>
      <ul css={{ textAlign: "left", gap: 8, boxShadow: "0 8px 24px rgba(140,149,159,0.2)" }}>inbox 30</ul>
      <header
        css={{
          display: "flex",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          minHeight: "457px",
          maxWidth: "1672px",
        }}
      >
        inbox 31
      </header>
      <span
        css={{
          padding: 4,
          fontSize: 14,
          display: "grid",
          justifyContent: "space-between",
          color: "hsl(13 60% 40%)",
          gap: 8,
        }}
      >
        inbox 32
      </span>
      <Stack>Stack</Stack>
      <footer
        css={{
          borderRadius: 6,
          gap: 8,
          alignItems: "center",
          color: "#1f2328",
          display: "flex",
          margin: 8,
          ":hover": { padding: 4 },
        }}
      >
        inbox 33
      </footer>
      <ul
        css={{
          background: "hsl(60 80% 96%)",
          borderBottom: "1px solid #d0d7de",
          cursor: "pointer",
          flex: "none",
          ":hover": { fontSize: 12 },
        }}
      >
        inbox 34
      </ul>
      <li css={{ borderRadius: 8, background: "#eaeef2", whiteSpace: "nowrap", display: "flex" }}>inbox 35</li>
      <span
        css={{
          whiteSpace: "nowrap",
          color: "#1f2328",
          alignItems: "center",
          background: "#f6f8fa",
          margin: 0,
          padding: 40,
          transform: "translateY(0px)",
          ":hover": { fontWeight: 500 },
          "@media (max-width: 768px)": { display: "block", padding: 8 },
        }}
      >
        inbox 36
      </span>
      <Dialog>Dialog</Dialog>
      <aside
        css={{
          aspectRatio: "6 / 3",
          borderLeft: "4px solid hsl(219 70% 50%)",
          display: "flex",
          color: "#1f2328",
          padding: 4,
        }}
      >
        inbox 37
      </aside>
      <span css={{ zIndex: 314, margin: 0, opacity: 0.9 }}>inbox 38</span>
      <ul
        css={{
          border: "1px solid #d0d7de",
          gridArea: "area306",
          fontWeight: 600,
          textAlign: "center",
          flex: "none",
          textTransform: "uppercase",
        }}
      >
        inbox 39
      </ul>
      <Text>Text</Text>
      <Heading>Heading</Heading>
      <Badge>Badge</Badge>
      <Avatar>Avatar</Avatar>
    </Stack>
  );
}
