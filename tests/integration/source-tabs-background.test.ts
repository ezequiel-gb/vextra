import { afterEach, expect, it, vi } from "vitest";
import { installSourceTabs } from "../../src/background/source-tabs.ts";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function setup(previous: unknown[] = []) {
  vi.useFakeTimers();
  let connect: (port: unknown) => void = () => undefined;
  const root = "chrome-extension://" + "a".repeat(32) + "/";
  const tabs = new Map<number, { id: number; url: string; status: string }>();
  tabs.set(99, {
    id: 99,
    url: "https://www.youtube.com/watch?v=abcdefghijk",
    status: "complete",
  });
  const create = vi.fn(async () => {
    const tab = {
      id: 7,
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      status: "complete",
    };
    tabs.set(7, tab);
    return tab;
  });
  const remove = vi.fn(async (id: number) => {
    tabs.delete(id);
  });
  const set = vi.fn(async () => undefined);
  vi.stubGlobal("chrome", {
    runtime: {
      id: "a".repeat(32),
      getURL: (p: string) => root + p,
      onConnect: {
        addListener: (fn: typeof connect) => {
          connect = fn;
        },
      },
    },
    storage: {
      session: {
        get: async () => ({ vextraSourceTabs: previous }),
        set,
        remove: async () => undefined,
      },
    },
    tabs: {
      create,
      get: async (id: number) => {
        if (!tabs.has(id)) throw new Error();
        return tabs.get(id);
      },
      update: vi.fn(async () => undefined),
      remove,
    },
    scripting: { executeScript: vi.fn(async () => []) },
  });
  installSourceTabs();
  function port(trusted = true) {
    let message: (m: unknown) => void = () => undefined,
      disconnect: () => void = () => undefined;
    const p = {
      name: "vextra-source-v1",
      sender: {
        id: "a".repeat(32),
        url: trusted ? root + "panel.html" : "https://www.youtube.com/",
      },
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
    connect(p);
    return { p, send: (m: unknown) => message(m), close: () => disconnect() };
  }
  return { port, create, remove, tabs };
}
it("creates only an inactive owned tab and removes it on owner closure", async () => {
  const s = setup(),
    owner = s.port();
  owner.send({ videoId: "abcdefghijk" });
  await vi.advanceTimersByTimeAsync(6000);
  await vi.waitFor(() =>
    expect(owner.p.postMessage).toHaveBeenCalledWith({ tabId: 7 }),
  );
  expect(s.create).toHaveBeenCalledWith({
    url: "https://www.youtube.com/watch?v=abcdefghijk&autoplay=0",
    active: false,
  });
  owner.close();
  await vi.waitFor(() => expect(s.remove).toHaveBeenCalledWith(7));
  expect(s.remove).not.toHaveBeenCalledWith(99);
});
it("rejects untrusted senders and malformed source identifiers before creating tabs", async () => {
  const s = setup(),
    untrusted = s.port(false);
  expect(untrusted.p.disconnect).toHaveBeenCalledOnce();
  const invalid = s.port();
  invalid.send({ videoId: "../../watch" });
  expect(invalid.p.disconnect).toHaveBeenCalledOnce();
  await Promise.resolve();
  expect(s.create).not.toHaveBeenCalled();
});
it("retains the owner reservation when a second rejected client disconnects", async () => {
  const s = setup(),
    first = s.port();
  first.send({ videoId: "abcdefghijk" });
  await vi.advanceTimersByTimeAsync(6000);
  await vi.waitFor(() =>
    expect(first.p.postMessage).toHaveBeenCalledWith({ tabId: 7 }),
  );
  const second = s.port();
  second.send({ videoId: "abcdefghijk" });
  await vi.waitFor(() =>
    expect(second.p.postMessage).toHaveBeenCalledWith({ error: "BUSY" }),
  );
  second.close();
  const third = s.port();
  third.send({ videoId: "abcdefghijk" });
  await vi.waitFor(() =>
    expect(third.p.postMessage).toHaveBeenCalledWith({ error: "BUSY" }),
  );
  third.close();
  expect(s.create).toHaveBeenCalledOnce();
  first.close();
  await vi.waitFor(() => expect(s.remove).toHaveBeenCalledWith(7));
});
it("reclaims recorded orphan tabs on service-worker startup", async () => {
  const s = setup([{ tabId: 99, videoId: "abcdefghijk" }]);
  await vi.waitFor(() => expect(s.remove).toHaveBeenCalledWith(99));
});
it("does not close an owned tab after the user navigates it elsewhere", async () => {
  const s = setup(),
    owner = s.port();
  owner.send({ videoId: "abcdefghijk" });
  await vi.advanceTimersByTimeAsync(6000);
  await vi.waitFor(() =>
    expect(owner.p.postMessage).toHaveBeenCalledWith({ tabId: 7 }),
  );
  s.tabs.get(7)!.url = "https://example.com/";
  owner.close();
  await vi.advanceTimersByTimeAsync(10);
  expect(s.remove).not.toHaveBeenCalled();
});
it("closes an owned tab immediately when cancelled during player initialisation", async () => {
  const s = setup(),
    owner = s.port();
  owner.send({ videoId: "abcdefghijk" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(owner.p.postMessage).not.toHaveBeenCalled();
  owner.close();
  await vi.advanceTimersByTimeAsync(50);
  expect(s.remove).toHaveBeenCalledWith(7);
  await vi.advanceTimersByTimeAsync(6000);
  expect(owner.p.postMessage).not.toHaveBeenCalled();
});
