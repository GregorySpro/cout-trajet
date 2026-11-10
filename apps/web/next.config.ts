import type { NextConfig } from 'next';

// Le navigateur appelle /api/... sur le même domaine ; Next transmet à l'API (pas de CORS à gérer).
const apiUrl = process.env['API_URL'] ?? 'https://cout-trajet.onrender.com';

const config: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default config;
