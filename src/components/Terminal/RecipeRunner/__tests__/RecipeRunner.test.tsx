// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { UseRecipeRunnerResult, SpawnBannerState } from "../useRecipeRunner";
import type { TerminalRecipe, RunCommand } from "@/types";
import type { RecipeSections, RankedRecipe } from "../recipeRunnerUtils";

let mockRunnerResult: UseRecipeRunnerResult;

vi.mock("../useRecipeRunner", () => ({
  useRecipeRunner: () => mockRunnerResult,
}));

vi.mock("../RecipeRunnerGrid", () => ({
  RecipeRunnerGrid: ({ recipes }: { recipes: TerminalRecipe[] }) => (
    <div data-testid="recipe-grid">{recipes.length} recipes</div>
  ),
}));

vi.mock("../RecipeRunnerList", () => ({
  RecipeRunnerList: () => <div data-testid="recipe-list">List</div>,
}));

vi.mock("../RecipeRunnerEmpty", () => ({
  RecipeRunnerEmpty: ({ onCreate }: { onCreate: () => void }) => (
    <button data-testid="recipe-empty-create" onClick={onCreate}>
      Create recipe
    </button>
  ),
}));

vi.mock("@/components/Terminal/InlineStatusBanner", () => ({
  InlineStatusBanner: ({
    title,
    description,
    actions,
    onClose,
  }: {
    title: string;
    description?: string;
    actions?: Array<{ id: string; label: string; onClick: () => void }>;
    onClose?: () => void;
  }) => (
    <div data-testid="inline-banner">
      <span data-testid="banner-title">{title}</span>
      {description && <span data-testid="banner-description">{description}</span>}
      {actions?.map((a) => (
        <button key={a.id} data-testid={`banner-action-${a.id}`} onClick={a.onClick}>
          {a.label}
        </button>
      ))}
      {onClose && (
        <button data-testid="banner-close" onClick={onClose}>
          Dismiss
        </button>
      )}
    </div>
  ),
}));

import { RecipeRunner } from "../RecipeRunner";

function baseRunner(): UseRecipeRunnerResult {
  return {
    recipes: [],
    sections: { pinned: [], recent: [], all: [] } as RecipeSections,
    searchQuery: "",
    setSearchQuery: vi.fn(),
    searchResults: [] as RankedRecipe[],
    focusedIndex: 0,
    setFocusedIndex: vi.fn(),
    showSearch: false,
    totalItems: 1,
    focusedItemId: undefined,
    suggestions: [] as RunCommand[],
    handleRun: vi.fn(),
    handleEdit: vi.fn(),
    handleDuplicate: vi.fn(),
    handlePin: vi.fn(),
    handleUnpin: vi.fn(),
    handleDelete: vi.fn(),
    handleCreate: vi.fn(),
    handleKeyDown: vi.fn(),
    getFlatRecipes: vi.fn(() => []),
    spawnBanner: null,
    dismissSpawnBanner: vi.fn(),
    retryFailed: vi.fn(),
  };
}

function makeBanner(overrides?: Partial<SpawnBannerState>): SpawnBannerState {
  return {
    recipeId: "r1",
    recipeName: "Test Recipe",
    total: 4,
    spawned: 3,
    failed: [{ index: 1, name: "Codex Agent" }],
    unresolvedVars: [],
    ...overrides,
  };
}

function makeRecipe(id: string, name = id): TerminalRecipe {
  return {
    id,
    name,
    terminals: [{ type: "terminal", env: {} }],
    createdAt: Date.now(),
  } as TerminalRecipe;
}

describe("RecipeRunner", () => {
  it("shows empty state when no recipes", () => {
    mockRunnerResult = { ...baseRunner(), recipes: [] };
    const { getByTestId } = render(<RecipeRunner activeWorktreeId="wt-1" defaultCwd="/tmp" />);
    expect(getByTestId("recipe-empty-create")).toBeTruthy();
  });

  it("renders grid when recipes exist and search is hidden", () => {
    mockRunnerResult = {
      ...baseRunner(),
      recipes: [makeRecipe("r1")],
      getFlatRecipes: vi.fn(() => [makeRecipe("r1")]),
      showSearch: false,
    };
    const { getByTestId } = render(<RecipeRunner activeWorktreeId="wt-1" defaultCwd="/tmp" />);
    expect(getByTestId("recipe-grid")).toBeTruthy();
  });

  it("renders banner above grid when spawnBanner is set", () => {
    const retryMock = vi.fn();
    const dismissMock = vi.fn();
    mockRunnerResult = {
      ...baseRunner(),
      recipes: [makeRecipe("r1")],
      getFlatRecipes: vi.fn(() => [makeRecipe("r1")]),
      showSearch: false,
      spawnBanner: makeBanner(),
      retryFailed: retryMock,
      dismissSpawnBanner: dismissMock,
    };
    const { getByTestId } = render(<RecipeRunner activeWorktreeId="wt-1" defaultCwd="/tmp" />);
    expect(getByTestId("inline-banner")).toBeTruthy();
    expect(getByTestId("banner-title").textContent).toContain("Started 3 of 4");
  });

  it("shows unresolved var description in banner", () => {
    mockRunnerResult = {
      ...baseRunner(),
      recipes: [makeRecipe("r1")],
      getFlatRecipes: vi.fn(() => [makeRecipe("r1")]),
      showSearch: false,
      spawnBanner: makeBanner({
        spawned: 4,
        failed: [],
        unresolvedVars: ["issue_number", "branch_name"],
      }),
    };
    const { getByTestId } = render(<RecipeRunner activeWorktreeId="wt-1" defaultCwd="/tmp" />);
    expect(getByTestId("banner-description").textContent).toContain("{{issue_number}}");
    expect(getByTestId("banner-description").textContent).toContain("{{branch_name}}");
  });

  it("does not show retry button when there are no spawn failures", () => {
    mockRunnerResult = {
      ...baseRunner(),
      recipes: [makeRecipe("r1")],
      getFlatRecipes: vi.fn(() => [makeRecipe("r1")]),
      showSearch: false,
      spawnBanner: makeBanner({ spawned: 4, failed: [], unresolvedVars: ["issue_number"] }),
    };
    const { queryByTestId } = render(<RecipeRunner activeWorktreeId="wt-1" defaultCwd="/tmp" />);
    expect(queryByTestId("banner-action-retry-failed")).toBeNull();
  });

  it("shows retry button when there are spawn failures", () => {
    mockRunnerResult = {
      ...baseRunner(),
      recipes: [makeRecipe("r1")],
      getFlatRecipes: vi.fn(() => [makeRecipe("r1")]),
      showSearch: false,
      spawnBanner: makeBanner(),
    };
    const { getByTestId } = render(<RecipeRunner activeWorktreeId="wt-1" defaultCwd="/tmp" />);
    expect(getByTestId("banner-action-retry-failed")).toBeTruthy();
  });

  it("banner title handles all-failed case", () => {
    mockRunnerResult = {
      ...baseRunner(),
      recipes: [makeRecipe("r1")],
      getFlatRecipes: vi.fn(() => [makeRecipe("r1")]),
      showSearch: false,
      spawnBanner: makeBanner({
        spawned: 0,
        failed: [
          { index: 0, name: "Shell 1" },
          { index: 1, name: "Shell 2" },
        ],
      }),
    };
    const { getByTestId } = render(<RecipeRunner activeWorktreeId="wt-1" defaultCwd="/tmp" />);
    expect(getByTestId("banner-title").textContent).toContain("Couldn't start any terminals");
  });
});
