export interface FileSearchPayload {
  cwd: string;
  query: string;
  limit?: number;
}

export interface FileSearchResult {
  files: string[];
}

