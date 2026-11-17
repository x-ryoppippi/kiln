import { css } from "@nishikijs/react";
import { card } from "./card.js";

export const blog = [card, css({ color: "navy", gap: 4 })];
export const post = () => import(/* webpackChunkName: "post" */ "./post.js");
