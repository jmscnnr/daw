import { create } from "zustand";
import type { Command } from "@/types/commands";

const MAX_UNDO_STACK = 100;

interface CommandHistoryState {
  undoStack: Command[];
  redoStack: Command[];
  canUndo: boolean;
  canRedo: boolean;

  execute(command: Command): void;
  undo(): void;
  redo(): void;
  clear(): void;
}

export const useCommandHistory = create<CommandHistoryState>()((set, get) => ({
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  execute(command) {
    command.execute();
    set((s) => {
      const undoStack = [...s.undoStack, command].slice(-MAX_UNDO_STACK);
      return {
        undoStack,
        redoStack: [],
        canUndo: true,
        canRedo: false,
      };
    });
  },

  undo() {
    const { undoStack } = get();
    const command = undoStack[undoStack.length - 1];
    if (!command) return;

    command.undo();
    set((s) => {
      const newUndo = s.undoStack.slice(0, -1);
      return {
        undoStack: newUndo,
        redoStack: [...s.redoStack, command],
        canUndo: newUndo.length > 0,
        canRedo: true,
      };
    });
  },

  redo() {
    const { redoStack } = get();
    const command = redoStack[redoStack.length - 1];
    if (!command) return;

    command.execute();
    set((s) => {
      const newRedo = s.redoStack.slice(0, -1);
      return {
        undoStack: [...s.undoStack, command],
        redoStack: newRedo,
        canUndo: true,
        canRedo: newRedo.length > 0,
      };
    });
  },

  clear() {
    set({ undoStack: [], redoStack: [], canUndo: false, canRedo: false });
  },
}));
