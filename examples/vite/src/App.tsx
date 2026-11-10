import { useState } from "react";
import { styled } from "kiln";

const Button = styled("button", {
  padding: "8px 16px",
  border: "none",
  borderRadius: 6,
  background: "#1f6feb",
  color: "white",
  ":hover": { background: "#388bfd" },
});

export function App() {
  const [count, setCount] = useState(0);

  return (
    <main css={{ display: "grid", gap: 12, padding: 24, fontFamily: "system-ui" }}>
      <h1 css={{ margin: 0, fontSize: 24 }}>kiln</h1>
      <p css={{ margin: 0, color: count % 2 ? "crimson" : "seagreen", fontWeight: 600 }}>Clicked {count} times</p>
      <Button css={{ justifySelf: "start" }} onClick={() => setCount(count + 1)}>
        Increment
      </Button>
    </main>
  );
}
