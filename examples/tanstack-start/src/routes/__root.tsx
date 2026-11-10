import type { ReactNode } from "react";
import { createRootRoute, HeadContent, Link, Scripts } from "@tanstack/react-router";
import { styled } from "kiln";

const NavLink = styled(Link, {
  padding: "4px 10px",
  borderRadius: 6,
  color: "#1f2328",
  textDecoration: "none",
  ":hover": { background: "#eaeef2" },
  "&[data-status=active]": { background: "#1f6feb", color: "white" },
});

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "kiln + TanStack Start" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body css={{ margin: 0, fontFamily: "system-ui", color: "#1f2328" }}>
        <div css={{ maxWidth: 560, margin: "0 auto", padding: 24 }}>
          <nav css={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <NavLink to="/">Home</NavLink>
            <NavLink to="/about">About</NavLink>
          </nav>
          {children}
        </div>
        <Scripts />
      </body>
    </html>
  );
}
