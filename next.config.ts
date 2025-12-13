import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ["img.clerk.com", "res.cloudinary.com"], // Add this line
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb", // ✅ Tăng lên 100MB
    },
  },
};

export default nextConfig;