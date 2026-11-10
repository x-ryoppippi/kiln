import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: About,
});

function About() {
  return (
    <main css={{ display: "grid", gap: 8, padding: 24, borderRadius: 12, background: "#f6f8fa" }}>
      <h1 css={{ margin: 0, fontSize: 24, color: "#8250df" }}>About</h1>
      <p css={{ margin: 0, color: "#57606a" }}>This route is split into its own chunk, styles included.</p>
    </main>
  );
}
