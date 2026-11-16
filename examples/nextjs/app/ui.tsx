import { styled } from "kiln";

export const Main = styled("main", { display: "grid", gap: 16, maxWidth: 640, margin: "0 auto", padding: 32 });

export const Title = styled("h1", { margin: 0, fontSize: 28 });

export const Card = styled("section", {
  display: "grid",
  gap: 12,
  padding: 24,
  borderRadius: 12,
  background: "white",
  boxShadow: "0 1px 3px rgb(0 0 0 / 0.12)",
  ":hover": { boxShadow: "0 4px 12px rgb(0 0 0 / 0.16)" },
});

export const Badge = styled("span", ({ $tone }: { $tone: "server" | "client" }) => ({
  justifySelf: "start",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  color: "white",
  background: $tone === "server" ? "#8250df" : "#1a7f37",
}));
