import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const dataDir = path.join(root, "server", "data");
const logDir = path.join(root, "server", "logs");
const configPath = path.join(root, "bridge.config.json");
const jobsPath = path.join(dataDir, "jobs.json");
const defaultPort = 41326;

mkdirSync(dataDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const config = loadConfig();
ensureJobsFile();

function loadConfig() {
  if (existsSync(configPath)) {
    return JSON.parse(readFileSync(configPath, "utf8"));
  }

  const next = {
    port: defaultPort,
    token: randomBytes(24).toString("hex"),
    approvedFolders: [],
    requireApprovalInPanel: false,
    requireToken: false,
    autoRunOnPanelOpen: true,
    localhostOnly: true,
    createdAt: new Date().toISOString()
  };
  writeJson(configPath, next);
  return next;
}

function ensureJobsFile() {
  if (!existsSync(jobsPath)) {
    writeJson(jobsPath, []);
  }
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendLog(entry) {
  appendFileSync(
    path.join(logDir, "bridge.log"),
    `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`,
    "utf8"
  );
}

function readJobs() {
  return JSON.parse(readFileSync(jobsPath, "utf8"));
}

function writeJobs(jobs) {
  writeJson(jobsPath, jobs);
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Agent-Bridge-Token, X-Bridge-Token",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(payload);
}

function isLocalRequest(req) {
  const address = req.socket.remoteAddress || "";
  return address === "::1" || address === "127.0.0.1" || address === "::ffff:127.0.0.1";
}

function isAuthorized(req) {
  if (config.requireToken === false) {
    return true;
  }
  return req.headers["x-agent-bridge-token"] === config.token || req.headers["x-bridge-token"] === config.token;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function normalizeSlashes(value) {
  return String(value || "").replaceAll("\\", "/").toLowerCase();
}

function isInsideApprovedFolder(filePath) {
  if (!config.approvedFolders.length) {
    return false;
  }
  const candidate = normalizeSlashes(path.resolve(filePath));
  return config.approvedFolders.some((folder) => {
    const approved = normalizeSlashes(path.resolve(folder));
    return candidate === approved || candidate.startsWith(`${approved}/`);
  });
}

function collectFilePaths(command) {
  const paths = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        if (/(path|file|files|mediaFiles|projectPath)$/i.test(key)) {
          visit(nested);
        } else if (typeof nested === "object") {
          visit(nested);
        }
      }
      return;
    }
    if (typeof value === "string" && /^[a-zA-Z]:[\\/]/.test(value)) {
      paths.push(value);
    }
  };
  visit(command);
  return paths;
}

function validateJob(input) {
  if (!input || typeof input !== "object") {
    return "Job must be a JSON object.";
  }
  if (!input.command || typeof input.command !== "object") {
    return "Job requires a command object.";
  }
  const action = input.command.action;
  const allowed = new Set([
    "diagnostic",
    "import_media",
    "create_bin",
    "add_markers",
    "create_project",
    "create_sequence_from_clips",
    "assemble_sequence",
    "back_in_80s_edit",
    "save_project",
    "inspect_sequence",
    "activate_sequence",
    "create_srt_file",
    "compound"
  ]);
  if (!allowed.has(action)) {
    return `Unsupported command action: ${action}`;
  }

  const filePaths = collectFilePaths(input.command).filter((filePath) => {
    const lowered = normalizeSlashes(filePath);
    return !lowered.endsWith(".prproj");
  });
  const blocked = filePaths.filter((filePath) => !isInsideApprovedFolder(filePath));
  if (blocked.length) {
    return `Command includes files outside approved folders: ${blocked.join(", ")}`;
  }
  return null;
}

function publicConfig() {
  return {
    port: config.port,
    approvedFolders: config.approvedFolders,
    requireApprovalInPanel: config.requireApprovalInPanel,
    requireToken: config.requireToken !== false,
    autoRunOnPanelOpen: config.autoRunOnPanelOpen === true,
    localhostOnly: config.localhostOnly
  };
}

async function route(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 200, { ok: true });
    return;
  }

  if (config.localhostOnly && !isLocalRequest(req)) {
    send(res, 403, { error: "Only localhost requests are allowed." });
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${config.port}`);

  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, { ok: true, service: "agent-premiere-bridge", config: publicConfig() });
    return;
  }

  if (!isAuthorized(req)) {
    send(res, 401, { error: "Missing or invalid X-Agent-Bridge-Token." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/jobs/pending") {
    const jobs = readJobs();
    send(res, 200, {
      jobs: jobs.filter((job) => job.status === "pending").slice(0, 10)
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/jobs") {
    send(res, 200, { jobs: readJobs().slice(-100).reverse() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/jobs") {
    const input = await readBody(req);
    const error = validateJob(input);
    if (error) {
      send(res, 400, { error });
      return;
    }
    const jobs = readJobs();
    const job = {
      id: `job_${Date.now()}_${randomBytes(4).toString("hex")}`,
      status: "pending",
      plan: input.plan || `Run ${input.command.action}.`,
      command: input.command,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: null
    };
    jobs.push(job);
    writeJobs(jobs);
    appendLog({ event: "job_created", jobId: job.id, action: job.command.action });
    send(res, 201, { job });
    return;
  }

  const statusMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/status$/);
  if (req.method === "POST" && statusMatch) {
    const input = await readBody(req);
    const jobs = readJobs();
    const job = jobs.find((item) => item.id === statusMatch[1]);
    if (!job) {
      send(res, 404, { error: "Job not found." });
      return;
    }
    job.status = input.status || job.status;
    job.result = input.result || null;
    job.updatedAt = new Date().toISOString();
    writeJobs(jobs);
    appendLog({ event: "job_status", jobId: job.id, status: job.status, result: job.result });
    send(res, 200, { job });
    return;
  }

  send(res, 404, { error: "Route not found." });
}

const server = createServer((req, res) => {
  route(req, res).catch((error) => {
    appendLog({ event: "server_error", message: error.message, stack: error.stack });
    send(res, 500, { error: error.message });
  });
});

server.listen(config.port, "127.0.0.1", () => {
  console.log(`Agent Premiere Bridge listening on http://127.0.0.1:${config.port}`);
  console.log(`Token: ${config.requireToken === false ? "(disabled)" : config.token}`);
  console.log(`Auto-run on panel open: ${config.autoRunOnPanelOpen === true ? "enabled" : "disabled"}`);
  console.log(`Approved folders: ${config.approvedFolders.length ? config.approvedFolders.join(", ") : "(none configured)"}`);
});

