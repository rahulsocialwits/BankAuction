import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Master-admin image uploads (home hero etc.) go through server actions; the default limit is 1 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
