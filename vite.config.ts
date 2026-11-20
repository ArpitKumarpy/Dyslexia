import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdfjs-dist')) {
            return 'pdfjs';
          }

          if (id.includes('@mediapipe/tasks-vision')) {
            return 'mediapipe';
          }

          if (id.includes('@supabase/supabase-js')) {
            return 'supabase';
          }
        },
      },
    },
  },
});
