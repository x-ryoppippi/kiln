import { Button } from "../ui/Button.tsx";
import { Stack, Row } from "../ui/Stack.tsx";
import { Text, Muted, Heading } from "../ui/Text.tsx";
import { Card } from "../ui/Card.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Table, Th, Td } from "../ui/Table.tsx";
import { ChartFrame, Bar } from "../ui/Chart.tsx";
import { Pager, PageLink } from "../ui/Pagination.tsx";

export default function Route() {
  return (
    <Stack>
      <span css={{ borderRadius: 999, gridArea: "area222", background: "#ffffff", margin: 0 }}>reports 0</span>
      <Td>Td</Td>
      <footer
        css={{
          top: "223px",
          color: "#1f2328",
          paddingInline: 8,
          marginTop: 0,
          display: "flex",
          gridTemplateColumns: "repeat(6, minmax(344px, 1fr))",
        }}
      >
        reports 1
      </footer>
      <div css={{ color: "#1f2328", display: "flex", background: "#fff8c5" }}>reports 2</div>
      <footer
        css={{
          alignItems: "center",
          textAlign: "right",
          width: "875px",
          borderRadius: 6,
          height: "500px",
          lineHeight: 1.5,
        }}
      >
        reports 3
      </footer>
      <div
        css={{
          display: "flex",
          cursor: "pointer",
          minHeight: "387px",
          maxWidth: "1392px",
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          color: "#1f2328",
          justifyContent: "space-between",
        }}
      >
        reports 4
      </div>
      <ChartFrame>ChartFrame</ChartFrame>
      <ul css={{ color: "hsl(323 60% 40%)", letterSpacing: "0.02em", fontWeight: 600, marginTop: 0 }}>reports 5</ul>
      <span
        css={{
          color: "#1f2328",
          marginTop: 0,
          display: "flex",
          fontSize: 16,
          margin: 8,
          paddingBlock: 4,
          textAlign: "right",
        }}
      >
        reports 6
      </span>
      <span css={{ flexDirection: "row", borderBottom: "1px solid #d0d7de", color: "#1f2328", display: "flex" }}>
        reports 7
      </span>
      <section
        css={{
          fontSize: 20,
          paddingBlock: 4,
          lineHeight: 1.5,
          display: "grid",
          color: "#1f2328",
          padding: 4,
          overflow: "hidden",
        }}
      >
        reports 8
      </section>
      <Text>Text</Text>
      <header css={{ margin: 0, cursor: "pointer", display: "flex", gap: 8, justifyContent: "center" }}>
        reports 9
      </header>
      <section
        css={{
          justifyContent: "space-between",
          flexDirection: "column",
          paddingInline: 8,
          fontSize: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        reports 10
      </section>
      <span
        css={{
          display: "flex",
          color: "#1f2328",
          padding: 4,
          width: "auto",
          background: "#ffffff",
          fontSize: 14,
          ":hover": { marginTop: 8 },
        }}
      >
        reports 11
      </span>
      <ul css={{ transform: "translateY(2px)", fontSize: 14, aspectRatio: "6 / 3", gap: 8 }}>reports 12</ul>
      <PageLink>PageLink</PageLink>
      <aside
        css={{
          borderLeft: "4px solid hsl(109 70% 50%)",
          zIndex: 244,
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          opacity: 0.2,
          ":hover": { display: "grid" },
          "@media (max-width: 768px)": { display: "block", padding: 8 },
        }}
      >
        reports 13
      </aside>
      <div
        css={{
          gridArea: "area236",
          top: "237px",
          gridTemplateColumns: "repeat(5, minmax(358px, 1fr))",
          lineHeight: 1.5,
          gap: 8,
          width: "917px",
          "@media (max-width: 768px)": { display: "block", padding: 16 },
        }}
      >
        reports 14
      </div>
      <header
        css={{
          flex: 1,
          alignItems: "center",
          margin: 0,
          background: "#ffffff",
          "@media (max-width: 768px)": { display: "block", padding: 12 },
        }}
      >
        reports 15
      </header>
      <section css={{ flex: "none", borderRadius: 12, paddingBlock: 4, fontSize: 20 }}>reports 16</section>
      <Td>Td</Td>
      <ul css={{ display: "flex", gap: 8, color: "#1f2328", padding: 40, overflow: "hidden" }}>reports 17</ul>
      <article
        css={{
          boxShadow: "0 8px 24px rgba(140,149,159,0.2)",
          fontSize: 14,
          border: "1px solid #eaeef2",
          borderRadius: 8,
        }}
      >
        reports 18
      </article>
      <section
        css={{
          textOverflow: "ellipsis",
          padding: 4,
          display: "flex",
          color: "#1f2328",
          alignItems: "center",
          height: "528px",
        }}
      >
        reports 19
      </section>
      <li css={{ overflow: "hidden", border: "none", paddingInline: 8, whiteSpace: "nowrap", minHeight: "401px" }}>
        reports 20
      </li>
      <Button>Button</Button>
      <li
        css={{
          gap: 8,
          maxWidth: "1448px",
          fontWeight: 600,
          color: "hsl(261 60% 40%)",
          margin: 0,
          background: "hsl(236 80% 96%)",
        }}
      >
        reports 21
      </li>
      <footer css={{ whiteSpace: "nowrap", transform: "translateY(-2px)", color: "#57606a" }}>reports 22</footer>
      <footer
        css={{
          paddingBlock: 4,
          borderRadius: 999,
          color: "#1f2328",
          aspectRatio: "5 / 3",
          borderLeft: "4px solid hsl(131 70% 50%)",
          display: "flex",
          zIndex: 258,
          ":hover": { gap: 8 },
        }}
      >
        reports 23
      </footer>
      <p css={{ padding: 4, color: "#1f2328", fontWeight: 600 }}>reports 24</p>
      <Table>Table</Table>
      <ul css={{ display: "flex", flexDirection: "column", fontWeight: 400 }}>reports 25</ul>
      <section css={{ padding: 4, color: "#1f2328", opacity: 0.7, textAlign: "right" }}>reports 26</section>
      <span
        css={{
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          gridArea: "area250",
          color: "#1f2328",
          top: "251px",
          gridTemplateColumns: "repeat(4, minmax(372px, 1fr))",
          ":hover": { whiteSpace: "nowrap" },
        }}
      >
        reports 27
      </span>
      <ul css={{ padding: 32, width: "959px", background: "#0969da", display: "flex" }}>reports 28</ul>
      <Card>Card</Card>
      <ul css={{ display: "inline-flex", background: "#ffffff", padding: 4, color: "#1f2328", paddingInline: 8 }}>
        reports 29
      </ul>
      <article
        css={{
          height: "556px",
          boxShadow: "0 1px 3px rgba(31,35,40,0.12)",
          fontSize: 14,
          minHeight: "415px",
          textTransform: "uppercase",
        }}
      >
        reports 30
      </article>
      <p css={{ maxWidth: "1504px", color: "#1f2328", marginBottom: 16 }}>reports 31</p>
      <aside
        css={{
          display: "flex",
          position: "absolute",
          gap: 8,
          fontWeight: 600,
          color: "hsl(199 60% 40%)",
          background: "hsl(282 80% 96%)",
          transform: "translateY(3px)",
        }}
      >
        reports 32
      </aside>
      <Pager>Pager</Pager>
      <p css={{ flex: 1, position: "relative", background: "#ffffff", padding: 4 }}>reports 33</p>
      <ul css={{ gap: 8, minWidth: 0, color: "#1f2328", ":hover": { padding: 4 } }}>reports 34</ul>
      <article css={{ display: "flex", flexDirection: "row", aspectRatio: "4 / 3", padding: 40, lineHeight: 1.25 }}>
        reports 35
      </article>
      <aside
        css={{
          display: "flex",
          background: "#dafbe1",
          width: "100%",
          fontWeight: 600,
          color: "#1f2328",
          padding: 4,
          border: "1px solid #d0d7de",
        }}
      >
        reports 36
      </aside>
      <Pager>Pager</Pager>
      <header css={{ justifyContent: "space-between", borderLeft: "4px solid hsl(153 70% 50%)", zIndex: 272 }}>
        reports 37
      </header>
      <section css={{ display: "flex", border: "1px solid #d0d7de", opacity: 0.3 }}>reports 38</section>
      <div css={{ margin: 0, gridArea: "area264", top: "265px" }}>reports 39</div>
      <Stack>Stack</Stack>
      <Row>Row</Row>
      <Muted>Muted</Muted>
      <Heading>Heading</Heading>
      <Badge>Badge</Badge>
      <Th>Th</Th>
      <Bar>Bar</Bar>
    </Stack>
  );
}
