import type { NextConfig } from "next";
import withKiln from "unplugin-kiln/next";

const nextConfig: NextConfig = {};

export default withKiln(nextConfig, { extract: process.env.KILN_EXTRACT === "1" });
