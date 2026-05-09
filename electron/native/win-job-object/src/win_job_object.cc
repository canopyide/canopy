// Windows Job Object binding for help-session PTY tree reaping (#7526).
//
// One global Job Object is created lazily on first call. Help-session PTY
// PIDs are added to it via AssignProcessToJobObject. JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
// makes the OS reap every assigned process (and its descendants) when the
// Daintree main process exits for any reason — including a hard crash that
// bypasses every cooperative cleanup path.
//
// The HANDLE is intentionally never closed: it dies with the process, which
// is the moment we want the OS to do the reaping. CloseHandle on quit would
// either no-op (process already exiting) or kill the agents prematurely.

#define WIN32_LEAN_AND_MEAN
#include <napi.h>
#include <windows.h>

namespace {

HANDLE g_jobHandle = NULL;

bool EnsureJob() {
  if (g_jobHandle != NULL) return true;

  HANDLE job = CreateJobObjectW(NULL, NULL);
  if (job == NULL) return false;

  JOBOBJECT_EXTENDED_LIMIT_INFORMATION info = {};
  info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

  if (!SetInformationJobObject(
          job,
          JobObjectExtendedLimitInformation,
          &info,
          sizeof(info))) {
    CloseHandle(job);
    return false;
  }

  g_jobHandle = job;
  return true;
}

Napi::Value AssignProcessToHelpJob(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "pid (number) required").ThrowAsJavaScriptException();
    return env.Null();
  }

  double pidDouble = info[0].As<Napi::Number>().DoubleValue();
  if (pidDouble <= 0 || pidDouble > 0xFFFFFFFF) {
    return Napi::Boolean::New(env, false);
  }
  DWORD pid = static_cast<DWORD>(pidDouble);

  if (!EnsureJob()) {
    return Napi::Boolean::New(env, false);
  }

  HANDLE process = OpenProcess(
      PROCESS_SET_QUOTA | PROCESS_TERMINATE,
      FALSE,
      pid);
  if (process == NULL) {
    // Process exited between PID emission and this call, or access denied —
    // either way we can't (and don't need to) attach. Caller treats false as
    // "no-op, move on".
    return Napi::Boolean::New(env, false);
  }

  BOOL ok = AssignProcessToJobObject(g_jobHandle, process);
  CloseHandle(process);

  if (!ok) {
    // Most common non-success: ERROR_ACCESS_DENIED when the parent Daintree
    // process is already inside a non-nesting-compatible job (some CI/MDM
    // environments). Crash-safe reaping degrades gracefully — the help-session
    // taskkill /T paths in PtyClient still fire on cooperative shutdown.
    return Napi::Boolean::New(env, false);
  }

  return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(
      Napi::String::New(env, "assignProcessToHelpJob"),
      Napi::Function::New(env, AssignProcessToHelpJob));
  return exports;
}

}  // namespace

NODE_API_MODULE(win_job_object, Init)
