// drizzle-kit config (T-01-07; 18 §4): generated migrations land in ./drizzle
// and are APPEND-ONLY — never edit a migration after it has been applied.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
