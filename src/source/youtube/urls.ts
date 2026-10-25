import { VextraError } from "../../model/errors.ts";
export const hosts = new Set([
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
]);
export function parseUrl(input: string): {
  videoId: string;
  sourceUrl: string;
} {
  try {
    if (/%(?![\da-f]{2})/i.test(input)) throw new Error();
    const u = new URL(input.trim());
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.port ||
      (!hosts.has(u.hostname) && u.hostname !== "youtu.be")
    )
      throw new Error();
    let id: string | undefined;
    if (u.hostname === "youtu.be")
      id = u.pathname.match(/^\/([\w-]{11})\/?$/)?.[1];
    else if (u.pathname === "/watch") {
      const ids = [...new Set(u.searchParams.getAll("v"))];
      if (ids.length !== 1) throw new Error();
      id = ids[0];
    } else
      id = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})\/?$/)?.[1];
    if (!id || !/^[\w-]{11}$/.test(id)) throw new Error();
    return { videoId: id, sourceUrl: `https://www.youtube.com/watch?v=${id}` };
  } catch {
    throw new VextraError("INVALID_URL");
  }
}
export function captionUrl(value: string): URL {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new VextraError("CAPTION_FETCH_FAILED");
  }
  if (
    u.protocol !== "https:" ||
    !hosts.has(u.hostname) ||
    u.port ||
    u.username ||
    u.password ||
    u.pathname !== "/api/timedtext"
  )
    throw new VextraError("CAPTION_FETCH_FAILED");
  return u;
}
export function batchInput(input: string) {
  const seen = new Set<string>();
  let duplicates = 0;
  const invalid: string[] = [];
  const videos: ReturnType<typeof parseUrl>[] = [];
  for (const token of input.trim().split(/\s+/).filter(Boolean)) {
    try {
      const v = parseUrl(token);
      if (seen.has(v.videoId)) duplicates++;
      else {
        seen.add(v.videoId);
        videos.push(v);
      }
    } catch {
      invalid.push(token);
    }
  }
  if (videos.length > 100 || input.length > 100_000)
    throw new VextraError("LIMIT");
  return { videos, duplicates, invalid };
}
