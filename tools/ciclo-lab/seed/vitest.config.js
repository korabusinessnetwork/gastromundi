import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.js", "src/**/*.test.jsx"],
    setupFiles: ["src/test/setup.js"],
  },
});
