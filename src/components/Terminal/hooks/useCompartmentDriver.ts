import { useEffect } from "react";
import type { EditorView } from "@codemirror/view";
import { EditorView as EditorViewFacet } from "@codemirror/view";
import type { Compartment } from "@codemirror/state";
import {
  buildInputBarTheme,
  createPlaceholder,
  createSlashChipField,
  createSlashTooltip,
  createFileChipTooltip,
  createImageChipTooltip,
  createFileDropChipTooltip,
  createDiffChipTooltip,
  createTerminalChipTooltip,
  createSelectionChipTooltip,
} from "../inputEditorExtensions";
import type { SlashCommand } from "@shared/types";

function reconfigure(
  view: EditorView | null,
  compartmentRef: React.RefObject<Compartment>,
  extension: ReturnType<Compartment["of"]>
) {
  if (!view) return;
  view.dispatch({ effects: compartmentRef.current.reconfigure(extension) });
}

interface UseCompartmentDriverParams {
  editorViewRef: React.RefObject<EditorView | null>;
  themeCompartmentRef: React.RefObject<Compartment>;
  effectiveTheme: import("@xterm/xterm").ITheme;
  placeholderCompartmentRef: React.RefObject<Compartment>;
  placeholder: string;
  editableCompartmentRef: React.RefObject<Compartment>;
  disabled: boolean;
  chipCompartmentRef: React.RefObject<Compartment>;
  commandMap: Map<string, SlashCommand>;
  tooltipCompartmentRef: React.RefObject<Compartment>;
  fileChipTooltipCompartmentRef: React.RefObject<Compartment>;
  imageChipTooltipCompartmentRef: React.RefObject<Compartment>;
  fileDropChipTooltipCompartmentRef: React.RefObject<Compartment>;
  diffChipTooltipCompartmentRef: React.RefObject<Compartment>;
  terminalChipTooltipCompartmentRef: React.RefObject<Compartment>;
  selectionChipTooltipCompartmentRef: React.RefObject<Compartment>;
  isAutocompleteOpen: boolean;
}

export function useCompartmentDriver({
  editorViewRef,
  themeCompartmentRef,
  effectiveTheme,
  placeholderCompartmentRef,
  placeholder,
  editableCompartmentRef,
  disabled,
  chipCompartmentRef,
  commandMap,
  tooltipCompartmentRef,
  fileChipTooltipCompartmentRef,
  imageChipTooltipCompartmentRef,
  fileDropChipTooltipCompartmentRef,
  diffChipTooltipCompartmentRef,
  terminalChipTooltipCompartmentRef,
  selectionChipTooltipCompartmentRef,
  isAutocompleteOpen,
}: UseCompartmentDriverParams) {
  useEffect(() => {
    reconfigure(editorViewRef.current, themeCompartmentRef, buildInputBarTheme(effectiveTheme));
  }, [effectiveTheme, themeCompartmentRef]);

  useEffect(() => {
    reconfigure(editorViewRef.current, placeholderCompartmentRef, createPlaceholder(placeholder));
  }, [placeholder, placeholderCompartmentRef]);

  useEffect(() => {
    reconfigure(
      editorViewRef.current,
      editableCompartmentRef,
      EditorViewFacet.editable.of(!disabled)
    );
  }, [disabled, editableCompartmentRef]);

  useEffect(() => {
    reconfigure(editorViewRef.current, chipCompartmentRef, createSlashChipField({ commandMap }));
  }, [commandMap, chipCompartmentRef]);

  useEffect(() => {
    const suppress = disabled || isAutocompleteOpen;
    reconfigure(
      editorViewRef.current,
      tooltipCompartmentRef,
      suppress ? [] : createSlashTooltip(commandMap)
    );
  }, [commandMap, disabled, isAutocompleteOpen, tooltipCompartmentRef]);

  useEffect(() => {
    const suppress = disabled || isAutocompleteOpen;
    reconfigure(
      editorViewRef.current,
      fileChipTooltipCompartmentRef,
      suppress ? [] : createFileChipTooltip()
    );
  }, [disabled, isAutocompleteOpen, fileChipTooltipCompartmentRef]);

  useEffect(() => {
    const suppress = disabled || isAutocompleteOpen;
    reconfigure(
      editorViewRef.current,
      imageChipTooltipCompartmentRef,
      suppress ? [] : createImageChipTooltip()
    );
  }, [disabled, isAutocompleteOpen, imageChipTooltipCompartmentRef]);

  useEffect(() => {
    const suppress = disabled || isAutocompleteOpen;
    reconfigure(
      editorViewRef.current,
      fileDropChipTooltipCompartmentRef,
      suppress ? [] : createFileDropChipTooltip()
    );
  }, [disabled, isAutocompleteOpen, fileDropChipTooltipCompartmentRef]);

  useEffect(() => {
    const suppress = disabled || isAutocompleteOpen;
    reconfigure(
      editorViewRef.current,
      diffChipTooltipCompartmentRef,
      suppress ? [] : createDiffChipTooltip()
    );
  }, [disabled, isAutocompleteOpen, diffChipTooltipCompartmentRef]);

  useEffect(() => {
    const suppress = disabled || isAutocompleteOpen;
    reconfigure(
      editorViewRef.current,
      terminalChipTooltipCompartmentRef,
      suppress ? [] : createTerminalChipTooltip()
    );
  }, [disabled, isAutocompleteOpen, terminalChipTooltipCompartmentRef]);

  useEffect(() => {
    const suppress = disabled || isAutocompleteOpen;
    reconfigure(
      editorViewRef.current,
      selectionChipTooltipCompartmentRef,
      suppress ? [] : createSelectionChipTooltip()
    );
  }, [disabled, isAutocompleteOpen, selectionChipTooltipCompartmentRef]);
}
