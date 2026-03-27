import { describe, it, expect, beforeEach } from "vitest";
import { useCommandHistory } from "../command-history";
import type { Command } from "@/types/commands";

function createMockCommand(
  name: string,
  tracker: { executed: number; undone: number },
): Command {
  return {
    name,
    execute() {
      tracker.executed++;
    },
    undo() {
      tracker.undone++;
    },
  };
}

describe("CommandHistory", () => {
  beforeEach(() => {
    useCommandHistory.getState().clear();
  });

  describe("initial state", () => {
    it("starts with empty stacks", () => {
      const state = useCommandHistory.getState();
      expect(state.undoStack).toHaveLength(0);
      expect(state.redoStack).toHaveLength(0);
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(false);
    });
  });

  describe("execute", () => {
    it("calls execute on the command", () => {
      const tracker = { executed: 0, undone: 0 };
      const cmd = createMockCommand("test", tracker);

      useCommandHistory.getState().execute(cmd);
      expect(tracker.executed).toBe(1);
    });

    it("pushes command onto undo stack", () => {
      const tracker = { executed: 0, undone: 0 };
      const cmd = createMockCommand("test", tracker);

      useCommandHistory.getState().execute(cmd);
      const state = useCommandHistory.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.canUndo).toBe(true);
    });

    it("clears redo stack", () => {
      const tracker1 = { executed: 0, undone: 0 };
      const tracker2 = { executed: 0, undone: 0 };
      const cmd1 = createMockCommand("cmd1", tracker1);
      const cmd2 = createMockCommand("cmd2", tracker2);

      const history = useCommandHistory.getState();
      history.execute(cmd1);
      history.undo();
      expect(useCommandHistory.getState().canRedo).toBe(true);

      useCommandHistory.getState().execute(cmd2);
      expect(useCommandHistory.getState().canRedo).toBe(false);
      expect(useCommandHistory.getState().redoStack).toHaveLength(0);
    });
  });

  describe("commit", () => {
    it("pushes without executing", () => {
      const tracker = { executed: 0, undone: 0 };
      const cmd = createMockCommand("test", tracker);

      useCommandHistory.getState().commit(cmd);
      expect(tracker.executed).toBe(0);
      expect(useCommandHistory.getState().canUndo).toBe(true);
    });
  });

  describe("undo", () => {
    it("calls undo on the most recent command", () => {
      const tracker = { executed: 0, undone: 0 };
      const cmd = createMockCommand("test", tracker);

      useCommandHistory.getState().execute(cmd);
      useCommandHistory.getState().undo();
      expect(tracker.undone).toBe(1);
    });

    it("moves command from undo to redo stack", () => {
      const tracker = { executed: 0, undone: 0 };
      const cmd = createMockCommand("test", tracker);

      useCommandHistory.getState().execute(cmd);
      useCommandHistory.getState().undo();

      const state = useCommandHistory.getState();
      expect(state.undoStack).toHaveLength(0);
      expect(state.redoStack).toHaveLength(1);
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(true);
    });

    it("is a no-op when undo stack is empty", () => {
      useCommandHistory.getState().undo();
      const state = useCommandHistory.getState();
      expect(state.undoStack).toHaveLength(0);
      expect(state.redoStack).toHaveLength(0);
    });

    it("undoes commands in LIFO order", () => {
      const order: string[] = [];
      const cmd1: Command = {
        name: "cmd1",
        execute() {},
        undo() { order.push("cmd1"); },
      };
      const cmd2: Command = {
        name: "cmd2",
        execute() {},
        undo() { order.push("cmd2"); },
      };

      const history = useCommandHistory.getState();
      history.execute(cmd1);
      history.execute(cmd2);
      useCommandHistory.getState().undo();
      useCommandHistory.getState().undo();

      expect(order).toEqual(["cmd2", "cmd1"]);
    });
  });

  describe("redo", () => {
    it("calls execute on the most recently undone command", () => {
      const tracker = { executed: 0, undone: 0 };
      const cmd = createMockCommand("test", tracker);

      useCommandHistory.getState().execute(cmd);
      useCommandHistory.getState().undo();
      useCommandHistory.getState().redo();

      expect(tracker.executed).toBe(2); // initial + redo
    });

    it("moves command from redo to undo stack", () => {
      const tracker = { executed: 0, undone: 0 };
      const cmd = createMockCommand("test", tracker);

      useCommandHistory.getState().execute(cmd);
      useCommandHistory.getState().undo();
      useCommandHistory.getState().redo();

      const state = useCommandHistory.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.redoStack).toHaveLength(0);
      expect(state.canUndo).toBe(true);
      expect(state.canRedo).toBe(false);
    });

    it("is a no-op when redo stack is empty", () => {
      useCommandHistory.getState().redo();
      const state = useCommandHistory.getState();
      expect(state.undoStack).toHaveLength(0);
      expect(state.redoStack).toHaveLength(0);
    });
  });

  describe("undo/redo cycle", () => {
    it("supports multiple undo/redo cycles", () => {
      const tracker = { executed: 0, undone: 0 };
      const cmd = createMockCommand("test", tracker);

      const history = useCommandHistory.getState();
      history.execute(cmd);

      for (let i = 0; i < 5; i++) {
        useCommandHistory.getState().undo();
        expect(useCommandHistory.getState().canRedo).toBe(true);
        useCommandHistory.getState().redo();
        expect(useCommandHistory.getState().canUndo).toBe(true);
      }

      expect(tracker.executed).toBe(6); // 1 initial + 5 redos
      expect(tracker.undone).toBe(5);
    });
  });

  describe("clear", () => {
    it("empties both stacks", () => {
      const tracker = { executed: 0, undone: 0 };
      const cmd = createMockCommand("test", tracker);

      const history = useCommandHistory.getState();
      history.execute(cmd);
      history.execute(createMockCommand("test2", tracker));
      history.undo();

      useCommandHistory.getState().clear();

      const state = useCommandHistory.getState();
      expect(state.undoStack).toHaveLength(0);
      expect(state.redoStack).toHaveLength(0);
      expect(state.canUndo).toBe(false);
      expect(state.canRedo).toBe(false);
    });
  });

  describe("stack limit", () => {
    it("limits undo stack to 100 entries", () => {
      const history = useCommandHistory.getState();
      for (let i = 0; i < 150; i++) {
        history.execute(createMockCommand(`cmd-${i}`, { executed: 0, undone: 0 }));
      }

      const state = useCommandHistory.getState();
      expect(state.undoStack).toHaveLength(100);
      // Most recent command should be the last one added
      expect(state.undoStack[99]!.name).toBe("cmd-149");
    });
  });
});
