import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const config = JSON.parse(readFileSync(path.join(root, "bridge.config.json"), "utf8"));
const planFile = process.argv[2];

if (!planFile) {
  console.error("Usage: npm run queue:edit-plan -- path/to/edit-plan.json");
  process.exit(1);
}

const absolutePlanFile = path.resolve(planFile);
const planDir = path.dirname(absolutePlanFile);
const plan = JSON.parse(readFileSync(absolutePlanFile, "utf8"));
const projectRoot = path.resolve(plan.projectRoot || planDir);

function resolveMediaPath(value) {
  if (!value) return value;
  if (/^[a-zA-Z]:[\\/]/.test(value)) return value.replaceAll("\\", "/");
  return path.resolve(projectRoot, value).replaceAll("\\", "/");
}

function sequenceName() {
  return plan.sequence?.name || plan.name || path.basename(projectRoot);
}

function durationOf(item) {
  if (item.durationSeconds !== undefined) return Number(item.durationSeconds);
  if (item.duration !== undefined) return Number(item.duration);
  if (item.out !== undefined && item.in !== undefined) return Number((Number(item.out) - Number(item.in)).toFixed(3));
  if (item.outSeconds !== undefined && item.inSeconds !== undefined) {
    return Number((Number(item.outSeconds) - Number(item.inSeconds)).toFixed(3));
  }
  return 0;
}

function trackIndexOf(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string") {
    const match = value.match(/\d+/);
    if (match) {
      return Math.max(0, Number(match[0]) - 1);
    }
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeClip(item) {
  const inSeconds = Number(item.inSeconds ?? item.in ?? 0);
  const durationSeconds = durationOf(item);
  const outSeconds = Number(item.outSeconds ?? item.out ?? (inSeconds + durationSeconds));
  return {
    file: resolveMediaPath(item.file || item.path),
    inSeconds,
    outSeconds,
    durationSeconds,
    scale: item.scale
  };
}

function normalizeOverlay(item) {
  const inSeconds = Number(item.inSeconds ?? item.in ?? 0);
  const durationSeconds = durationOf(item);
  return {
    file: resolveMediaPath(item.file || item.path),
    inSeconds,
    outSeconds: Number(item.outSeconds ?? item.out ?? (inSeconds + durationSeconds)),
    durationSeconds,
    startSeconds: Number(item.startSeconds ?? item.start ?? 0),
    trackIndex: trackIndexOf(item.trackIndex ?? item.track, 1),
    binName: item.binName || "B-Roll",
    scale: item.scale,
    silent: item.audio === false || item.silent !== false
  };
}

function normalizeAudio(item) {
  return {
    file: resolveMediaPath(item.file || item.path),
    startSeconds: Number(item.startSeconds ?? item.start ?? 0),
    trackIndex: trackIndexOf(item.trackIndex ?? item.track, 1),
    binName: item.binName || "Audio"
  };
}

function normalizeMarker(item) {
  return {
    timeSeconds: Number(item.timeSeconds ?? item.time ?? 0),
    name: item.name || "Edit note",
    comment: item.comment || item.note || "",
    durationSeconds: item.durationSeconds ?? item.duration
  };
}

function normalizeCaption(item) {
  return {
    startSeconds: Number(item.startSeconds ?? item.start ?? 0),
    endSeconds: Number(item.endSeconds ?? item.end ?? 0),
    text: item.text || ""
  };
}

const baseClips = (plan.baseClips || plan.clips || [])
  .filter((item) => (item.type || "a-roll") === "a-roll" || item.track === "V1")
  .map(normalizeClip);

const overlays = (plan.overlays || plan.broll || plan.clips || [])
  .filter((item) => item.type === "b-roll" || item.type === "overlay" || item.track === "V2" || item.track === "V3")
  .map(normalizeOverlay);

const audio = (plan.audio || plan.sfx || [])
  .map(normalizeAudio);

const markers = (plan.markers || [])
  .map(normalizeMarker);

const captions = (plan.captions || [])
  .map(normalizeCaption);

if (!baseClips.length) {
  console.error("Edit plan needs at least one A-roll/base clip.");
  process.exit(1);
}

for (const mediaFile of [...baseClips, ...overlays, ...audio].map((item) => item.file)) {
  if (!existsSync(mediaFile)) {
    console.error(`Missing media file: ${mediaFile}`);
    process.exit(1);
  }
}

const steps = [
  {
    action: "assemble_sequence",
    name: sequenceName(),
    binName: plan.binName || "Edit Assets",
    baseClips,
    overlays,
    audio,
    markers
  }
];

if (captions.length && plan.captionsOutputPath) {
  steps.push({
    action: "create_srt_file",
    outputPath: resolveMediaPath(plan.captionsOutputPath),
    binName: "Captions",
    captions,
    importIntoProject: plan.importCaptions !== false
  });
}

if (plan.saveProject !== false) {
  steps.push({ action: "save_project" });
}

const job = {
  plan: plan.plan || `Build editable Premiere timeline: ${sequenceName()}.`,
  command: {
    action: "compound",
    steps
  }
};

const response = await fetch(`http://127.0.0.1:${config.port}/api/jobs`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(config.requireToken === false ? {} : { "X-Bridge-Token": config.token })
  },
  body: JSON.stringify(job)
});

const body = await response.json();
if (!response.ok) {
  console.error(body.error || body);
  process.exit(1);
}

console.log(body.job.id);
