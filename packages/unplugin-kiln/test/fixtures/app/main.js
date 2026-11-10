import { css } from "kiln";

import { Button } from "./button.js";

const tone = globalThis.tone ?? "green";

export const card = css({ display: "flex", padding: 16, "@media (min-width: 600px)": { padding: 24 } });
export const toned = css({ margin: 0, color: tone });
export { Button };
