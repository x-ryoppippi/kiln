// A template literal that reads like the import below, which only the real import may change.
export const label = `import("./page.js")`;

window.page = () => import("./page.js");
