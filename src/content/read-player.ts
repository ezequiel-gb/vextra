/** Self-contained: Chrome serialises this function into the untrusted page world. */
export function readPlayer() {
  const w = window as unknown as {
    ytInitialPlayerResponse?: unknown;
    ytInitialData?: { engagementPanels?: unknown };
  };
  const player = document.querySelector("#movie_player") as
    (HTMLElement & { getPlayerResponse?: () => unknown }) | null;
  let response: unknown;
  try {
    response = player?.getPlayerResponse?.() ?? w.ytInitialPlayerResponse;
  } catch {
    response = w.ytInitialPlayerResponse;
  }
  const safe =
    response && typeof response === "object"
      ? (response as Record<string, unknown>)
      : {};
  const snapshot = {
    player: {
      videoDetails: safe.videoDetails,
      captions: safe.captions,
      playabilityStatus: safe.playabilityStatus,
    },
    initial: { engagementPanels: w.ytInitialData?.engagementPanels },
  };
  const serialized = JSON.stringify(snapshot);
  return serialized.length <= 3 * 1024 * 1024 &&
    new TextEncoder().encode(serialized).byteLength <= 3 * 1024 * 1024
    ? snapshot
    : null;
}
