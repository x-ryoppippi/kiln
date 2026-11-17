import type { NextConfig } from "next";
import withNishiki from "@nishikijs/react/unplugin/next";

const nextConfig: NextConfig = {};

export default withNishiki(nextConfig, { extract: process.env.NISHIKI_EXTRACT === "1" });
