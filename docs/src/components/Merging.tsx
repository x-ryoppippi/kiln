import { css, type CSSObject } from "@nishikijs/react";
import { useState } from "react";

const base: CSSObject = { padding: 12, margin: 8, borderRadius: 6, color: "#1f2328", background: "#eaeef2" };

export default function Merging() {
  const [active, setActive] = useState(false);
  const [className, Styles] = css(base, active && { color: "white", background: "crimson" }, { margin: null });
  return (
    <div css={{ display: "grid", gap: 12 }}>
      <label css={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        active
      </label>
      <div className={className}>
        <Styles />
        <code>className="{className}"</code>
      </div>
    </div>
  );
}
