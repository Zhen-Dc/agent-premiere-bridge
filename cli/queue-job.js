import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const config = JSON.parse(readFileSync(path.join(root, "bridge.config.json"), "utf8"));
const jobFile = process.argv[2];

if (!jobFile) {
  console.error("Usage: npm run queue -- examples/import-media.job.json");
  process.exit(1);
}

const job = JSON.parse(readFileSync(path.resolve(jobFile), "utf8"));
const response = await fetch(`http://127.0.0.1:${config.port}/api/jobs`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(config.requireToken === false ? {} : { "X-Agent-Bridge-Token": config.token })
  },
  body: JSON.stringify(job)
});

const body = await response.json();
if (!response.ok) {
  console.error(body.error || body);
  process.exit(1);
}

console.log(`Queued ${body.job.id}`);
