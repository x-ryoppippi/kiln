import { css } from "kiln";

export const shell = css({ display: "flex", margin: 0 });

window.routes = { about: () => import("./about.js"), blog: () => import("./blog.js") };
