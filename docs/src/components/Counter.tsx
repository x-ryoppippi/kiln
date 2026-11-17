import { styled } from "@nishikijs/react";
import { useState } from "react";

const Button = styled("button", {
  padding: "8px 16px",
  border: "none",
  borderRadius: 6,
  background: "#1f6feb",
  color: "white",
  font: "inherit",
  cursor: "pointer",
  ":hover": { background: "#1158c7" },
  "@media (max-width: 600px)": { width: "100%" },
});

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div css={{ display: "grid", gap: 12 }}>
      <p css={{ margin: 0, color: count % 2 ? "crimson" : "seagreen" }}>
        Clicked {count} {count === 1 ? "time" : "times"}
      </p>
      <Button css={{ justifySelf: "start" }} onClick={() => setCount((c) => c + 1)}>
        Increment
      </Button>
    </div>
  );
}
