import { css } from "kiln";

const shell = css({ display: "flex" });

export const App = () => <p className={shell}>Don't wait for import("./page.js") here</p>;

window.page = () => import("./page.js");
