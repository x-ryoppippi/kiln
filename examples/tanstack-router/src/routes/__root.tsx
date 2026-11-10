import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
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
  component: () => (
    <div css={{ maxWidth: 560, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <nav css={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <NavLink to="/">Home</NavLink>
        <NavLink to="/about">About</NavLink>
        <NavLink to="/team">Team</NavLink>
      </nav>
      <Outlet />
    </div>
  ),
});
