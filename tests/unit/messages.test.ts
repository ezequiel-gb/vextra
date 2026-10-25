import { afterEach, expect, it, vi } from "vitest";
import { pageRequest } from "../../src/background/messages.ts";
const id = "a".repeat(32);
const base = `chrome-extension://${id}/`;
const request = {
  protocolVersion: 1,
  requestId: "request",
  type: "READ_PLAYER",
  tabId: 1,
  videoId: "abcdefghijk",
};
const sender = {
  id,
  url: base + "panel.html",
  origin: base.slice(0, -1),
  frameId: 0,
};
vi.stubGlobal("chrome", {
  runtime: { id, getURL: (path: string) => base + path },
});
afterEach(() => vi.restoreAllMocks());
it("accepts packaged UI requests, including tab and settings pages", () => {
  expect(pageRequest(request, sender)).toEqual(request);
  expect(
    pageRequest(request, {
      ...sender,
      url: base + "settings.html?view=templates#export",
    }),
  ).toEqual(request);
});
it.each([
  { ...sender, id: "other-extension" },
  { ...sender, url: "https://www.youtube.com/watch?v=abcdefghijk" },
  { ...sender, url: base + "assets/unrelated.html" },
  { ...sender, origin: "https://www.youtube.com" },
  { ...sender, frameId: 1 },
  { ...sender, url: base + "panel.html.evil" },
])("rejects non-UI senders: %j", (untrusted) => {
  expect(pageRequest(request, untrusted)).toBeUndefined();
});
it.each([
  null,
  [],
  { ...request, protocolVersion: 2 },
  { ...request, requestId: "" },
  { ...request, tabId: -1 },
  { ...request, tabId: 1.5 },
  { ...request, tabId: Number.MAX_SAFE_INTEGER + 1 },
  { ...request, videoId: "invalid" },
  { ...request, type: "FETCH_URL" },
  { ...request, type: "READ_NATIVE_TRANSCRIPT", label: "English" },
])("rejects malformed privileged payloads: %j", (payload) => {
  expect(pageRequest(payload, sender)).toBeUndefined();
});
it("requires explicit language properties for the native adapter", () => {
  const native = {
    ...request,
    type: "READ_NATIVE_TRANSCRIPT",
    label: "English",
    automatic: false,
    uniqueLabel: true,
  };
  expect(pageRequest(native, sender)).toEqual(native);
  expect(pageRequest({ ...native, label: " " }, sender)).toBeUndefined();
});
