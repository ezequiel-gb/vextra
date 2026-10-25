/** Runs as packaged code in the YouTube top frame. Never fetches or evaluates code. */
export async function readNativeTranscript(input: {
  videoId: string;
  label: string;
  automatic: boolean;
  uniqueLabel: boolean;
  singleTrack?: boolean;
}): Promise<{ payload?: string; error?: string; languageVerified?: boolean }> {
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
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const modernPanel = () => {
    const segment = find("transcript-segment-view-model");
    return segment?.closest<HTMLElement>(
      "ytd-engagement-panel-section-list-renderer",
    );
  };
  const readModern = (panel: HTMLElement) => {
    if (
      Array.from(panel.querySelectorAll<HTMLInputElement>("input")).some((n) =>
        n.value.trim(),
      )
    )
      return { error: "NATIVE_FILTER_ACTIVE" };
    const data = record((panel as HTMLElement & { data?: unknown }).data);
    const list = record(record(data.content).sectionListRenderer);
    if (!Array.isArray(list.contents) || !list.contents.length) return;
    if (list.contents.length > 100_000) return { error: "NATIVE_CUE_LIMIT" };
    if (Array.isArray(list.continuations) && list.continuations.length)
      return { error: "NATIVE_TRANSCRIPT_UNAVAILABLE" };
    const events: { tStartMs: number; segs: { utf8: string }[] }[] = [];
    let modelIndex = 0;
    for (const section of list.contents) {
      const wrapper = record(section);
      if (wrapper.continuationItemRenderer || wrapper.continuationEndpoint)
        return { error: "NATIVE_TRANSCRIPT_UNAVAILABLE" };
      const group = record(wrapper.itemSectionRenderer);
      if (
        !Array.isArray(group.contents) ||
        (Array.isArray(group.continuations) && group.continuations.length)
      )
        return { error: "NATIVE_TRANSCRIPT_UNAVAILABLE" };
      if (group.header !== undefined) {
        const header = record(
          record(group.header).macroMarkersPanelItemViewModel,
        );
        const chapter = record(record(header.item).timelineChapterViewModel);
        const endpoint = record(
          record(record(header.onTap).innertubeCommand).watchEndpoint,
        );
        if (
          header.panelId !== "PAmodern_transcript_view" ||
          header.index !== modelIndex ||
          endpoint.videoId !== input.videoId ||
          typeof chapter.title !== "string" ||
          !chapter.title.trim() ||
          typeof endpoint.startTimeSeconds !== "number" ||
          !Number.isSafeInteger(endpoint.startTimeSeconds * 1000) ||
          endpoint.startTimeSeconds < 0
        )
          return { error: "NATIVE_TRANSCRIPT_UNAVAILABLE" };
        modelIndex++;
      }
      if (modelIndex + group.contents.length > 100_000)
        return { error: "NATIVE_CUE_LIMIT" };
      for (const entry of group.contents) {
        const marker = record(record(entry).macroMarkersPanelItemViewModel);
        const timeline = record(record(marker.item).timelineItemViewModel);
        const endpoint = record(
          record(record(marker.onTap).innertubeCommand).watchEndpoint,
        );
        if (
          marker.panelId !== "PAmodern_transcript_view" ||
          marker.index !== modelIndex ||
          endpoint.videoId !== input.videoId ||
          !Array.isArray(timeline.contentItems) ||
          timeline.contentItems.length !== 1
        )
          return { error: "NATIVE_TRANSCRIPT_UNAVAILABLE" };
        const cue = record(
          record(timeline.contentItems[0]).transcriptSegmentViewModel,
        );
        const startMs = Number(endpoint.startTimeSeconds) * 1000;
        if (
          typeof endpoint.startTimeSeconds !== "number" ||
          !Number.isSafeInteger(startMs) ||
          startMs < 0 ||
          (events.length && startMs < events.at(-1)!.tStartMs) ||
          typeof cue.simpleText !== "string" ||
          !cue.simpleText.trim()
        )
          return { error: "NATIVE_TRANSCRIPT_UNAVAILABLE" };
        events.push({ tStartMs: startMs, segs: [{ utf8: cue.simpleText }] });
        modelIndex++;
      }
    }
    if (!events.length) return;
    const label = Array.from(
      panel.querySelectorAll<HTMLElement>("button, [role=combobox]"),
    ).find((n) => visible(n) && matchesLanguage(n.textContent ?? ""));
    // The modern panel may omit language controls even on multilingual videos.
    // Preserve its complete text, but never assign the requested track metadata
    // unless the panel actually confirms it.
    const payload = JSON.stringify({ events });
    if (
      payload.length > 3 * 1024 * 1024 ||
      new TextEncoder().encode(payload).byteLength > 3 * 1024 * 1024
    )
      return { error: "NATIVE_SIZE_LIMIT" };
    return { payload, languageVerified: Boolean(label) };
  };
  try {
    let container = find("ytd-transcript-renderer");
    if (!container && !modernPanel()) {
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
      const modern = modernPanel();
      if (modern) {
        const result = readModern(modern);
        if (result?.error) return result;
        if (result?.payload) {
          const loading = Array.from(
            modern.querySelectorAll(
              'tp-yt-paper-spinner[active], [role="progressbar"]',
            ),
          ).some(visible);
          if (signature !== result.payload) {
            signature = result.payload;
            stableSince = Date.now();
          }
          if (!loading && Date.now() - stableSince >= 1200) return result;
        }
        await pause();
        continue;
      }
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
      if (elements.length > 100_000) return { error: "NATIVE_CUE_LIMIT" };
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
        return { error: "NATIVE_CUE_LIMIT" };
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
        if (
          payload.length > 3 * 1024 * 1024 ||
          new TextEncoder().encode(payload).byteLength > 3 * 1024 * 1024
        )
          return { error: "NATIVE_SIZE_LIMIT" };
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
