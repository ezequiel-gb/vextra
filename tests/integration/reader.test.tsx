import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Reader } from "../../src/ui/Reader.tsx";
import { Preview } from "../../src/ui/Preview.tsx";
import { defaults } from "../../src/model/types.ts";
import { documentFixture as doc } from "../fixtures/document.ts";
vi.mock("../../src/browser/compute.ts", () => ({
  compute: vi.fn().mockResolvedValue([]),
}));
HTMLElement.prototype.scrollTo = vi.fn();
HTMLElement.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);
it("bounds original cue rendering and lets keyboard users select passages", async () => {
  const long = {
    ...doc,
    segments: Array.from({ length: 1000 }, (_, i) => ({
      ...doc.segments[0]!,
      id: `long-${i}`,
      startMs: i * 1000,
      text: `Caption ${i}`,
    })),
  };
  const selection = vi.fn();
  render(
    <Reader
      doc={long}
      settings={{ ...defaults, reading: "original" }}
      update={vi.fn()}
      passages={[]}
      setPassages={selection}
      passageMode
    />,
  );
  expect(screen.getAllByRole("checkbox")).toHaveLength(101);
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Select passage at 00:00:00" }),
  );
  expect(selection).toHaveBeenCalledWith(["long-0"]);
  await userEvent.click(screen.getByRole("button", { name: "Next passages" }));
  expect(screen.getByText("Caption 100")).toBeTruthy();
  expect(screen.queryByText("Caption 0")).toBeNull();
});
it("renders headings while keeping HTML/scripts/unsafe links inert", () => {
  const { container } = render(
    <Preview
      text={
        "# Safe\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n![remote](https://evil.test/track)\n\n[Source](https://www.youtube.com/watch?v=abcdefghijk)"
      }
    />,
  );
  expect(screen.getByRole("heading", { name: "Safe" })).toBeTruthy();
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  expect(screen.getByRole("link", { name: "Source" }).getAttribute("rel")).toBe(
    "noopener noreferrer",
  );
});
