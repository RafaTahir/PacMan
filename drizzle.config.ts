import { defineConfig } from "drizzle-kit";

// Schema-first append-only migrations. Credentials are deliberately not required
// to generate or review SQL. Apply migrations to DB before Worker deployment.
export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
