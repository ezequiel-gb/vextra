import { describe, it, expect } from "vitest";
import {
  discoveryFrom,
  discoveryFromHtml,
  embeddedJson,
} from "../../src/source/youtube/discovery.ts";
import { chooseTrack } from "../../src/source/youtube/index.ts";
const player = {
  videoDetails: {
    videoId: "abcdefghijk",
    title: "Title",
    author: "Channel",
    lengthSeconds: "20",
  },
  playabilityStatus: { status: "OK" },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        {
          baseUrl: "https://www.youtube.com/api/timedtext?v=abcdefghijk",
          languageCode: "en",
          name: { simpleText: "English" },
        },
        {
          baseUrl:
            "https://www.youtube.com/api/timedtext?v=abcdefghijk&kind=asr",
          languageCode: "en",
          kind: "asr",
          name: { simpleText: "English auto" },
        },
      ],
    },
  },
};
describe("discovery adapters", () => {
  it("parses balanced JSON with quoted and escaped braces", () => {
    const data = { text: 'hello } \\" quote', nested: { a: 1 } };
    expect(
      embeddedJson(
        `var ytInitialPlayerResponse = ${JSON.stringify(data)};`,
        "var ytInitialPlayerResponse =",
      ),
    ).toEqual(data);
  });
  it("validates video identity and prefers creator track without translating", () => {
    const d = discoveryFrom(player, {}, "abcdefghijk", "test");
    expect(
      chooseTrack(d, { language: "en", captionType: "manual" }).captionType,
    ).toBe("manual");
    expect(
      chooseTrack(d, { language: "en", captionType: "automatic" }).captionType,
    ).toBe("automatic");
    expect(() => discoveryFrom(player, {}, "12345678901", "test")).toThrow();
  });
  it("only accepts genuine chapter renderer records", () => {
    const d = discoveryFrom(
      player,
      {
        description: "00:00 Imaginary",
        items: [
          {
            chapterRenderer: {
              title: { simpleText: "Actual" },
              timeRangeStartMillis: 0,
            },
          },
        ],
      },
      "abcdefghijk",
      "test",
    );
    expect(d.chapters).toHaveLength(1);
    expect(d.chapters[0]?.title).toBe("Actual");
  });
  it("isolates no captions, changed discovery and restricted responses", () => {
    expect(() =>
      discoveryFrom({ ...player, captions: {} }, {}, "abcdefghijk", "test"),
    ).toThrow("No accessible");
    expect(() =>
      discoveryFromHtml("<html>unexpected</html>", "abcdefghijk"),
    ).toThrow("could not be recognised");
    expect(() =>
      discoveryFrom(
        { ...player, playabilityStatus: { status: "LOGIN_REQUIRED" } },
        {},
        "abcdefghijk",
        "test",
      ),
    ).toThrow("access");
  });
});
