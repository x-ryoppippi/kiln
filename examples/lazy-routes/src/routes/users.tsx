import { Button } from "../ui/Button.tsx";
import { Stack, Row } from "../ui/Stack.tsx";
import { Text, Muted, Heading } from "../ui/Text.tsx";
import { Card } from "../ui/Card.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Table, Th, Td } from "../ui/Table.tsx";
import { Avatar } from "../ui/Avatar.tsx";
import { Field, Input } from "../ui/Form.tsx";
import { Pager, PageLink } from "../ui/Pagination.tsx";

export default function Route() {
  return (
    <Stack>
      <p
        css={{
          fontSize: 14,
          width: "100%",
          color: "#1f2328",
          display: "flex",
          fontWeight: 600,
          ":hover": { textAlign: "center" },
        }}
      >
        users 0
      </p>
      <Heading>Heading</Heading>
      <header css={{ display: "flex", margin: 8, marginTop: 0 }}>users 1</header>
      <section css={{ gap: 8, margin: 0, flexDirection: "column" }}>users 2</section>
      <header
        css={{
          marginTop: 0,
          border: "1px solid #d0d7de",
          maxWidth: "776px",
          fontWeight: 500,
          alignItems: "center",
          color: "hsl(285 60% 40%)",
        }}
      >
        users 3
      </header>
      <footer
        css={{
          background: "hsl(44 80% 96%)",
          transform: "translateY(1px)",
          overflow: "hidden",
          ":hover": { display: "flex" },
        }}
      >
        users 4
      </footer>
      <Text>Text</Text>
      <aside
        css={{
          aspectRatio: "7 / 3",
          color: "#9a6700",
          display: "flex",
          borderLeft: "4px solid hsl(227 70% 50%)",
          zIndex: 90,
          paddingBlock: 4,
        }}
      >
        users 5
      </aside>
      <footer
        css={{
          display: "flex",
          width: "100%",
          paddingInline: 12,
          flexDirection: "column",
          position: "relative",
          fontSize: 16,
        }}
      >
        users 6
      </footer>
      <footer css={{ fontWeight: 600, opacity: 0.1, padding: 8 }}>users 7</footer>
      <div
        css={{
          gridArea: "area82",
          lineHeight: 1.25,
          flexWrap: "wrap",
          top: "83px",
          color: "#9a6700",
          gridTemplateColumns: "repeat(6, minmax(204px, 1fr))",
          flexDirection: "column",
        }}
      >
        users 8
      </div>
      <Pager>Pager</Pager>
      <div
        css={{
          margin: "0 auto",
          width: "455px",
          height: "220px",
          display: "flex",
          lineHeight: 1.5,
          textTransform: "uppercase",
        }}
      >
        users 9
      </div>
      <ul css={{ alignItems: "center", display: "block", margin: "0 auto" }}>users 10</ul>
      <header css={{ alignItems: "center", display: "flex", minWidth: 0 }}>users 11</header>
      <li css={{ color: "#1f2328", minHeight: "247px", margin: 0, letterSpacing: "0.02em", paddingInline: 8 }}>
        users 12
      </li>
      <Button>Button</Button>
      <footer
        css={{ display: "flex", color: "#1f2328", maxWidth: "832px", margin: "0 auto", ":hover": { margin: "0 auto" } }}
      >
        users 13
      </footer>
      <li
        css={{
          color: "hsl(223 60% 40%)",
          borderRadius: 999,
          fontWeight: 600,
          paddingBlock: 4,
          flexDirection: "column",
        }}
      >
        users 14
      </li>
      <section css={{ justifyContent: "space-between", padding: 12, flex: "none" }}>users 15</section>
      <div
        css={{
          background: "hsl(90 80% 96%)",
          paddingInline: 8,
          transform: "translateY(-3px)",
          aspectRatio: "6 / 3",
          overflow: "hidden",
          display: "inline-flex",
        }}
      >
        users 16
      </div>
      <Field>Field</Field>
      <p
        css={{
          color: "#1f2328",
          textAlign: "left",
          borderLeft: "4px solid hsl(249 70% 50%)",
          zIndex: 104,
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        users 17
      </p>
      <section css={{ color: "#1f2328", textAlign: "left", opacity: 0.6, background: "#ffffff" }}>users 18</section>
      <li css={{ justifyContent: "center", fontSize: 14, padding: 4, margin: 0 }}>users 19</li>
      <header
        css={{
          gap: 8,
          background: "#eaeef2",
          paddingInline: 8,
          gridArea: "area96",
          top: "97px",
          textAlign: "center",
          "@media (max-width: 768px)": { display: "block", padding: 8 },
        }}
      >
        users 20
      </header>
      <Th>Th</Th>
      <ul
        css={{
          paddingInline: 8,
          justifyContent: "center",
          gridTemplateColumns: "repeat(5, minmax(218px, 1fr))",
          display: "flex",
          margin: 0,
          gap: 8,
        }}
      >
        users 21
      </ul>
      <p
        css={{
          width: "497px",
          cursor: "pointer",
          height: "248px",
          minHeight: "261px",
          margin: 0,
          display: "flex",
          fontSize: 14,
        }}
      >
        users 22
      </p>
      <header
        css={{
          alignItems: "center",
          fontSize: 16,
          maxWidth: "888px",
          color: "#1f2328",
          gap: 8,
          lineHeight: 1.5,
          display: "flex",
        }}
      >
        users 23
      </header>
      <aside
        css={{
          textAlign: "left",
          display: "flex",
          color: "hsl(161 60% 40%)",
          margin: "0 auto",
          background: "hsl(136 80% 96%)",
          paddingBlock: 4,
          transform: "translateY(2px)",
          "@media (max-width: 768px)": { display: "block", padding: 12 },
        }}
      >
        users 24
      </aside>
      <Row>Row</Row>
      <section css={{ lineHeight: 1.5, boxShadow: "0 8px 24px rgba(140,149,159,0.2)", gap: 8, marginTop: 0 }}>
        users 25
      </section>
      <ul css={{ aspectRatio: "5 / 3", width: "100%", display: "block", position: "sticky" }}>users 26</ul>
      <ul
        css={{
          borderLeft: "4px solid hsl(271 70% 50%)",
          paddingInline: 8,
          gap: 8,
          color: "#9a6700",
          justifyContent: "space-between",
          zIndex: 118,
        }}
      >
        users 27
      </ul>
      <div css={{ opacity: 0.2, gridArea: "area110", flexDirection: "column", top: "111px", color: "#1a7f37", gap: 8 }}>
        users 28
      </div>
      <PageLink>PageLink</PageLink>
      <footer css={{ background: "#ffffff", lineHeight: 1.5, marginTop: 8, fontWeight: 600, gap: 12 }}>users 29</footer>
      <p
        css={{
          whiteSpace: "nowrap",
          color: "#1f2328",
          gridTemplateColumns: "repeat(4, minmax(232px, 1fr))",
          fontSize: 16,
          lineHeight: 1.5,
          padding: 4,
          border: "1px solid #d0d7de",
          ":hover": { gap: 4 },
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        users 30
      </p>
      <footer css={{ padding: 4, width: "539px", textAlign: "left", boxShadow: "0 1px 3px rgba(31,35,40,0.12)" }}>
        users 31
      </footer>
      <header css={{ height: "276px", paddingBlock: 4, width: "auto", minHeight: "275px", flexDirection: "row" }}>
        users 32
      </header>
      <Muted>Muted</Muted>
      <div css={{ display: "flex", lineHeight: 1.5, margin: 0 }}>users 33</div>
      <div css={{ padding: 4, display: "flex", width: "100%", marginBottom: 24, fontWeight: 600, margin: 0 }}>
        users 34
      </div>
      <aside
        css={{ maxWidth: "944px", color: "hsl(99 60% 40%)", justifyContent: "flex-end", ":hover": { padding: 4 } }}
      >
        users 35
      </aside>
      <p
        css={{
          display: "flex",
          background: "hsl(182 80% 96%)",
          alignItems: "center",
          transform: "translateY(-2px)",
          paddingInline: 24,
          aspectRatio: "4 / 3",
        }}
      >
        users 36
      </p>
      <Input />
      <aside
        css={{ display: "flex", borderLeft: "4px solid hsl(293 70% 50%)", fontSize: 14, zIndex: 132, opacity: 0.7 }}
      >
        users 37
      </aside>
      <li
        css={{
          marginBottom: 0,
          display: "flex",
          border: "none",
          padding: 4,
          gridArea: "area124",
          fontSize: 14,
          letterSpacing: "0.02em",
        }}
      >
        users 38
      </li>
      <li css={{ flexDirection: "row", fontWeight: 600, textTransform: "uppercase", top: "125px", display: "flex" }}>
        users 39
      </li>
      <Stack>Stack</Stack>
      <Card>Card</Card>
      <Badge>Badge</Badge>
      <Table>Table</Table>
      <Td>Td</Td>
      <Avatar>Avatar</Avatar>
    </Stack>
  );
}
