import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/AppDialog";
import { Check, AlertCircle, Loader2, GitBranch } from "lucide-react";
import { projectClient } from "@/clients";
import type { GitInitProgressEvent } from "@shared/types/ipc/gitInit";

interface GitInitDialogProps {
  isOpen: boolean;
  directoryPath: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function GitInitDialog({ isOpen, directoryPath, onSuccess, onCancel }: GitInitDialogProps) {
  const [progressEvents, setProgressEvents] = useState<GitInitProgressEvent[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setProgressEvents([]);
      setIsInitializing(false);
      setError(null);
      setIsComplete(false);
      return;
    }

    const cleanup = projectClient.onInitGitProgress((event) => {
      setProgressEvents((prev) => [...prev, event]);

      if (event.status === "error") {
        setError(event.error || "Unknown error");
        setIsInitializing(false);
      } else if (event.step === "complete" && event.status === "success") {
        setIsComplete(true);
        setIsInitializing(false);
      }
    });

    return cleanup;
  }, [isOpen]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [progressEvents]);

  const startInitialization = async () => {
    setIsInitializing(true);
    setError(null);
    setProgressEvents([]);

    try {
      const result = await projectClient.initGitGuided({
        directoryPath,
        createInitialCommit: true,
        initialCommitMessage: "Initial commit",
        createGitignore: true,
        gitignoreTemplate: "node",
      });

      if (!result.success) {
        setError(result.error || "Initialization failed");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    if (isOpen && !isInitializing && !isComplete && progressEvents.length === 0) {
      startInitialization();
    }
  }, [isOpen]);

  const handleClose = () => {
    if (isComplete) {
      onSuccess();
    } else {
      onCancel();
    }
  };

  const getStepIcon = (event: GitInitProgressEvent) => {
    if (event.status === "start") {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    } else if (event.status === "success") {
      return <Check className="h-4 w-4 text-green-500" />;
    } else if (event.status === "error") {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
    return null;
  };

  return (
    <AppDialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Initialize Git Repository"
      size="md"
      className="font-mono"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <GitBranch className="h-4 w-4" />
          <span className="truncate">{directoryPath}</span>
        </div>

        <div className="rounded-lg bg-muted/50 p-4 min-h-[200px] max-h-[400px] overflow-y-auto font-mono text-sm">
          {progressEvents.length === 0 && isInitializing && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Starting initialization...</span>
            </div>
          )}

          {progressEvents.map((event, index) => (
            <div key={index} className="flex items-start gap-2 mb-2">
              {getStepIcon(event)}
              <div className="flex-1">
                <div
                  className={
                    event.status === "error"
                      ? "text-red-500"
                      : event.status === "success"
                        ? "text-green-600"
                        : "text-foreground"
                  }
                >
                  {event.message}
                </div>
                {event.error && <div className="text-xs text-red-500 mt-1">{event.error}</div>}
              </div>
            </div>
          ))}

          <div ref={logEndRef} />
        </div>

        {error && !progressEvents.some((e) => e.status === "error") && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium">Initialization Failed</div>
              <div className="text-xs mt-1">{error}</div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {isComplete ? (
            <Button onClick={handleClose} className="gap-2">
              <Check className="h-4 w-4" />
              Continue
            </Button>
          ) : error ? (
            <>
              <Button variant="outline" onClick={onCancel}>
                Close
              </Button>
              <Button onClick={startInitialization} disabled={isInitializing}>
                Retry
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onCancel} disabled={isInitializing}>
              Close
            </Button>
          )}
        </div>
      </div>
    </AppDialog>
  );
}
