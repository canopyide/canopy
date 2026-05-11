import { useEffect, useCallback, useState, useRef } from "react";
import type { GitStatus } from "@shared/types";
import { actionService } from "@/services/ActionService";
import { FileViewerModal } from "@/components/FileViewer/FileViewerModal";
import { useBranchForPath } from "@/hooks/useBranchForPath";

export interface FileDiffModalProps {
  isOpen: boolean;
  filePath: string;
  status: GitStatus;
  worktreePath: string;
  onClose: () => void;
}

export function FileDiffModal({
  isOpen,
  filePath,
  status,
  worktreePath,
  onClose,
}: FileDiffModalProps) {
  const [diff, setDiff] = useState<string | undefined>(undefined);
  const requestRef = useRef(0);
  const branch = useBranchForPath(worktreePath);

  const absoluteFilePath = worktreePath.endsWith("/")
    ? worktreePath + filePath
    : worktreePath + "/" + filePath;

  const fetchDiff = useCallback(async () => {
    const requestId = ++requestRef.current;
    setDiff(undefined);
    try {
      const result = await actionService.dispatch(
        "git.getFileDiff",
        { cwd: worktreePath, filePath, status },
        { source: "user" }
      );
      if (requestRef.current !== requestId) return;
      if (!result.ok) {
        setDiff("ERROR");
        return;
      }
      const diffResult = result.result;
      setDiff(typeof diffResult === "string" ? diffResult || "NO_CHANGES" : "ERROR");
    } catch {
      if (requestRef.current !== requestId) return;
      setDiff("ERROR");
    }
  }, [worktreePath, filePath, status]);

  useEffect(() => {
    if (!isOpen) {
      setDiff(undefined);
      requestRef.current++;
      return;
    }

    fetchDiff();
  }, [isOpen, fetchDiff]);

  return (
    <FileViewerModal
      isOpen={isOpen}
      filePath={absoluteFilePath}
      rootPath={worktreePath}
      branch={branch}
      diff={diff}
      defaultMode="diff"
      onRetryDiff={fetchDiff}
      onClose={onClose}
    />
  );
}
