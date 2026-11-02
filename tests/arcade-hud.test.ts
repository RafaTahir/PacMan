import { describe, expect, it } from "vitest";
import { partitionHud } from "../src/arcade/hud";
import type { HudItem } from "../src/arcade/shared/contracts";

describe("complete cabinet HUD", () => {
  it("prioritizes survival resources even when new objectives are declared first", () => {
    const items: HudItem[] = [
      { label: "MARKET ORDER", value: "6 BUMPERS", kind: "combo" },
      { label: "CALLED SHOT", value: "STAR 1" },
      { label: "BALL", value: "1 / 3", kind: "health" },
      { label: "MULTIPLIER", value: "×2", kind: "combo" },
      { label: "TABLE", value: "SAVE 10s", kind: "energy" },
      { label: "NIGHT SHIFT", value: "SHOOT RAMP" },
    ];
    const original = structuredClone(items);
    const { primary, details } = partitionHud(items);
    expect(primary.map(item => item.label)).toEqual(["BALL", "TABLE", "MARKET ORDER"]);
    expect(details.map(item => item.label)).toEqual(["CALLED SHOT", "MULTIPLIER", "NIGHT SHIFT"]);
    expect([...primary, ...details]).toHaveLength(items.length);
    for (const item of items) expect([...primary, ...details].filter(value => value === item)).toHaveLength(1);
    expect(items).toEqual(original);
  });
  it("preserves every extra resource and objective instead of dropping unselected fields", () => {
    const items: HudItem[] = [
      { label: "ARMOR", value: "100%", kind: "health" },
      { label: "NITRO", value: "70%", kind: "energy" },
      { label: "CHAIN", value: "×2", kind: "combo" },
      { label: "SLIPSTREAM", value: "PASS THE MARKED CAR", kind: "energy" },
      { label: "CONTRACT", value: "4 CLEAN PASSES · 15s" },
    ];
    const { primary, details } = partitionHud(items);
    expect(primary.map(item => item.label)).toEqual(["ARMOR", "NITRO", "SLIPSTREAM"]);
    expect(details.map(item => item.label)).toEqual(["CHAIN", "CONTRACT"]);
    items[4].value = "CONTRACT COMPLETE";
    expect(partitionHud(items).details[1].value).toBe("CONTRACT COMPLETE");
    expect(partitionHud([])).toEqual({ primary: [], details: [] });
  });
});
