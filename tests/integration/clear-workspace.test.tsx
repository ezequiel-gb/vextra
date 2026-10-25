import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../src/ui/App.tsx";
import { defaults } from "../../src/model/types.ts";
import { documentFixture as doc } from "../fixtures/document.ts";
import { compute } from "../../src/browser/compute.ts";
import { downloadBlob } from "../../src/browser/platform.ts";
vi.mock("../../src/persistence/database.ts", () => ({
  cleanup: vi.fn().mockResolvedValue(0),
  latestBatch: vi.fn().mockResolvedValue(undefined),
  latestDocument: vi.fn().mockImplementation(async () => doc),
  clearData: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/persistence/settings.ts", () => ({
  saveSettings: vi.fn().mockResolvedValue(undefined),
  clearSettings: vi.fn().mockResolvedValue(undefined),
  validatedSettings: (raw: unknown) => raw,
}));
vi.mock("../../src/browser/platform.ts", () => ({
  activeVideo: vi.fn().mockRejectedValue(new Error("No active video")),
  downloadBlob: vi.fn(),
  openExpanded: vi.fn(),
}));
vi.mock("../../src/browser/compute.ts", () => ({ compute: vi.fn() }));
vi.mock("../../src/ui/Reader.tsx", () => ({
  Reader: () => <p>Test reader</p>,
}));
beforeEach(() => {
  const event = { addListener: vi.fn(), removeListener: vi.fn() };
  vi.stubGlobal("chrome", {
    runtime: { onMessage: event, getManifest: () => ({ version: "1.0.0" }) },
    tabs: { onActivated: event, onUpdated: event },
    storage: { onChanged: event },
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("prevents a pending export from downloading after temporary transcripts are cleared", async () => {
  let finish!: (value: string) => void;
  vi.mocked(compute).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve as typeof finish;
      }),
  );
  render(<App initialSettings={structuredClone(defaults)} />);
  await userEvent.click(
    (await screen.findAllByRole("button", { name: "Download .md" }))[0]!,
  );
  await userEvent.click(screen.getByRole("button", { name: "Settings" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Clear temporary transcripts" }),
  );
  await screen.findByText("Temporary transcripts and batches cleared.", {
    selector: ".settings p",
  });
  await act(async () => {
    finish("Private text that must not be downloaded");
  });
  expect(downloadBlob).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Back to workspace" }),
  );
  expect(
    screen.queryAllByRole("button", { name: "Download .md" }),
  ).toHaveLength(0);
});
