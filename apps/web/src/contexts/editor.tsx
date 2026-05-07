import { createContext, useContext, useReducer, type Dispatch } from "react";
import type { AgentIR } from "@kuralle/core";

export interface EditorState {
  ir: AgentIR;
  /** The IR as loaded from the server — used for change detection and reset. */
  original: AgentIR;
}

export type EditorAction =
  | { type: "patch"; patch: Partial<AgentIR> }
  | { type: "set"; ir: AgentIR };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "patch":
      return { ...state, ir: { ...state.ir, ...action.patch } };
    case "set":
      return { ir: action.ir, original: action.ir };
  }
}

export interface EditorContextValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used within an AgentEditorProvider");
  return ctx;
}

export function useEditorReducer() {
  return useReducer(editorReducer, { ir: {} as AgentIR, original: {} as AgentIR });
}

export { EditorContext };
