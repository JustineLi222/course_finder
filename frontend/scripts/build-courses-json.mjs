#!/usr/bin/env node
/**
 * Merge backend/courses/<SUBJECT>.json into a single frontend/public/courses.json.
 *
 * The site is deployed statically (Vercel), so it cannot call localhost:3001.
 * Shipping one catalogue file lets the browser decide "in session now" itself,
 * which also removes the CORS dependency entirely.
 *
 * Runs automatically before `npm run build`.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../../backend/courses");
const OUT = path.resolve(here, "../public/courses.json");

if (!fs.existsSync(SRC)) {
    console.error(`build-courses-json: no course directory at ${SRC}`);
    process.exit(1);
}

const files = fs
    .readdirSync(SRC)
    .filter((f) => f.endsWith(".json"))
    .sort();

const all = [];
let used = 0;
let empty = 0;

for (const f of files) {
    try {
        const rows = JSON.parse(fs.readFileSync(path.join(SRC, f), "utf-8"));
        if (!Array.isArray(rows)) continue;
        used += 1;
        if (rows.length === 0) empty += 1;
        all.push(...rows);
    } catch (err) {
        console.error(`build-courses-json: skipping ${f}: ${err.message}`);
    }
}

if (all.length === 0) {
    console.error("build-courses-json: no classes found - is backend/courses populated?");
    process.exit(1);
}

fs.writeFileSync(OUT, JSON.stringify(all));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(
    `build-courses-json: ${all.length} classes from ${used} subjects ` +
        `(${empty} empty) -> public/courses.json (${kb} KB)`,
);
