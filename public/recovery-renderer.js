/* global window, document, URLSearchParams */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var reason = params.get("reason") || "unknown";
  var exitCode = params.get("exitCode") || "—";

  var detailsEl = document.getElementById("crash-details");
  if (detailsEl) {
    detailsEl.textContent = "Reason: " + reason + "  •  Exit code: " + exitCode;
  }

  var api = window.electron;
  var statusEl = document.getElementById("status");

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message || "";
    statusEl.className = "status" + (isError ? " error" : "");
  }

  document.getElementById("btn-reload").addEventListener("click", function () {
    if (api && api.recovery) {
      api.recovery.reloadApp();
    }
  });

  document.getElementById("btn-reset").addEventListener("click", function () {
    if (api && api.recovery) {
      api.recovery.resetAndReload();
    }
  });

  var exportBtn = document.getElementById("btn-export-diagnostics");
  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      if (!api || !api.recovery) return;
      exportBtn.disabled = true;
      setStatus("Collecting diagnostics…", false);
      api.recovery
        .exportDiagnostics()
        .then(function (saved) {
          setStatus(saved ? "Diagnostics saved." : "Save cancelled.", false);
        })
        .catch(function (err) {
          var message = err && err.message ? err.message : String(err);
          setStatus("Failed to export diagnostics: " + message, true);
        })
        .finally(function () {
          exportBtn.disabled = false;
        });
    });
  }

  var openLogsBtn = document.getElementById("btn-open-logs");
  if (openLogsBtn) {
    openLogsBtn.addEventListener("click", function () {
      if (!api || !api.recovery) return;
      openLogsBtn.disabled = true;
      setStatus("Opening logs…", false);
      api.recovery
        .openLogs()
        .then(function () {
          setStatus("Logs opened.", false);
        })
        .catch(function (err) {
          var message = err && err.message ? err.message : String(err);
          setStatus("Failed to open logs: " + message, true);
        })
        .finally(function () {
          openLogsBtn.disabled = false;
        });
    });
  }
})();
