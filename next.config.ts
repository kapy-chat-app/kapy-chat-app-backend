import type { NextConfig } from "next";

const nextConfig: NextConfig = {
   images: {
    domains: ['img.clerk.com','res.cloudinary.com'], // Add this line
  },
};

export default nextConfig;