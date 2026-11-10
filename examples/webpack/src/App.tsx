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

export function App({ bundler }: { bundler: string }) {
  const [count, setCount] = useState(0);
  const progress = Math.min(count * 10, 100);

  return (
    <main css={{ display: "grid", gap: 12, maxWidth: 480, padding: 24, fontFamily: "system-ui" }}>
      <h1 css={{ margin: 0, fontSize: 24 }}>kiln + {bundler}</h1>
      <output css={{ fontWeight: 600, color: count % 2 ? "crimson" : "seagreen" }}>Clicked {count} times</output>
      <div css={{ height: 8, borderRadius: 4, background: "#d0d7de" }}>
        <div data-dynamic css={{ height: "100%", borderRadius: 4, background: "#1a7f37", width: `${progress}%` }} />
      </div>
      <Button css={{ justifySelf: "start" }} onClick={() => setCount(count + 1)}>
        Increment
      </Button>
    </main>
  );
}
