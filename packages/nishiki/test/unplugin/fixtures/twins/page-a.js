import { css } from "@nishikijs/react";

export const page = [css({ color: "navy" }), () => import("./wide.js")];
