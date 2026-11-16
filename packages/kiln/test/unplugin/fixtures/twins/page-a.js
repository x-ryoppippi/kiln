import { css } from "kiln";

export const page = [css({ color: "navy" }), () => import("./wide.js")];
