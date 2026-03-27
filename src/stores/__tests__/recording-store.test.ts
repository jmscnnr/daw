import { describe, it, expect, beforeEach, vi } from "vitest";
import { useRecordingStore } from "../recording-store";

// Mock performance.now for deterministic tests
let mockNow = 1000;
vi.stubGlobal("performance", { now: () => mockNow });

describe("useRecordingStore", () => {
  beforeEach(() => {
    useRecordingStore.getState().reset();
    mockNow = 1000;
  });

  it("starts in idle state", () => {
    const s = useRecordingStore.getState();
    expect(s.recordTrackId).toBeNull();
    expect(s.recordClipId).toBeNull();
    expect(s.recordStartTimeMs).toBe(0);
  });

  it("getCurrentTick returns 0 when not recording", () => {
    expect(useRecordingStore.getState().getCurrentTick()).toBe(0);
  });

  it("startRecording sets all fields", () => {
    useRecordingStore.getState().startRecording("track-1", "clip-1", 0, 120);
    const s = useRecordingStore.getState();
    expect(s.recordTrackId).toBe("track-1");
    expect(s.recordClipId).toBe("clip-1");
    expect(s.recordStartTick).toBe(0);
    expect(s.recordStartTimeMs).toBe(1000);
    expect(s.recordBpm).toBe(120);
  });

  it("getCurrentTick advances with wall-clock time at 120 BPM", () => {
    useRecordingStore.getState().startRecording("t", "c", 0, 120);
    // At 120 BPM, 1 second = 2 beats = 2 * 960 = 1920 ticks
    mockNow = 2000; // 1 second later
    expect(useRecordingStore.getState().getCurrentTick()).toBe(1920);
  });

  it("getCurrentTick respects recordStartTick offset", () => {
    useRecordingStore.getState().startRecording("t", "c", 960, 120);
    mockNow = 2000; // 1 second later
    // 960 (start) + 1920 (elapsed) = 2880
    expect(useRecordingStore.getState().getCurrentTick()).toBe(2880);
  });

  it("noteOn/noteOff round-trip captures note data", () => {
    useRecordingStore.getState().startRecording("t", "c", 0, 120);

    mockNow = 1500; // 0.5s → tick 960
    const tick1 = useRecordingStore.getState().getCurrentTick();
    useRecordingStore.getState().noteOn(60, 0.8, tick1);

    expect(useRecordingStore.getState().activeNotes.size).toBe(1);

    mockNow = 2000; // 1.0s → tick 1920
    const tick2 = useRecordingStore.getState().getCurrentTick();
    const active = useRecordingStore.getState().noteOff(60);

    expect(active).not.toBeNull();
    expect(active!.note).toBe(60);
    expect(active!.velocity).toBe(0.8);
    expect(active!.startTick).toBe(tick1);
    expect(tick2 - active!.startTick).toBe(960); // duration = 960 ticks
    expect(useRecordingStore.getState().activeNotes.size).toBe(0);
  });

  it("noteOff returns null for note that was never on", () => {
    useRecordingStore.getState().startRecording("t", "c", 0, 120);
    expect(useRecordingStore.getState().noteOff(60)).toBeNull();
  });

  it("finalizeHeld returns all active notes and clears them", () => {
    useRecordingStore.getState().startRecording("t", "c", 0, 120);
    useRecordingStore.getState().noteOn(60, 0.8, 100);
    useRecordingStore.getState().noteOn(64, 0.7, 200);

    const held = useRecordingStore.getState().finalizeHeld();
    expect(held).toHaveLength(2);
    expect(useRecordingStore.getState().activeNotes.size).toBe(0);
  });

  it("reset clears everything", () => {
    useRecordingStore.getState().startRecording("t", "c", 0, 120);
    useRecordingStore.getState().noteOn(60, 0.8, 100);
    useRecordingStore.getState().reset();

    const s = useRecordingStore.getState();
    expect(s.recordTrackId).toBeNull();
    expect(s.recordClipId).toBeNull();
    expect(s.recordStartTimeMs).toBe(0);
    expect(s.activeNotes.size).toBe(0);
    expect(s.getCurrentTick()).toBe(0);
  });
});
