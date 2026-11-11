import { css } from "kiln";

// Module-level bindings named like the browser globals that kiln's stylesheet loader uses.
export const document = css({ display: "flex" });
export function URL() {}
export function Promise() {}

window.page = () => import("./page.js");
