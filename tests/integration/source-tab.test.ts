import { afterEach, expect, it, vi } from "vitest";
import { withSourceTab } from "../../src/browser/source-tab.ts";
afterEach(() => vi.unstubAllGlobals());
function setup() {
  let message: (m: unknown) => void = () => undefined;
  let disconnect: () => void = () => undefined;
  const port = {
    onMessage: {
      addListener: (fn: typeof message) => {
        message = fn;
      },
    },
    onDisconnect: {
      addListener: (fn: typeof disconnect) => {
        disconnect = fn;
      },
    },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
  };
  vi.stubGlobal("chrome", { runtime: { connect: () => port } });
  return {
    port,
    message: (m: unknown) => message(m),
    disconnect: () => disconnect(),
  };
}
it("releases the temporary page after success or failure", async () => {
  const s = setup();
  const result = withSourceTab(
    "abcdefghijk",
    new AbortController().signal,
    async (id) => id,
  );
  s.message({ tabId: 7 });
  expect(await result).toBe(7);
  expect(s.port.disconnect).toHaveBeenCalledOnce();
  const failure = withSourceTab(
    "abcdefghijk",
    new AbortController().signal,
    async () => {
      throw new Error("failed");
    },
  );
  s.message({ tabId: 8 });
  await expect(failure).rejects.toThrow("failed");
  expect(s.port.disconnect).toHaveBeenCalledTimes(2);
});
it("cancels page acquisition and in-flight extraction without waiting for scripting", async () => {
  const s = setup(),
    controller = new AbortController();
  const task = withSourceTab(
    "abcdefghijk",
    controller.signal,
    () => new Promise(() => undefined),
  );
  s.message({ tabId: 7 });
  await Promise.resolve();
  controller.abort();
  await expect(task).rejects.toMatchObject({ code: "CANCELLED" });
  expect(s.port.disconnect).toHaveBeenCalled();
});
it("reports a closed worker port and permission rejection", async () => {
  const s = setup();
  const task = withSourceTab(
    "abcdefghijk",
    new AbortController().signal,
    async () => undefined,
  );
  s.disconnect();
  await expect(task).rejects.toMatchObject({ code: "PERMISSION_REQUIRED" });
  const denied = withSourceTab(
    "abcdefghijk",
    new AbortController().signal,
    async () => undefined,
  );
  s.message({ error: "PERMISSION_REQUIRED" });
  await expect(denied).rejects.toMatchObject({ code: "PERMISSION_REQUIRED" });
});
