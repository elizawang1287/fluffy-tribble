import test from "node:test";
import assert from "node:assert/strict";
import {
  formatRecordingDuration,
  preferredRecordingMimeType,
  recordingErrorMessage,
  recordingKey,
  recordingMaxDurationMs,
} from "../recording-core.mjs";

test("creates stable recording keys without accepting arbitrary dates", () => {
  assert.equal(recordingKey("2026-08-05", 3), "2026-08-05:3");
  assert.equal(recordingKey("bad-date", -1), "unknown:0");
});

test("formats recording time for a short learner recording", () => {
  assert.equal(recordingMaxDurationMs, 20_000);
  assert.equal(formatRecordingDuration(0), "0:00");
  assert.equal(formatRecordingDuration(1_001), "0:02");
  assert.equal(formatRecordingDuration(20_000), "0:20");
});

test("selects a mobile-friendly supported recording format", () => {
  const supportsMp4 = (type) => type === "audio/mp4";
  assert.equal(preferredRecordingMimeType(supportsMp4), "audio/mp4");
  assert.equal(preferredRecordingMimeType(() => false), "");
});

test("returns useful microphone permission messages", () => {
  assert.match(recordingErrorMessage("NotAllowedError"), /麦克风权限/);
  assert.match(recordingErrorMessage("NotFoundError"), /麦克风/);
  assert.match(recordingErrorMessage("UnknownError"), /录音没有成功/);
});
