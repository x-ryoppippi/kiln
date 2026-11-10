import { lazy, Suspense, useEffect, useState } from "react";
import { styled } from "kiln";

import { Home } from "./routes/home.tsx";
import { Badge } from "./ui/Badge.tsx";
import { Row } from "./ui/Stack.tsx";

const routes = {
  dashboard: lazy(() => import("./routes/dashboard.tsx")),
  users: lazy(() => import("./routes/users.tsx")),
  settings: lazy(() => import("./routes/settings.tsx")),
  billing: lazy(() => import("./routes/billing.tsx")),
  analytics: lazy(() => import("./routes/analytics.tsx")),
  reports: lazy(() => import("./routes/reports.tsx")),
  inbox: lazy(() => import("./routes/inbox.tsx")),
  docs: lazy(() => import("./routes/docs.tsx")),
};

const NavLink = styled("a", {
  display: "block",
  paddingInline: 12,
  paddingBlock: 8,
  borderRadius: 6,
  color: "#1f2328",
  textDecoration: "none",
  ":hover": { background: "#eaeef2" },
  "&[aria-current=page]": { background: "#ddf4ff", color: "#0969da", fontWeight: 600 },
});

function useHash() {
  const [hash, setHash] = useState(() => location.hash.slice(1));
  useEffect(() => {
    const update = () => setHash(location.hash.slice(1));
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const Route = Object.hasOwn(routes, hash) ? routes[hash as keyof typeof routes] : undefined;
  return (
    <div
      css={{
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        minHeight: "100vh",
        fontFamily: "system-ui",
        "@media (max-width: 768px)": { display: "block" },
      }}
    >
      <aside css={{ padding: 16, borderRight: "1px solid #d0d7de", background: "#f6f8fa" }}>
        <Row css={{ justifyContent: "space-between", marginBottom: 16 }}>
          <strong css={{ fontSize: 16 }}>Acme</strong>
          <Badge>beta</Badge>
        </Row>
        <nav css={{ display: "grid", gap: 4 }}>
          <NavLink href="#" aria-current={Route ? undefined : "page"}>
            home
          </NavLink>
          <NavLink href="#dashboard" aria-current={hash === "dashboard" ? "page" : undefined}>
            dashboard
          </NavLink>
          <NavLink href="#users" aria-current={hash === "users" ? "page" : undefined}>
            users
          </NavLink>
          <NavLink href="#settings" aria-current={hash === "settings" ? "page" : undefined}>
            settings
          </NavLink>
          <NavLink href="#billing" aria-current={hash === "billing" ? "page" : undefined}>
            billing
          </NavLink>
          <NavLink href="#analytics" aria-current={hash === "analytics" ? "page" : undefined}>
            analytics
          </NavLink>
          <NavLink href="#reports" aria-current={hash === "reports" ? "page" : undefined}>
            reports
          </NavLink>
          <NavLink href="#inbox" aria-current={hash === "inbox" ? "page" : undefined}>
            inbox
          </NavLink>
          <NavLink href="#docs" aria-current={hash === "docs" ? "page" : undefined}>
            docs
          </NavLink>
        </nav>
      </aside>
      <main css={{ padding: 24, minWidth: 0 }}>
        <Suspense fallback={<p css={{ color: "#57606a" }}>Loading…</p>}>{Route ? <Route /> : <Home />}</Suspense>
      </main>
    </div>
  );
}
