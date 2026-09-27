import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgo from 'vite-plugin-svgo'
import { imagetools } from 'vite-imagetools'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Process and optimize imported images at build time:
    // - Converts to WebP/AVIF where supported
    // - Generates multiple sizes for srcset
    // - Inlines tiny assets as base64
    imagetools({
      defaultDirectives: (url) => {
        // Generate WebP when the image is used with the ?as=webp query
        // Usage in code: import myImage from './myImage.jpg?as=webp'
        return []
      },
    }),
    svgo({
      // Optimize SVG assets (favicon, inline SVGs)
      multipass: true,
      plugins: [
        'preset-default',
        'removeDimensions',
        'removeXMLNS',
      ],
    }),
  ],
  server: {
    port: 9004,
    host: true,
    proxy: {
      '/api': {
        target: 'https://phamlongfco.online',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'https://phamlongfco.online',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    // Generate optimized asset file names with content hashes
    assetFileNames: 'assets/[name]-[hash][extname]',
    // Inline small assets (< 4KB) as base64 to reduce HTTP requests
    assetsInlineLimit: 4096,
    // Report compressed sizes in the build log
    reportCompressedSize: true,
  },
})
