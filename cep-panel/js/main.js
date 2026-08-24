(function () {
  var csInterface = new CSInterface();
  var pollTimer = null;
  var runningJobId = null;

  var elements = {
    state: document.getElementById("state"),
    serverUrl: document.getElementById("serverUrl"),
    currentJob: document.getElementById("currentJob"),
    log: document.getElementById("log")
  };

  elements.serverUrl.value = localStorage.getItem("bridge.serverUrl") || elements.serverUrl.value || "http://127.0.0.1:41326";
  elements.serverUrl.addEventListener("change", function () {
    localStorage.setItem("bridge.serverUrl", cleanServerUrl());
  });

  setState("Connecting");
  startPolling();

  function cleanServerUrl() {
    return elements.serverUrl.value.replace(/\/+$/, "");
  }

  function headers() {
    return { "Content-Type": "application/json" };
  }

  function setState(value) {
    elements.state.textContent = value;
  }

  function log(message) {
    var line = "[" + new Date().toLocaleTimeString() + "] " + message;
    elements.log.textContent = line + "\n" + elements.log.textContent;
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    fetchPending();
    pollTimer = setInterval(fetchPending, 2000);
  }

  function fetchPending() {
    if (runningJobId) return;
    fetch(cleanServerUrl() + "/api/jobs/pending", { headers: headers() })
      .then(function (response) { return response.json(); })
      .then(function (body) {
        if (body.error) throw new Error(body.error);
        setState("Connected");
        var job = body.jobs && body.jobs[0];
        if (!job) {
          elements.currentJob.textContent = "Waiting for Codex commands.";
          return;
        }
        runJob(job);
      })
      .catch(function (error) {
        setState("Offline");
        elements.currentJob.textContent = "Bridge server is not reachable.";
        log("Connection failed: " + error.message);
      });
  }

  function updateStatus(jobId, status, result) {
    return fetch(cleanServerUrl() + "/api/jobs/" + encodeURIComponent(jobId) + "/status", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ status: status, result: result || null })
    }).then(function (response) { return response.json(); });
  }

  function runJob(job) {
    runningJobId = job.id;
    setState("Running");
    elements.currentJob.textContent = job.command.action + " (" + job.id + ")";
    log("Running " + job.id + ": " + job.command.action);

    updateStatus(job.id, "running", { message: "Auto-started because the Codex Premiere Bridge panel is open." })
      .then(function () {
        var script = "CodexBridge.runJob(" + JSON.stringify(job.command) + ")";
        csInterface.evalScript(script, function (rawResult) {
          var result;
          try {
            result = JSON.parse(rawResult);
          } catch (error) {
            result = { ok: false, error: "Could not parse ExtendScript result: " + rawResult };
          }
          updateStatus(job.id, result.ok ? "completed" : "failed", result)
            .then(function () {
              setState(result.ok ? "Connected" : "Error");
              log((result.ok ? "Completed " : "Failed ") + job.id + ": " + JSON.stringify(result));
              runningJobId = null;
              fetchPending();
            });
        });
      })
      .catch(function (error) {
        setState("Error");
        log("Could not update job status: " + error.message);
        runningJobId = null;
      });
  }
})();
