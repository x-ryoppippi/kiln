"use client";

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

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div css={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Button onClick={() => setCount(count + 1)}>Increment</Button>
      <output css={{ fontWeight: 600, color: count % 2 ? "crimson" : "seagreen" }}>Clicked {count} times</output>
    </div>
  );
}
