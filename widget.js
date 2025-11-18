const logEl = document.getElementById("log");
const statusEl = document.getElementById("status-indicator");
const frame = document.getElementById("payment-frame");
const API_BASE = "https://api.wxcc-us1.cisco.com";

let wxcc = null;
let initialized = false;
let isInsideDesktop = (window !== window.parent);
let pending = [];

/********************************************************************
 * Utilities
 ********************************************************************/
function log(msg) {
  const ts = new Date().toISOString();
  logEl.textContent += `\n[${ts}] ${msg}`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(label, style = "unknown") {
  statusEl.textContent = label;
  statusEl.className = `badge badge-${style}`;
}

/********************************************************************
 * SDK RECEIVER — Accept ALL known Webex Contact Center SDK formats
 ********************************************************************/
window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  // Legacy: event.data.wxcc
  if (data.wxcc) {
    wxcc = data.wxcc;
    initialized = true;
    isInsideDesktop = true;
    log("WXCC SDK (legacy) received");
    setStatus("Ready", "ok");
    flushPending();
    return;
  }

  // Momentum: { type: "WXCC_API", api: {...} }
  if (data.type === "WXCC_API") {
    wxcc = data.api;
    initialized = true;
    isInsideDesktop = true;
    log("WXCC SDK (momentum) received");
    setStatus("Ready", "ok");
    flushPending();
    return;
  }

  // Fallback future-proof
  if (data.contactCenter) {
    wxcc = data;
    initialized = true;
    isInsideDesktop = true;
    log("WXCC SDK (fallback) received");
    setStatus("Ready", "ok");
    flushPending();
    return;
  }
});

/********************************************************************
 * Queue calls until SDK readiness
 ********************************************************************/
function queueOrRun(fn) {
  if (initialized && wxcc) {
    return fn();
  }
  log("SDK not ready → queuing call");
  pending.push(fn);
}

function flushPending() {
  log(`Flushing ${pending.length} queued calls`);
  pending.forEach(fn => fn());
  pending = [];
}

/********************************************************************
 * Unified Pause / Resume — Works for all WXCC modes
 ********************************************************************/
async function pauseRecording() {
  queueOrRun(async () => {
    try {
      log("Requesting pause...");
      setStatus("Pausing…", "warn");

      if (wxcc.contactCenter?.recording?.pause) {
        await wxcc.contactCenter.recording.pause();
        log("Pause OK");
        setStatus("Paused 🔴", "err");
        return;
      }

      // Full REST fallback
      await restAction("pause");
    } catch (e) {
      log("Pause ERROR: " + e.message);
      setStatus("Error", "err");
    }
  });
}

async function resumeRecording() {
  queueOrRun(async () => {
    try {
      log("Requesting resume...");
      setStatus("Resuming…", "warn");

      if (wxcc.contactCenter?.recording?.resume) {
        await wxcc.contactCenter.recording.resume();
        log("Resume OK");
        setStatus("Recording 🟢", "ok");
        return;
      }

      // Full REST fallback
      await restAction("resume");
    } catch (e) {
      log("Resume ERROR: " + e.message);
      setStatus("Error", "err");
    }
  });
}

/********************************************************************
 * REST Fallback (if wxcc.contactCenter.recording not provided)
 ********************************************************************/
async function restAction(action) {
  const token = await wxcc.contactCenter.getAccessToken();
  const call = await wxcc.contactCenter.getActiveCall();
  const recId = call?.recordingId || call?.recording?.id;

  if (!recId) throw new Error("No recordingId");

  const res = await fetch(`${API_BASE}/v1/recordings/${recId}/actions/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) throw new Error(action + " failed: " + res.status);

  log(`${action} REST OK`);
  if (action === "pause") setStatus("Paused 🔴", "err");
  else setStatus("Recording 🟢", "ok");
}

/********************************************************************
 * Auto pause/resume Bridge from payment-frame.html
 ********************************************************************/
window.addEventListener("message", (evt) => {
  // Only trust our own iframe
  if (evt.source !== frame.contentWindow) return;

  if (evt.data?.action === "pause") pauseRecording();
  if (evt.data?.action === "resume") resumeRecording();
});

/********************************************************************
 * Initialization status logic
 ********************************************************************/
if (!isInsideDesktop) {
  log("Running standalone (GitHub Pages)");
  setStatus("Not in Agent Desktop", "err");
} else {
  log("Inside IFRAME – waiting for WXCC SDK...");
  setStatus("Initializing…", "warn");
}

/********************************************************************
 * Optional UX: Update status on call events
 ********************************************************************/
function attachEventHandlers() {
  if (!wxcc?.contactCenter?.on) return;

  wxcc.contactCenter.on("CALL_CONNECTED", () => {
    log("CALL_CONNECTED");
    setStatus("Recording 🟢", "ok");
  });

  wxcc.contactCenter.on("CALL_DISCONNECTED", () => {
    log("CALL_DISCONNECTED");
    setStatus("Unknown", "unknown");
  });
}

queueOrRun(() => attachEventHandlers());
