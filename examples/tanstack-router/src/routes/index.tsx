import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { styled } from "kiln";

const Button = styled("button", {
  padding: "8px 16px",
  border: "none",
  borderRadius: 6,
  background: "#1f6feb",
  color: "white",
  cursor: "pointer",
  ":hover": { background: "#388bfd" },
});

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [count, setCount] = useState(0);

  return (
    <main css={{ display: "grid", gap: 12, padding: 24 }}>
      <h1 css={{ margin: 0, fontSize: 24 }}>kiln + TanStack Router</h1>
      <output css={{ fontWeight: 600, color: count % 2 ? "crimson" : "seagreen" }}>Clicked {count} times</output>
      <Button css={{ justifySelf: "start" }} onClick={() => setCount(count + 1)}>
        Increment
      </Button>
    </main>
  );
}
