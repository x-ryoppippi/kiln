import { Button } from "../ui/Button.tsx";
import { Stack, Row } from "../ui/Stack.tsx";
import { Text, Muted, Heading } from "../ui/Text.tsx";
import { Card } from "../ui/Card.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Table, Th, Td } from "../ui/Table.tsx";
import { Dialog } from "../ui/Modal.tsx";
import { Field, Input } from "../ui/Form.tsx";

export default function Route() {
  return (
    <Stack>
      <section
        css={{ overflow: "hidden", display: "flex", marginBottom: 8, paddingBlock: 12, ":hover": { padding: 4 } }}
      >
        billing 0
      </section>
      <Stack>Stack</Stack>
      <section css={{ color: "#1f2328", fontSize: 14, display: "flex", width: "100%", position: "relative" }}>
        billing 1
      </section>
      <article css={{ aspectRatio: "7 / 3", display: "flex", borderLeft: "4px solid hsl(337 70% 50%)" }}>
        billing 2
      </article>
      <span
        css={{
          padding: 20,
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 8,
          fontWeight: 500,
          textTransform: "uppercase",
          fontSize: 14,
        }}
      >
        billing 3
      </span>
      <li css={{ fontWeight: 500, display: "flex", whiteSpace: "nowrap", zIndex: 160 }}>billing 4</li>
      <Table>Table</Table>
      <article css={{ gap: 8, opacity: 0.8, gridArea: "area152", alignItems: "center", fontSize: 24, padding: 4 }}>
        billing 5
      </article>
      <header
        css={{
          color: "#1f2328",
          top: "153px",
          gridTemplateColumns: "repeat(6, minmax(274px, 1fr))",
          display: "flex",
          fontSize: 32,
          textAlign: "left",
          ":hover": { paddingBlock: 4 },
        }}
      >
        billing 6
      </header>
      <header
        css={{ fontSize: 14, width: "665px", fontWeight: 600, margin: 16, display: "flex", ":hover": { padding: 4 } }}
      >
        billing 7
      </header>
      <li css={{ position: "relative", cursor: "pointer", height: "360px", color: "#1f2328", minWidth: 0 }}>
        billing 8
      </li>
      <Row>Row</Row>
      <div
        css={{
          minHeight: "317px",
          display: "flex",
          paddingInline: 8,
          fontSize: 14,
          maxWidth: "1112px",
          textAlign: "left",
        }}
      >
        billing 9
      </div>
      <li
        css={{
          marginTop: 8,
          margin: 0,
          alignItems: "center",
          display: "flex",
          fontWeight: 400,
          color: "hsl(273 60% 40%)",
          background: "hsl(320 80% 96%)",
        }}
      >
        billing 10
      </li>
      <ul
        css={{
          display: "flex",
          gap: 8,
          transform: "translateY(4px)",
          color: "#1f2328",
          aspectRatio: "6 / 3",
          ":hover": { display: "flex" },
        }}
      >
        billing 11
      </ul>
      <footer
        css={{
          borderLeft: "4px solid hsl(359 70% 50%)",
          justifyContent: "flex-end",
          display: "flex",
          marginTop: 0,
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        billing 12
      </footer>
      <Table>Table</Table>
      <article
        css={{
          zIndex: 174,
          background: "#ffffff",
          padding: 4,
          opacity: 0.4,
          display: "flex",
          gridArea: "area166",
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        billing 13
      </article>
      <ul css={{ top: "167px", margin: 0, display: "flex" }}>billing 14</ul>
      <ul css={{ overflow: "hidden", display: "block", padding: 4 }}>billing 15</ul>
      <span
        css={{
          gridTemplateColumns: "repeat(5, minmax(288px, 1fr))",
          width: "707px",
          height: "388px",
          padding: 4,
          margin: 0,
        }}
      >
        billing 16
      </span>
      <Badge>Badge</Badge>
      <div css={{ background: "#ffebe9", whiteSpace: "nowrap", minHeight: "331px" }}>billing 17</div>
      <article
        css={{
          fontSize: 14,
          borderRadius: 8,
          maxWidth: "1168px",
          background: "#dafbe1",
          color: "hsl(211 60% 40%)",
          display: "flex",
          flexWrap: "wrap",
          "@media (max-width: 768px)": { display: "block", padding: 8 },
        }}
      >
        billing 18
      </article>
      <span
        css={{
          color: "#1f2328",
          border: "1px solid #d0d7de",
          justifyContent: "space-between",
          cursor: "pointer",
          transform: "translateY(0px)",
          display: "inline-flex",
        }}
      >
        billing 19
      </span>
      <div
        css={{
          aspectRatio: "5 / 3",
          borderLeft: "4px solid hsl(21 70% 50%)",
          justifyContent: "start",
          display: "flex",
          color: "#1f2328",
          border: "1px solid #d0d7de",
          zIndex: 188,
        }}
      >
        billing 20
      </div>
      <Input />
      <ul
        css={{
          margin: 0,
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          fontSize: 14,
          color: "#1f2328",
          flexWrap: "wrap",
        }}
      >
        billing 21
      </ul>
      <ul css={{ display: "flex", marginTop: 24, border: "none", color: "#1f2328", opacity: 0.9, width: "100%" }}>
        billing 22
      </ul>
      <aside
        css={{ flexWrap: "wrap", color: "#1f2328", marginBottom: 16, justifyContent: "start", gridArea: "area180" }}
      >
        billing 23
      </aside>
      <section css={{ top: "181px", justifyContent: "flex-end", gridTemplateColumns: "repeat(4, minmax(302px, 1fr))" }}>
        billing 24
      </section>
      <Table>Table</Table>
      <article
        css={{
          width: "749px",
          height: "416px",
          color: "#1f2328",
          display: "flex",
          padding: 4,
          minHeight: "345px",
          borderBottom: "1px solid #d0d7de",
          ":hover": { border: "1px solid #d0d7de" },
        }}
      >
        billing 25
      </article>
      <article
        css={{
          maxWidth: "1224px",
          borderRadius: 6,
          justifyContent: "start",
          display: "flex",
          cursor: "pointer",
          color: "hsl(149 60% 40%)",
          alignItems: "center",
        }}
      >
        billing 26
      </article>
      <aside
        css={{ color: "#1f2328", display: "flex", background: "hsl(52 80% 96%)", alignItems: "center", fontSize: 14 }}
      >
        billing 27
      </aside>
      <p
        css={{
          position: "relative",
          marginTop: 0,
          border: "1px solid #d0d7de",
          transform: "translateY(-4px)",
          fontSize: 14,
          aspectRatio: "4 / 3",
        }}
      >
        billing 28
      </p>
      <Field>Field</Field>
      <li css={{ gap: 8, padding: 4, borderLeft: "4px solid hsl(43 70% 50%)", zIndex: 202, borderRadius: 12 }}>
        billing 29
      </li>
      <aside css={{ display: "flex", background: "#ffffff", marginTop: 8, justifyContent: "space-between" }}>
        billing 30
      </aside>
      <section
        css={{ flexDirection: "column", opacity: 0.5, gridArea: "area194", display: "flex", gap: 16, top: "195px" }}
      >
        billing 31
      </section>
      <ul
        css={{
          borderRadius: 4,
          display: "inline-flex",
          paddingBlock: 8,
          gridTemplateColumns: "repeat(3, minmax(316px, 1fr))",
        }}
      >
        billing 32
      </ul>
      <Stack>Stack</Stack>
      <section
        css={{
          display: "block",
          width: "791px",
          padding: 12,
          color: "#1f2328",
          paddingInline: 8,
          lineHeight: 1.5,
          "@media (max-width: 768px)": { display: "block", padding: 12 },
        }}
      >
        billing 33
      </section>
      <span
        css={{
          border: "1px solid #d0d7de",
          height: "444px",
          minHeight: "359px",
          marginBottom: 0,
          color: "#1f2328",
          gap: 8,
          ":hover": { display: "flex" },
        }}
      >
        billing 34
      </span>
      <p css={{ display: "flex", padding: 4, gap: 32, maxWidth: "1280px" }}>billing 35</p>
      <div
        css={{
          color: "hsl(87 60% 40%)",
          borderBottom: "1px solid #d0d7de",
          padding: 16,
          gap: 8,
          textOverflow: "ellipsis",
          ":hover": { color: "#1f2328" },
        }}
      >
        billing 36
      </div>
      <Td>Td</Td>
      <span
        css={{
          background: "hsl(98 80% 96%)",
          gap: 8,
          flexDirection: "column",
          display: "flex",
          paddingBlock: 16,
          ":hover": { overflow: "hidden" },
        }}
      >
        billing 37
      </span>
      <ul
        css={{
          position: "sticky",
          transform: "translateY(1px)",
          padding: 4,
          textAlign: "left",
          overflow: "auto",
          aspectRatio: "8 / 3",
        }}
      >
        billing 38
      </ul>
      <footer
        css={{
          position: "relative",
          borderLeft: "4px solid hsl(65 70% 50%)",
          gap: 8,
          marginBottom: 0,
          background: "#ddf4ff",
        }}
      >
        billing 39
      </footer>
      <Button>Button</Button>
      <Text>Text</Text>
      <Muted>Muted</Muted>
      <Heading>Heading</Heading>
      <Card>Card</Card>
      <Th>Th</Th>
      <Dialog>Dialog</Dialog>
    </Stack>
  );
}
