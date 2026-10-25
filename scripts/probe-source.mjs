// Development-only feasibility experiment. Never logs signed URLs or context identifiers.
import {
  embeddedJson,
  discoveryFromHtml,
} from "../src/source/youtube/discovery.ts";
const id = process.argv[2] ?? "aircAruvnKk";
const html = await (
  await fetch(`https://www.youtube.com/watch?v=${id}`)
).text();
const discovery = discoveryFromHtml(html, id),
  track =
    discovery.tracks.find((t) => t.languageCode === "en") ??
    discovery.tracks[0];
const url = new URL(track.acquisitionRef);
console.log(
  JSON.stringify({
    videoId: id,
    tracks: discovery.tracks.length,
    captionParams: [...url.searchParams.keys()],
    proofTokenExperiment: url.searchParams.get("exp"),
  }),
);
for (const fmt of ["", "json3", "srv3"]) {
  const request = new URL(url);
  if (fmt) request.searchParams.set("fmt", fmt);
  const response = await fetch(request, {
      credentials: "omit",
      redirect: "error",
    }),
    body = await response.text();
  console.log(
    JSON.stringify({
      captionFormat: fmt || "original",
      status: response.status,
      bytes: body.length,
    }),
  );
  await new Promise((r) => setTimeout(r, 1000));
}
const initial = embeddedJson(html, "var ytInitialData ="),
  context = embeddedJson(html, '"INNERTUBE_CONTEXT":');
let params;
const walk = (v, depth = 0) => {
  if (depth > 50 || !v || typeof v !== "object") return;
  if (v.getTranscriptEndpoint?.params) params = v.getTranscriptEndpoint.params;
  for (const x of Object.values(v))
    if (x && typeof x === "object") walk(x, depth + 1);
};
walk(initial);
console.log(
  JSON.stringify({
    transcriptEndpointAvailable: Boolean(params),
    contextAvailable: Boolean(context),
  }),
);
if (params && context) {
  const response = await fetch(
    "https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      redirect: "error",
      body: JSON.stringify({ context, params }),
    },
  );
  const result = await response.json();
  let cues = 0;
  const count = (v) => {
    if (!v || typeof v !== "object") return;
    if (v.transcriptSegmentRenderer) cues++;
    Object.values(v).forEach((x) => {
      if (x && typeof x === "object") count(x);
    });
  };
  count(result);
  console.log(
    JSON.stringify({
      transcriptEndpointStatus: response.status,
      transcriptSegments: cues,
      rootKeys: Object.keys(result),
      errorMessage: result.error?.message,
    }),
  );
}
