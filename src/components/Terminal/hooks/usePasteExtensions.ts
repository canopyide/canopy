import { useMemo } from "react";
import {
  createImagePasteHandler,
  addImageChip,
  createFilePasteHandler,
  addFileDropChip,
  createPlainPasteKeymap,
} from "../inputEditorExtensions";
import { formatAtFileToken } from "../hybridInputParsing";

export function usePasteExtensions() {
  const imagePasteExtension = useMemo(
    () =>
      createImagePasteHandler(async (view) => {
        try {
          const { filePath, thumbnailDataUrl } = await window.electron.clipboard.saveImage();
          const cursor = view.state.selection.main.head;
          view.dispatch({
            changes: { from: cursor, insert: filePath + " " },
            effects: addImageChip.of({
              from: cursor,
              to: cursor + filePath.length,
              filePath,
              thumbnailUrl: thumbnailDataUrl,
            }),
            selection: { anchor: cursor + filePath.length + 1 },
          });
        } catch {
          // Empty clipboard, editor destroyed mid-IPC, etc. — nothing to do.
        }
      }),
    []
  );

  const filePasteExtension = useMemo(
    () =>
      createFilePasteHandler((view, files) => {
        const cursor = view.state.selection.main.head;
        const effects: ReturnType<typeof addFileDropChip.of>[] = [];
        let insertText = "";
        for (const file of files) {
          const token = formatAtFileToken(file.path);
          const from = cursor + insertText.length;
          insertText += token + " ";
          effects.push(
            addFileDropChip.of({
              from,
              to: from + token.length,
              filePath: file.path,
              fileName: file.name,
              fileSize: file.size,
            })
          );
        }
        view.dispatch({
          changes: { from: cursor, insert: insertText },
          effects,
          selection: { anchor: cursor + insertText.length },
        });
      }),
    []
  );

  const plainPasteKeymap = useMemo(() => createPlainPasteKeymap(), []);

  return { imagePasteExtension, filePasteExtension, plainPasteKeymap };
}
