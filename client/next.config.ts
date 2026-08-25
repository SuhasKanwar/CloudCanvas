import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@cloudcanvas/graph-contract"],
  turbopack: {
    root: workspaceRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: 'lh3.googleusercontent.com',
      }
    ]
  }
};

export default nextConfig;
