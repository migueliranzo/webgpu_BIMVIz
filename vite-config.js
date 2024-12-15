import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ['web-ifc']  // Prevent Vite from trying to optimize the WASM module
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'web-ifc': ['web-ifc']
        }
      }
    }
  }
});
