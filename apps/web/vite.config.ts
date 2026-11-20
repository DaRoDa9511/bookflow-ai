import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../../supabase/functions/_shared"),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          calendar: [
            "@fullcalendar/react",
            "@fullcalendar/core",
            "@fullcalendar/daygrid",
            "@fullcalendar/timegrid",
            "@fullcalendar/interaction",
          ],
          charts: ["recharts"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
