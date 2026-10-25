import { describe, it, expect } from "vitest";
import {
  parseUrl,
  batchInput,
  captionUrl,
} from "../../src/source/youtube/urls.ts";
describe("URL security", () => {
  it.each([
    "https://www.youtube.com/watch?v=abcdefghijk&list=x&t=12",
    "http://youtu.be/abcdefghijk?si=tracking",
    "https://youtube.com/shorts/abcdefghijk",
    "https://m.youtube.com/live/abcdefghijk",
    "https://www.youtube.com/embed/abcdefghijk",
  ])("normalizes %s", (url) => {
    expect(parseUrl(url)).toEqual({
      videoId: "abcdefghijk",
      sourceUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    });
  });
  it.each([
    "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "javascript:alert(1)",
    "file:///watch?v=abcdefghijk",
    "https://user:pass@youtube.com/watch?v=abcdefghijk",
    "https://youtube.com:444/watch?v=abcdefghijk",
    "https://youtube.com/watch?v=abcdefghijk&v=12345678901",
    "https://youtube.com/watch?v=bad",
    "https://youtube.com/watch?v=abcdefghijk%xx",
    "https://youtu.be/abcdefghijk/other",
  ])("rejects %s", (url) => expect(() => parseUrl(url)).toThrow());
  it("deduplicates IDs and preserves order without fetching", () => {
    expect(
      batchInput(
        "https://youtu.be/abcdefghijk https://youtube.com/watch?v=abcdefghijk\ninvalid",
      ).duplicates,
    ).toBe(1);
    expect(batchInput("invalid").invalid).toEqual(["invalid"]);
  });
  it("restricts signed caption URLs to exact permitted hosts and paths", () => {
    expect(() => captionUrl("https://evil.test/api/timedtext")).toThrow();
    expect(() =>
      captionUrl("https://www.youtube.com/watch?v=abcdefghijk"),
    ).toThrow();
    expect(
      captionUrl("https://www.youtube.com/api/timedtext?sig=a%2Bb").search,
    ).toBe("?sig=a%2Bb");
  });
});
