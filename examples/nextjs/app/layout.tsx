import type { ReactNode } from "react";
import { styled } from "kiln";
import Link from "next/link";

export const metadata = { title: "kiln + Next.js" };

const NavLink = styled(Link, {
  padding: "4px 10px",
  borderRadius: 6,
  color: "#0969da",
  textDecoration: "none",
  ":hover": { background: "#ddf4ff" },
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body css={{ margin: 0, fontFamily: "system-ui", background: "#f6f8fa", color: "#1f2328" }}>
        <nav
          css={{
            display: "flex",
            gap: 8,
            padding: "12px 32px",
            borderBottom: "1px solid #d0d7de",
            background: "white",
          }}
        >
          <NavLink href="/">Home</NavLink>
          <NavLink href="/about">About</NavLink>
        </nav>
        {children}
      </body>
    </html>
  );
}
