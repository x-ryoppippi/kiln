import { css } from "kiln";
import { tone } from "./tone.js";

// Read lazily: in the chunk cycle, `ui` runs before `vendor`, which holds `tone`.
export const ui = [css({ color: "blue" }), () => tone];
