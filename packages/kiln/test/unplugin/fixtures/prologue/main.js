#!/usr/bin/env node
"use client";
import { css } from "kiln";

export const shell = css({ display: "flex" });

window.page = () => import("./page.js");
