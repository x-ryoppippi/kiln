import { Button } from "../ui/Button.tsx";
import { Stack, Row } from "../ui/Stack.tsx";
import { Text, Muted, Heading } from "../ui/Text.tsx";
import { Card } from "../ui/Card.tsx";
import { Badge } from "../ui/Badge.tsx";
import { TabList, Tab } from "../ui/Tabs.tsx";
import { Field, Input } from "../ui/Form.tsx";

export default function Route() {
  return (
    <Stack>
      <aside
        css={{
          padding: 12,
          marginBottom: 0,
          height: "640px",
          lineHeight: 1.75,
          whiteSpace: "nowrap",
          color: "#1f2328",
          ":hover": { alignItems: "start" },
        }}
      >
        docs 0
      </aside>
      <Badge>Badge</Badge>
      <span css={{ color: "#1f2328", padding: 4, marginTop: 0, display: "flex", margin: 0 }}>docs 1</span>
      <p css={{ minHeight: "457px", display: "grid", gap: 12, borderRadius: 6, color: "#57606a", minWidth: 0 }}>
        docs 2
      </p>
      <ul css={{ maxWidth: "1672px", borderRadius: 6, color: "#1f2328", flexDirection: "column", fontSize: 14 }}>
        docs 3
      </ul>
      <section css={{ alignItems: "center", lineHeight: 1.5, color: "hsl(13 60% 40%)" }}>docs 4</section>
      <Card>Card</Card>
      <div
        css={{
          borderRadius: 6,
          border: "1px solid #d0d7de",
          color: "#1f2328",
          display: "flex",
          background: "hsl(60 80% 96%)",
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
        }}
      >
        docs 5
      </div>
      <aside css={{ display: "flex", transform: "translateY(0px)", fontSize: 14, flexDirection: "row" }}>docs 6</aside>
      <aside
        css={{
          aspectRatio: "6 / 3",
          background: "#ffffff",
          gap: 16,
          borderLeft: "4px solid hsl(219 70% 50%)",
          ":hover": { padding: 4 },
        }}
      >
        docs 7
      </aside>
      <section css={{ gap: 8, padding: 4, zIndex: 314 }}>docs 8</section>
      <Field>Field</Field>
      <div css={{ alignItems: "center", justifyContent: "space-between", color: "#1f2328", opacity: 0.9 }}>docs 9</div>
      <li css={{ gridArea: "area306", gap: 8, borderBottom: "1px solid #d0d7de", top: "307px", margin: 0 }}>docs 10</li>
      <li css={{ color: "#1f2328", gridTemplateColumns: "repeat(5, minmax(428px, 1fr))", display: "flex" }}>docs 11</li>
      <div
        css={{
          justifyContent: "space-between",
          width: "1127px",
          display: "flex",
          fontSize: 16,
          fontWeight: 600,
          paddingBlock: 8,
        }}
      >
        docs 12
      </div>
      <Input />
      <ul css={{ justifyContent: "center", display: "flex", fontSize: 20, height: "668px", padding: 8 }}>docs 13</ul>
      <article
        css={{ textAlign: "center", minHeight: "471px", display: "flex", maxWidth: "1728px", gap: 8, paddingBlock: 12 }}
      >
        docs 14
      </article>
      <aside
        css={{
          color: "hsl(311 60% 40%)",
          background: "hsl(106 80% 96%)",
          transform: "translateY(-4px)",
          aspectRatio: "5 / 3",
          flexWrap: "wrap",
          display: "flex",
          gap: 8,
          ":hover": { gap: 8 },
        }}
      >
        docs 15
      </aside>
      <header
        css={{
          padding: 4,
          background: "#ffffff",
          borderLeft: "4px solid hsl(241 70% 50%)",
          fontSize: 14,
          fontWeight: 500,
          display: "flex",
          zIndex: 328,
          ":hover": { color: "#1f2328" },
        }}
      >
        docs 16
      </header>
      <Tab>Tab</Tab>
      <article css={{ justifyContent: "space-between", opacity: 0.5, display: "flex", margin: 0, gridArea: "area320" }}>
        docs 17
      </article>
      <footer css={{ color: "#1f2328", top: "321px", display: "flex", ":hover": { paddingInline: 24 } }}>
        docs 18
      </footer>
      <p css={{ background: "#ffebe9", gridTemplateColumns: "repeat(4, minmax(442px, 1fr))", margin: 0 }}>docs 19</p>
      <li css={{ width: "1169px", height: "696px", lineHeight: 1.25, minHeight: "485px", fontWeight: 600 }}>docs 20</li>
      <TabList>TabList</TabList>
      <footer
        css={{ display: "flex", maxWidth: "1784px", color: "#1f2328", marginBottom: 0, gap: 24, alignItems: "center" }}
      >
        docs 21
      </footer>
      <li
        css={{
          textAlign: "center",
          background: "#ffffff",
          transform: "translateY(1px)",
          border: "1px solid #d0d7de",
          display: "inline-flex",
        }}
      >
        docs 22
      </li>
      <li
        css={{
          aspectRatio: "4 / 3",
          paddingBlock: 4,
          minWidth: 0,
          margin: 0,
          borderLeft: "4px solid hsl(263 70% 50%)",
          justifyContent: "flex-end",
        }}
      >
        docs 23
      </li>
      <span css={{ display: "flex", color: "#ffffff", fontWeight: 400, zIndex: 342 }}>docs 24</span>
      <Field>Field</Field>
      <p
        css={{
          lineHeight: 1.5,
          padding: 4,
          borderBottom: "1px solid #d0d7de",
          opacity: 0.1,
          paddingInline: 16,
          background: "#0969da",
          "@media (max-width: 768px)": { display: "block", padding: 12 },
        }}
      >
        docs 25
      </p>
      <li
        css={{
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          borderRadius: 8,
          overflow: "hidden",
          padding: 12,
          display: "flex",
        }}
      >
        docs 26
      </li>
      <ul
        css={{
          border: "none",
          borderRadius: 6,
          gridArea: "area334",
          padding: 4,
          top: "335px",
          letterSpacing: "0.02em",
          display: "flex",
          "@media (max-width: 768px)": { display: "block", padding: 12 },
        }}
      >
        docs 27
      </ul>
      <section css={{ gridTemplateColumns: "repeat(3, minmax(456px, 1fr))", borderRadius: 999, width: "1211px" }}>
        docs 28
      </section>
      <Heading>Heading</Heading>
      <aside
        css={{
          height: "724px",
          minHeight: "499px",
          color: "#ffffff",
          margin: 0,
          fontWeight: 600,
          textOverflow: "ellipsis",
          alignItems: "center",
        }}
      >
        docs 29
      </aside>
      <aside
        css={{
          color: "#1f2328",
          display: "flex",
          maxWidth: "1840px",
          lineHeight: 1.5,
          paddingBlock: 4,
          gap: 12,
          background: "#0969da",
        }}
      >
        docs 30
      </aside>
      <div css={{ flexDirection: "column", background: "hsl(198 80% 96%)", gap: 8, ":hover": { display: "flex" } }}>
        docs 31
      </div>
      <aside css={{ display: "flex", flexDirection: "column", flexWrap: "wrap", padding: 48 }}>docs 32</aside>
      <TabList>TabList</TabList>
      <footer
        css={{
          color: "#57606a",
          alignItems: "start",
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          padding: 4,
          gap: 8,
          transform: "translateY(-3px)",
          display: "flex",
        }}
      >
        docs 33
      </footer>
      <li
        css={{
          aspectRatio: "8 / 3",
          flexDirection: "column",
          letterSpacing: "0.02em",
          borderLeft: "4px solid hsl(285 70% 50%)",
          zIndex: 356,
        }}
      >
        docs 34
      </li>
      <div css={{ margin: 0, lineHeight: 1.5, marginTop: 0, fontSize: 24 }}>docs 35</div>
      <span
        css={{
          width: "auto",
          flex: 1,
          borderRadius: 6,
          opacity: 0.6,
          "@media (max-width: 768px)": { display: "block", padding: 8 },
        }}
      >
        docs 36
      </span>
      <Card>Card</Card>
      <p
        css={{
          color: "#1f2328",
          background: "#ffebe9",
          paddingInline: 8,
          borderRadius: 6,
          textAlign: "center",
          alignItems: "center",
          display: "block",
          "@media (max-width: 768px)": { display: "block", padding: 12 },
        }}
      >
        docs 37
      </p>
      <footer css={{ gap: 8, lineHeight: 1.75, paddingBlock: 4 }}>docs 38</footer>
      <header css={{ justifyContent: "space-between", margin: 0, gap: 8 }}>docs 39</header>
      <Button>Button</Button>
      <Stack>Stack</Stack>
      <Row>Row</Row>
      <Text>Text</Text>
      <Muted>Muted</Muted>
    </Stack>
  );
}
