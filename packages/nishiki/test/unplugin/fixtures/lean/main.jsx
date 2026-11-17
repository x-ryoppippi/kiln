"use client";
import { css } from "@nishikijs/react";

import { Plain } from "./plain.jsx";

const card = css({ padding: 8 });

export const App = () => (
  <main className={card} css={{ display: "grid" }}>
    <Plain />
  </main>
);
