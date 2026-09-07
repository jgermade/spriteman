import { defineConfig } from 'vite';
import { jq79 } from 'jq79/vite';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  plugins: [jq79({ exclude: /index\.html$/ })],
  server: {
    port: 3000,
    open: false,
    fs: {
      // The message catalogues live in /messages, outside the `src` root.
      allow: ['..'],
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
