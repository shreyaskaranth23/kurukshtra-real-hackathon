
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/health": "http://localhost:3001",
      "/registry": "http://localhost:3001",
      "/api": "http://localhost:3001",
    },
  },
});
