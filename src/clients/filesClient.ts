import type { FileSearchPayload, FileSearchResult } from "@shared/types";

export const filesClient = {
  search: (payload: FileSearchPayload): Promise<FileSearchResult> => {
    return window.electron.files.search(payload);
  },
};
