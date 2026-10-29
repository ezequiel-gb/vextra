import { afterEach, describe, it, expect, vi } from "vitest";
import { youtubeRequest } from "../../src/source/youtube/request.ts";
afterEach(() => vi.unstubAllGlobals());
describe("restricted network boundary", () => {
  it("cancels an oversized declared response body before reading", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-length": String(26 * 1024 * 1024) }),
        body: { cancel },
      }),
    );
    cancel.mockResolvedValue(undefined);
    await expect(
      youtubeRequest(
        new URL("https://www.youtube.com/watch?v=abcdefghijk"),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "RESPONSE_SIZE_LIMIT" });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("limits streamed responses even without a content-length header", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const read = vi.fn().mockResolvedValueOnce({
      done: false,
      value: new Uint8Array(25 * 1024 * 1024 + 1),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: { getReader: () => ({ read, cancel }) },
      }),
    );
    await expect(
      youtubeRequest(
        new URL("https://www.youtube.com/api/timedtext"),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "RESPONSE_SIZE_LIMIT" });
    expect(read).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects unapproved origins before fetching", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      youtubeRequest(
        new URL("https://evil.test/watch"),
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requests without credentials and rejects redirects", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("body", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(
      await youtubeRequest(
        new URL("https://www.youtube.com/watch?v=abcdefghijk"),
        new AbortController().signal,
      ),
    ).toBe("body");
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    );
  });
  it("distinguishes rate limiting and retains retry-after", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("", { status: 429, headers: { "retry-after": "30" } }),
        ),
    );
    await expect(
      youtubeRequest(
        new URL("https://www.youtube.com/watch?v=abcdefghijk"),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 30000 });
  });
  it("does not interpret an empty body as transcript success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 200 })),
    );
    expect(
      await youtubeRequest(
        new URL("https://www.youtube.com/api/timedtext"),
        new AbortController().signal,
      ),
    ).toBe("");
  });
});

it.each([
  [403, "CAPTION_FETCH_FAILED"],
  [404, "VIDEO_UNAVAILABLE"],
  [503, "NETWORK"],
])(
  "reports HTTP %s without interpreting its body as captions",
  async (status, code) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("failure", { status })),
    );
    await expect(
      youtubeRequest(
        new URL("https://www.youtube.com/api/timedtext"),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code });
  },
);
it("reports a rejected redirect instead of following it", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("redirect disallowed")),
  );
  await expect(
    youtubeRequest(
      new URL("https://www.youtube.com/api/timedtext"),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "NETWORK" });
  expect(fetch).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({ redirect: "error" }),
  );
});
