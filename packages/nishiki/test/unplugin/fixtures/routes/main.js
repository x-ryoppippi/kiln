import { css } from "@nishikijs/react";

export const shell = css({ display: "flex", margin: 0 });

window.routes = {
  about: () => import(/* webpackChunkName: "about" */ "./about.js"),
  blog: () => import(/* webpackChunkName: "blog" */ "./blog.js"),
};
