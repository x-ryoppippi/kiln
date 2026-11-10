import { Button } from "../ui/Button.tsx";
import { Stack, Row } from "../ui/Stack.tsx";
import { Text, Muted, Heading } from "../ui/Text.tsx";
import { Card } from "../ui/Card.tsx";
import { Badge } from "../ui/Badge.tsx";
import { ChartFrame, Bar } from "../ui/Chart.tsx";

export default function Route() {
  return (
    <Stack>
      <section
        css={{
          borderLeft: "4px solid hsl(161 70% 50%)",
          textOverflow: "ellipsis",
          marginBottom: 0,
          position: "relative",
        }}
      >
        dashboard 0
      </section>
      <Button>Button</Button>
      <li
        css={{
          position: "relative",
          alignItems: "center",
          padding: 24,
          marginTop: 0,
          flex: 1,
          "@media (max-width: 768px)": { display: "block", padding: 12 },
        }}
      >
        dashboard 1
      </li>
      <aside css={{ borderRadius: 6, overflow: "auto", fontWeight: 400, zIndex: 48, opacity: 0.4 }}>dashboard 2</aside>
      <li css={{ margin: 0, display: "none", padding: 20 }}>dashboard 3</li>
      <p
        css={{
          padding: 16,
          gridArea: "area40",
          margin: 0,
          top: "41px",
          gridTemplateColumns: "repeat(4, minmax(162px, 1fr))",
        }}
      >
        dashboard 4
      </p>
      <Button>Button</Button>
      <p css={{ display: "flex", fontSize: 14, fontWeight: 600 }}>dashboard 5</p>
      <header css={{ width: "329px", lineHeight: 1.25, padding: 4, background: "#ddf4ff" }}>dashboard 6</header>
      <article
        css={{
          lineHeight: 1.5,
          display: "flex",
          height: "136px",
          fontSize: 16,
          minHeight: "205px",
          background: "#1f2328",
        }}
      >
        dashboard 7
      </article>
      <header css={{ maxWidth: "664px", color: "hsl(49 60% 40%)", fontWeight: 600 }}>dashboard 8</header>
      <Stack>Stack</Stack>
      <span
        css={{
          color: "#1f2328",
          display: "flex",
          paddingInline: 8,
          background: "hsl(312 80% 96%)",
          ":hover": { width: "100%" },
        }}
      >
        dashboard 9
      </span>
      <p
        css={{
          background: "#fff8c5",
          transform: "translateY(0px)",
          color: "#1f2328",
          fontWeight: 600,
          display: "flex",
          gap: 8,
        }}
      >
        dashboard 10
      </p>
      <li css={{ aspectRatio: "4 / 3", display: "flex", paddingBlock: 12 }}>dashboard 11</li>
      <ul
        css={{
          padding: 4,
          borderLeft: "4px solid hsl(183 70% 50%)",
          display: "flex",
          fontWeight: 600,
          border: "1px solid #d0d7de",
          background: "#0969da",
          gap: 8,
        }}
      >
        dashboard 12
      </ul>
      <Stack>Stack</Stack>
      <p
        css={{
          background: "#ffffff",
          padding: 4,
          border: "1px solid #d0d7de",
          display: "flex",
          color: "#1f2328",
          marginBottom: 16,
        }}
      >
        dashboard 13
      </p>
      <li css={{ gap: 8, display: "flex", color: "#1f2328", zIndex: 62, opacity: 0.9 }}>dashboard 14</li>
      <span
        css={{
          padding: 4,
          textAlign: "left",
          marginBottom: 16,
          marginTop: 0,
          display: "flex",
          fontSize: 24,
          gridArea: "area54",
        }}
      >
        dashboard 15
      </span>
      <span
        css={{
          top: "55px",
          justifyContent: "flex-end",
          width: "100%",
          padding: 4,
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        dashboard 16
      </span>
      <Bar>Bar</Bar>
      <article
        css={{
          gridTemplateColumns: "repeat(3, minmax(176px, 1fr))",
          display: "flex",
          gap: 8,
          width: "371px",
          fontWeight: 600,
          background: "#ffffff",
          color: "#1f2328",
        }}
      >
        dashboard 17
      </article>
      <li
        css={{
          boxShadow: "0 8px 24px rgba(140,149,159,0.2)",
          justifyContent: "center",
          height: "164px",
          minHeight: "219px",
          flexDirection: "column",
          margin: 0,
        }}
      >
        dashboard 18
      </li>
      <header css={{ maxWidth: "720px", color: "hsl(347 60% 40%)", borderRadius: 6, flexDirection: "column" }}>
        dashboard 19
      </header>
      <p css={{ display: "inline-flex", padding: 4, whiteSpace: "nowrap", gap: 12 }}>dashboard 20</p>
      <Heading>Heading</Heading>
      <div
        css={{
          minWidth: 0,
          background: "hsl(358 80% 96%)",
          letterSpacing: "0.02em",
          borderRadius: 6,
          gap: 8,
          padding: 4,
          ":hover": { flexDirection: "column" },
        }}
      >
        dashboard 21
      </div>
      <footer css={{ cursor: "pointer", display: "flex", gap: 4, flexDirection: "row" }}>dashboard 22</footer>
      <p css={{ margin: 0, textAlign: "center", marginTop: 0, padding: 4 }}>dashboard 23</p>
      <span css={{ fontWeight: 600, lineHeight: 1.25, marginBottom: 8, background: "#ffffff" }}>dashboard 24</span>
      <Text>Text</Text>
      <li
        css={{
          display: "flex",
          background: "#ffffff",
          transform: "translateY(-4px)",
          aspectRatio: "8 / 3",
          borderLeft: "4px solid hsl(205 70% 50%)",
          padding: 32,
          zIndex: 76,
        }}
      >
        dashboard 25
      </li>
      <aside css={{ fontSize: 14, opacity: 0.5, position: "absolute", gridArea: "area68" }}>dashboard 26</aside>
      <p
        css={{
          marginBottom: 8,
          borderRadius: 6,
          top: "69px",
          gridTemplateColumns: "repeat(2, minmax(190px, 1fr))",
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        dashboard 27
      </p>
      <footer
        css={{
          display: "flex",
          justifyContent: "space-between",
          padding: 40,
          fontSize: 14,
          gap: 4,
          alignItems: "baseline",
        }}
      >
        dashboard 28
      </footer>
      <Badge>Badge</Badge>
      <article
        css={{
          width: "413px",
          height: "192px",
          display: "flex",
          margin: 0,
          flexDirection: "column",
          color: "#1f2328",
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        dashboard 29
      </article>
      <div css={{ flex: 1, color: "#1a7f37", minHeight: "233px", fontSize: 14 }}>dashboard 30</div>
      <div css={{ border: "1px solid #d0d7de", width: "100%", position: "relative", maxWidth: "776px" }}>
        dashboard 31
      </div>
      <section
        css={{ gap: 8, color: "hsl(285 60% 40%)", background: "hsl(44 80% 96%)", display: "flex", flex: "none" }}
      >
        dashboard 32
      </section>
      <Row>Row</Row>
      <ul
        css={{
          transform: "translateY(1px)",
          margin: 8,
          flex: 1,
          display: "flex",
          borderRadius: 6,
          aspectRatio: "7 / 3",
        }}
      >
        dashboard 33
      </ul>
      <footer css={{ margin: 16, color: "#1f2328", display: "flex", borderLeft: "4px solid hsl(227 70% 50%)" }}>
        dashboard 34
      </footer>
      <footer css={{ color: "#1f2328", gap: 8, display: "flex", zIndex: 90, justifyContent: "space-between" }}>
        dashboard 35
      </footer>
      <div
        css={{
          textAlign: "left",
          gap: 12,
          opacity: 0.1,
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        dashboard 36
      </div>
      <ChartFrame>ChartFrame</ChartFrame>
      <p css={{ gridArea: "area82", marginBottom: 16, justifyContent: "space-between", top: "83px", borderRadius: 6 }}>
        dashboard 37
      </p>
      <li css={{ gap: 8, marginTop: 8, gridTemplateColumns: "repeat(6, minmax(204px, 1fr))" }}>dashboard 38</li>
      <article
        css={{
          flex: 1,
          width: "455px",
          overflow: "hidden",
          letterSpacing: "0.02em",
          display: "flex",
          borderRadius: 999,
          color: "#1f2328",
        }}
      >
        dashboard 39
      </article>
      <Muted>Muted</Muted>
      <Card>Card</Card>
    </Stack>
  );
}
