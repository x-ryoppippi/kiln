import { css } from "kiln";
import { ui } from "./ui.js";

export const vendor = [css({ color: "red" }), ui];
// Starts loading `extra`'s sheet as `vendor` runs.
window.extra = import("./extra.js");
