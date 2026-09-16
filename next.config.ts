import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/binary packages must stay out of the bundle; ffmpeg's binary
  // needs to be traced into the serverless function that judges video.
  serverExternalPackages: ["sharp", "ffmpeg-static", "exifr"],
  outputFileTracingIncludes: {
    "/api/cron/tick": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
