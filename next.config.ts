// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Izinkan akses dev resources dari IP/host berikut
  allowedDevOrigins: [
    '10.165.175.96',      // IP yang diblokir
    'localhost',          // opsional: untuk akses lokal
    '127.0.0.1',          // opsional: untuk akses lokal
    // Tambahkan IP/host lain jika diperlukan
  ],
  
  // Konfigurasi lain (jika ada) tetap dipertahankan
  reactStrictMode: true,
};

module.exports = nextConfig;