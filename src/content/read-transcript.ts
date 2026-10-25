/** Runs as packaged code in the YouTube top frame. Never fetches or evaluates code. */
export async function readNativeTranscript(input: {
  videoId: string;
  label: string;
  automatic: boolean;
  uniqueLabel: boolean;
}) {
  const deadline = Date.now() + 25_000;
  const validVideo = () => {
    const url = new URL(location.href);
    return (
      url.searchParams.get("v") === input.videoId ||
      url.pathname === `/shorts/${input.videoId}` ||
      url.pathname === `/live/${input.videoId}`
    );
  };
  const visible = (node: Element) =>
    node.getClientRects().length > 0 &&
    getComputedStyle(node).visibility !== "hidden";
  const find = (selector: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(selector)).find(visible);
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 150));
  const normalize = (s: string) =>
    s.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const matchesLanguage = (s: string) => {
    const label = normalize(s),
      requested = normalize(input.label);
    if (input.uniqueLabel && label === requested) return true;
    if (!input.automatic) return label === requested;
    return (
      label === `${requested} (auto-generated)` ||
      label === `${requested} (automatically generated)`
    );
  };
  if (!validVideo()) return { error: "UNSUPPORTED_PAGE" };
  // Consent/challenge UI belongs to the user; never click it in production.
  if (
    Array.from(document.querySelectorAll('[role="dialog"]')).some(
      (n) =>
        visible(n) && /consent|before you continue/i.test(n.textContent ?? ""),
    )
  )
    return { error: "CONSENT_REQUIRED" };
  const originalX = scrollX,
    originalY = scrollY;
  try {
    let container = find("ytd-transcript-renderer");
    if (!container) {
      const expand = find("ytd-watch-metadata #expand");
      expand?.click();
      await pause();
      const open = find(
        "ytd-video-description-transcript-section-renderer button",
      );
      if (!open) return { error: "NATIVE_TRANSCRIPT_UNAVAILABLE" };
      open.click();
    }
    let languageSelected = false,
      sawTimedRows = false;
    let switchedTab = false;
    let languageMenuOpened = false;
    let signature = "",
      stableSince = Date.now();
    while (Date.now() < deadline) {
      if (!validVideo()) return { error: "UNSUPPORTED_PAGE" };
      const panel = find(
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
      );
      if (panel && !switchedTab) {
        const tab = Array.from(
          panel.querySelectorAll<HTMLElement>('[role="tab"]'),
        ).find(
          (n) =>
            visible(n) &&
            /^(transcript|transcripci[oó]n|transcription|transkript)$/i.test(
              n.textContent?.trim() ?? "",
            ),
        );
        if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
        switchedTab = true;
      }
      container = find("ytd-transcript-renderer");
      if (!container) {
        await pause();
        continue;
      }
      const footer = container.querySelector("ytd-transcript-footer-renderer");
      const languageButton = footer
        ? Array.from(
            footer.querySelectorAll<HTMLElement>("button, tp-yt-paper-button"),
          ).find(visible)
        : undefined;
      const languageLabel = languageButton?.textContent?.trim() ?? "";
      if (!languageSelected) {
        if (languageLabel && matchesLanguage(languageLabel))
          languageSelected = true;
        else if (languageButton && !languageMenuOpened) {
          languageButton.click();
          languageMenuOpened = true;
        } else if (languageMenuOpened) {
          const option = Array.from(
            document.querySelectorAll<HTMLElement>(
              "ytd-menu-service-item-renderer",
            ),
          ).find((n) => visible(n) && matchesLanguage(n.textContent ?? ""));
          if (option) {
            option.click();
            languageMenuOpened = false;
            await pause();
            continue;
          }
        }
        if (!languageSelected) {
          await pause();
          continue;
        }
      }
      const elements = Array.from(
        container.querySelectorAll<HTMLElement>(
          "ytd-transcript-segment-renderer",
        ),
      );
      if (elements.length > 100_000) return { error: "LIMIT" };
      let events: {
        tStartMs: number;
        dDurationMs?: number;
        segs: { utf8: string }[];
      }[] = [];
      for (const element of elements) {
        const data =
          (element as HTMLElement & { data?: Record<string, unknown> }).data ??
          {};
        const stamp =
          element.querySelector(".segment-timestamp")?.textContent?.trim() ??
          "";
        const parts = stamp.split(":").map(Number);
        const fallback = /^\d+:\d{2}(?::\d{2})?$/.test(stamp)
          ? parts.reduce((sum, n) => sum * 60 + n, 0) * 1000
          : NaN;
        const start =
            data.startMs === undefined ? fallback : Number(data.startMs),
          end = Number(data.endMs);
        const text = element
          .querySelector(".segment-text")
          ?.textContent?.trim();
        if (!Number.isFinite(start) || start < 0 || !text) continue;
        events.push({
          tStartMs: start,
          ...(Number.isFinite(end) && end > start
            ? { dDurationMs: end - start }
            : {}),
          segs: [{ utf8: text }],
        });
      }
      const list = container.querySelector(
        "ytd-transcript-segment-list-renderer",
      ) as (HTMLElement & { data?: { initialSegments?: unknown[] } }) | null;
      const full = list?.data?.initialSegments;
      if (Array.isArray(full) && full.length > 100000)
        return { error: "LIMIT" };
      if (
        Array.isArray(full) &&
        full.some(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            ("continuationItemRenderer" in entry ||
              "continuationEndpoint" in entry),
        )
      )
        return { error: "NATIVE_TRANSCRIPT_UNAVAILABLE" };
      const continuation = (
        list?.data as { continuations?: unknown[] } | undefined
      )?.continuations;
      if (Array.isArray(continuation) && continuation.length)
        return { error: "NATIVE_TRANSCRIPT_UNAVAILABLE" };
      if (Array.isArray(full)) {
        const complete: typeof events = [];
        for (const entry of full) {
          if (
            !entry ||
            typeof entry !== "object" ||
            !("transcriptSegmentRenderer" in entry)
          )
            continue;
          const cue = entry.transcriptSegmentRenderer as {
            startMs?: unknown;
            endMs?: unknown;
            snippet?: { simpleText?: unknown; runs?: { text?: unknown }[] };
          };
          const start = Number(cue.startMs),
            end = Number(cue.endMs);
          const text =
            typeof cue.snippet?.simpleText === "string"
              ? cue.snippet.simpleText
              : Array.isArray(cue.snippet?.runs)
                ? cue.snippet.runs
                    .map((r) => (typeof r.text === "string" ? r.text : ""))
                    .join("")
                : "";
          if (!Number.isFinite(start) || start < 0 || !text.trim())
            return { error: "NATIVE_TRANSCRIPT_UNAVAILABLE" };
          complete.push({
            tStartMs: start,
            ...(Number.isFinite(end) && end > start
              ? { dDurationMs: end - start }
              : {}),
            segs: [{ utf8: text }],
          });
        }
        events = complete;
      }
      if (events.length) sawTimedRows = true;
      // Do not scrape a visibly loading/partially mounted list as complete.
      const loading = Array.from(
        container.querySelectorAll(
          'tp-yt-paper-spinner[active], [role="progressbar"]',
        ),
      ).some(visible);
      const nextSignature = `${events.length}:${events.at(-1)?.tStartMs ?? ""}`;
      if (signature !== nextSignature) {
        signature = nextSignature;
        stableSince = Date.now();
      }
      if (
        Array.isArray(full) &&
        events.length &&
        !loading &&
        Date.now() - stableSince >= 1200
      ) {
        const payload = JSON.stringify({ events });
        if (payload.length > 3 * 1024 * 1024) return { error: "LIMIT" };
        return { payload };
      }
      await pause();
    }
    return {
      error:
        sawTimedRows && !languageSelected
          ? "NATIVE_LANGUAGE_UNVERIFIED"
          : "NATIVE_TRANSCRIPT_UNAVAILABLE",
    };
  } finally {
    window.scrollTo(originalX, originalY);
  }
}
