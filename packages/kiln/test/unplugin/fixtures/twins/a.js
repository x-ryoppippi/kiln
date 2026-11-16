import { shared } from "./shared.js";

window.a = [shared, () => import("./page-a.js")];
