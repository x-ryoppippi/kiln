import { Button } from "../ui/Button.tsx";
import { Stack, Row } from "../ui/Stack.tsx";
import { Text, Muted, Heading } from "../ui/Text.tsx";
import { Card } from "../ui/Card.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Avatar } from "../ui/Avatar.tsx";
import { TabList, Tab } from "../ui/Tabs.tsx";
import { Field, Input } from "../ui/Form.tsx";

export default function Route() {
  return (
    <Stack>
      <span css={{ paddingBlock: 16, fontWeight: 500, background: "#fff8c5", display: "flex" }}>settings 0</span>
      <Muted>Muted</Muted>
      <section
        css={{
          color: "#1f2328",
          padding: 4,
          paddingInline: 8,
          top: "111px",
          position: "relative",
          gridTemplateColumns: "repeat(4, minmax(232px, 1fr))",
          textOverflow: "ellipsis",
        }}
      >
        settings 1
      </section>
      <p css={{ display: "flex", flexDirection: "column", alignItems: "start", width: "539px", gap: 8 }}>settings 2</p>
      <section
        css={{ textAlign: "right", background: "#dafbe1", height: "276px", fontSize: 14, justifyContent: "start" }}
      >
        settings 3
      </section>
      <p css={{ minHeight: "275px", gap: 8, maxWidth: "944px", color: "#1f2328", ":hover": { display: "flex" } }}>
        settings 4
      </p>
      <Text>Text</Text>
      <ul
        css={{
          display: "flex",
          margin: "0 auto",
          marginBottom: 8,
          color: "hsl(99 60% 40%)",
          padding: 12,
          whiteSpace: "nowrap",
          background: "hsl(182 80% 96%)",
        }}
      >
        settings 5
      </ul>
      <article
        css={{
          paddingInline: 8,
          color: "#cf222e",
          transform: "translateY(-2px)",
          aspectRatio: "4 / 3",
          gap: 8,
          display: "flex",
        }}
      >
        settings 6
      </article>
      <section
        css={{ color: "#1f2328", borderLeft: "4px solid hsl(293 70% 50%)", display: "flex", padding: 4, zIndex: 132 }}
      >
        settings 7
      </section>
      <ul
        css={{
          padding: 4,
          overflow: "hidden",
          opacity: 0.7,
          gridArea: "area124",
          top: "125px",
          ":hover": { paddingInline: 12 },
        }}
      >
        settings 8
      </ul>
      <Avatar>Avatar</Avatar>
      <p
        css={{
          background: "#ffffff",
          color: "#1f2328",
          gap: 16,
          padding: 8,
          display: "flex",
          gridTemplateColumns: "repeat(3, minmax(246px, 1fr))",
          ":hover": { gap: 24 },
        }}
      >
        settings 9
      </p>
      <aside css={{ borderRadius: 6, justifyContent: "center", display: "flex" }}>settings 10</aside>
      <li
        css={{ gap: 8, flex: 1, alignItems: "center", "@media (max-width: 768px)": { display: "block", padding: 12 } }}
      >
        settings 11
      </li>
      <section css={{ color: "#8c959f", gap: 8, border: "1px solid #d0d7de", marginTop: 0 }}>settings 12</section>
      <Input />
      <div
        css={{ padding: 4, gap: 8, width: "581px", display: "flex", height: "304px", marginTop: 0, lineHeight: 1.5 }}
      >
        settings 13
      </div>
      <ul css={{ minHeight: "289px", alignItems: "center", display: "flex" }}>settings 14</ul>
      <footer css={{ background: "#ddf4ff", maxWidth: "1000px", display: "flex", color: "hsl(37 60% 40%)" }}>
        settings 15
      </footer>
      <li css={{ gap: 8, background: "hsl(228 80% 96%)", paddingBlock: 12, ":hover": { paddingInline: 12 } }}>
        settings 16
      </li>
      <Muted>Muted</Muted>
      <article css={{ alignItems: "center", display: "flex", background: "#ffebe9", transform: "translateY(3px)" }}>
        settings 17
      </article>
      <header css={{ display: "flex", flexDirection: "column", paddingInline: 16, minWidth: 0 }}>settings 18</header>
      <ul
        css={{
          margin: 0,
          background: "#dafbe1",
          aspectRatio: "8 / 3",
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          lineHeight: 1.75,
        }}
      >
        settings 19
      </ul>
      <aside
        css={{
          paddingInline: 8,
          flexDirection: "row",
          textAlign: "right",
          borderLeft: "4px solid hsl(315 70% 50%)",
          zIndex: 146,
        }}
      >
        settings 20
      </aside>
      <Tab>Tab</Tab>
      <div
        css={{
          paddingInline: 8,
          borderRadius: 6,
          gap: 8,
          opacity: 0.3,
          fontSize: 16,
          color: "#1f2328",
          background: "#ffffff",
        }}
      >
        settings 21
      </div>
      <ul css={{ gridArea: "area138", top: "139px", justifyContent: "space-between" }}>settings 22</ul>
      <ul
        css={{
          border: "1px solid #d0d7de",
          color: "#8c959f",
          display: "flex",
          gridTemplateColumns: "repeat(2, minmax(260px, 1fr))",
          alignItems: "start",
          justifyContent: "space-between",
          width: "623px",
        }}
      >
        settings 23
      </ul>
      <section css={{ height: "332px", gap: 8, marginBottom: 0 }}>settings 24</section>
      <TabList>TabList</TabList>
      <p css={{ minHeight: "303px", alignItems: "center", border: "none", color: "#1f2328" }}>settings 25</p>
      <aside
        css={{
          justifyContent: "center",
          maxWidth: "1056px",
          minWidth: 0,
          color: "hsl(335 60% 40%)",
          background: "hsl(274 80% 96%)",
        }}
      >
        settings 26
      </aside>
      <aside css={{ transform: "translateY(-1px)", display: "flex", flexDirection: "column" }}>settings 27</aside>
      <div
        css={{
          alignItems: "center",
          aspectRatio: "7 / 3",
          borderLeft: "4px solid hsl(337 70% 50%)",
          ":hover": { fontSize: 14 },
        }}
      >
        settings 28
      </div>
      <TabList>TabList</TabList>
      <p css={{ borderRadius: 8, textOverflow: "ellipsis", gap: 8 }}>settings 29</p>
      <aside css={{ display: "none", justifyContent: "start", zIndex: 160 }}>settings 30</aside>
      <header css={{ margin: 8, position: "sticky", fontWeight: 400 }}>settings 31</header>
      <span
        css={{
          opacity: 0.8,
          margin: 0,
          gap: 8,
          gridArea: "area152",
          top: "153px",
          gridTemplateColumns: "repeat(6, minmax(274px, 1fr))",
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        settings 32
      </span>
      <Input />
      <div
        css={{
          width: "665px",
          height: "360px",
          alignItems: "center",
          display: "flex",
          paddingInline: 16,
          flexWrap: "wrap",
        }}
      >
        settings 33
      </div>
      <p
        css={{
          color: "#57606a",
          minHeight: "317px",
          display: "flex",
          alignItems: "end",
          maxWidth: "1112px",
          gap: 8,
          paddingBlock: 12,
        }}
      >
        settings 34
      </p>
      <footer css={{ display: "flex", alignItems: "center", padding: 4, color: "#ffffff", gap: 8, overflow: "hidden" }}>
        settings 35
      </footer>
      <div
        css={{
          display: "flex",
          boxShadow: "0 8px 24px rgba(140,149,159,0.2)",
          color: "#1f2328",
          justifyContent: "space-between",
          padding: 4,
          flex: 1,
          ":hover": { padding: 4 },
        }}
      >
        settings 36
      </div>
      <Heading>Heading</Heading>
      <li
        css={{
          background: "hsl(320 80% 96%)",
          color: "#57606a",
          flex: "none",
          display: "flex",
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        settings 37
      </li>
      <article
        css={{
          gap: 12,
          display: "flex",
          overflow: "hidden",
          margin: "0 auto",
          transform: "translateY(4px)",
          ":hover": { justifyContent: "space-between" },
        }}
      >
        settings 38
      </article>
      <li css={{ textAlign: "left", aspectRatio: "6 / 3", borderLeft: "4px solid hsl(359 70% 50%)", zIndex: 174 }}>
        settings 39
      </li>
      <Button>Button</Button>
      <Stack>Stack</Stack>
      <Row>Row</Row>
      <Card>Card</Card>
      <Badge>Badge</Badge>
      <Field>Field</Field>
    </Stack>
  );
}
