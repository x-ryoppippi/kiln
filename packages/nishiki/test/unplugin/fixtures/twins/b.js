import { shared } from "./shared.js";

window.b = [shared, () => import("./page-b.js")];
