/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@lingprism/ui',
    '@lingprism/shared',
    '@lingprism/graphql',
    '@lingprism/graph-viz',
  ],
};

module.exports = nextConfig;
