export interface PushProgressEvent {
  cwd: string;
  stage: string;
  progress: number | null;
  processed: number | null;
  total: number | null;
  targetBranch?: string;
}
