import { it, expect } from "vitest";
import { validatedSettings } from "../../src/persistence/settings.ts";
it("validates each stored setting independently and drops corrupt templates", () => {
  const s = validatedSettings({
    theme: "dark",
    language: "fr",
    timestamps: "bad",
    templates: [{ id: "x", name: "A", body: "{{bad}}" }],
  });
  expect(s.theme).toBe("dark");
  expect(s.language).toBe("fr");
  expect(s.timestamps).toBe(false);
  expect(s.templates).toEqual([]);
});
