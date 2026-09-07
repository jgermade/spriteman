import { defineConfig } from 'vite';
import { jq79 } from 'jq79/vite';

export default defineConfig({
  // Relative asset URLs so a build works both at a domain root and under a subpath,
  // which is what GitHub Pages serves (…/<repo>/). Only applied to builds; the dev
  // server always serves from '/'.
  base: './',
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
