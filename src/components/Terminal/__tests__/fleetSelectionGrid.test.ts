// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { collectBoundingBoxIds, readEligiblePaneCoords } from "../fleetSelectionGrid";

function mountGrid(rows: number, cols: number): { container: HTMLElement; ids: string[] } {
  const container = document.createElement("div");
  container.style.cssText = "display:grid;";
  const ids: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `p-${r}-${c}`;
      const el = document.createElement("div");
      el.dataset.panelId = id;
      // jsdom doesn't implement layout, so we fake getBoundingClientRect.
      const top = r * 100;
      const left = c * 100;
      el.getBoundingClientRect = () =>
        ({
          top,
          left,
          bottom: top + 80,
          right: left + 80,
          width: 80,
          height: 80,
          x: left,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect;
      container.appendChild(el);
      ids.push(id);
    }
  }
  document.body.appendChild(container);
  return { container, ids };
}

describe("readEligiblePaneCoords", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("assigns (col, row) based on bounding rect position", () => {
    const { ids } = mountGrid(2, 3);
    const eligible = new Set(ids);
    const coords = readEligiblePaneCoords(document.body, eligible);
    expect(coords).toHaveLength(6);
    const byId = Object.fromEntries(coords.map((c) => [c.id, c]));
    expect(byId["p-0-0"]).toMatchObject({ col: 0, row: 0 });
    expect(byId["p-0-2"]).toMatchObject({ col: 2, row: 0 });
    expect(byId["p-1-0"]).toMatchObject({ col: 0, row: 1 });
    expect(byId["p-1-2"]).toMatchObject({ col: 2, row: 1 });
  });

  it("ignores panes not in the eligible set", () => {
    const { ids } = mountGrid(1, 3);
    const eligible = new Set([ids[0]!, ids[2]!]);
    const coords = readEligiblePaneCoords(document.body, eligible);
    expect(coords.map((c) => c.id)).toEqual([ids[0], ids[2]]);
    // Columns are reassigned to 0,1 within the eligible-only row so the
    // bounding-box math operates on relative positions.
    expect(coords[0]).toMatchObject({ col: 0, row: 0 });
    expect(coords[1]).toMatchObject({ col: 1, row: 0 });
  });

  it("clusters panes in the same row even under small sub-pixel drift", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const mkPane = (id: string, top: number, left: number) => {
      const el = document.createElement("div");
      el.dataset.panelId = id;
      el.getBoundingClientRect = () =>
        ({
          top,
          left,
          bottom: top + 80,
          right: left + 80,
          width: 80,
          height: 80,
          x: left,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect;
      container.appendChild(el);
    };
    mkPane("a", 10, 0);
    mkPane("b", 12, 100); // drifted by 2px — still same row
    mkPane("c", 110, 0);
    const coords = readEligiblePaneCoords(document.body, new Set(["a", "b", "c"]));
    const byId = Object.fromEntries(coords.map((c) => [c.id, c]));
    expect(byId["a"]!.row).toBe(byId["b"]!.row);
    expect(byId["c"]!.row).toBe(byId["a"]!.row + 1);
  });
});

describe("collectBoundingBoxIds", () => {
  it("returns the full rectangle between anchor and target", () => {
    const coords = [
      { id: "a", col: 0, row: 0 },
      { id: "b", col: 1, row: 0 },
      { id: "c", col: 2, row: 0 },
      { id: "d", col: 0, row: 1 },
      { id: "e", col: 1, row: 1 },
      { id: "f", col: 2, row: 1 },
    ];
    expect(collectBoundingBoxIds(coords, "a", "e").sort()).toEqual(["a", "b", "d", "e"]);
    expect(collectBoundingBoxIds(coords, "c", "d").sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("is symmetric in anchor/target order", () => {
    const coords = [
      { id: "tl", col: 0, row: 0 },
      { id: "tr", col: 1, row: 0 },
      { id: "bl", col: 0, row: 1 },
      { id: "br", col: 1, row: 1 },
    ];
    const forward = collectBoundingBoxIds(coords, "tl", "br").sort();
    const backward = collectBoundingBoxIds(coords, "br", "tl").sort();
    expect(forward).toEqual(backward);
    expect(forward).toEqual(["bl", "br", "tl", "tr"]);
  });

  it("returns an empty list when an endpoint is unknown", () => {
    const coords = [{ id: "a", col: 0, row: 0 }];
    expect(collectBoundingBoxIds(coords, "a", "z")).toEqual([]);
  });
});
