/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["pdfmake", "pdfkit", "fontkit"],
    outputFileTracingIncludes: {
      "/api/spjt/generate": ["./assets/**/*"],
    },
  },
};

module.exports = nextConfig;
