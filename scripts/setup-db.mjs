// Creates tables and adds the first two clients. Usage: DATABASE_URL=... npm run db:setup
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL first."); process.exit(1); }
const isNeon = /neon\.tech|neon\.build/.test(url);
const pool = isNeon ? null : new pg.Pool({ connectionString: url });
const sql = isNeon ? neon(url) : { query: async (t, p) => (await pool.query(t, p)).rows };

const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
for (const stmt of schema.split(/;\s*$/m).map(s => s.trim()).filter(Boolean)) {
  await sql.query(stmt);
}

const clients = [
  { slug: "placer-county-so", name: "Placer County Sheriff's Office", zoho_org: "Placer County Sheriff's Office",
    channels: ["Meta", "Indeed"], meta_match: ["Placer"], google_match: [], default_position: null },
  { slug: "mshp", name: "Missouri State Highway Patrol", zoho_org: "Missouri State Highway Patrol",
    channels: ["Meta", "Google"], meta_match: ["MSHP", "Missouri"], google_match: ["Missouri State Highway Patrol", "MSHP"],
    default_position: "Trooper" },
];
for (const c of clients) {
  await sql.query(
    `INSERT INTO clients (slug, name, zoho_org, channels, meta_match, google_match, default_position)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (slug) DO NOTHING`,
    [c.slug, c.name, c.zoho_org, c.channels, c.meta_match, c.google_match, c.default_position]);
}
console.log("Database ready.");
await pool?.end();
