import { render } from "@testing-library/react";
import { act } from "react";
import GlobalSchemaGraph from "./GlobalSchemaGraph";
import type { GlobalSchemaModel } from "./types";

/** Every graph the component built, and whether it was torn down again. */
const mockInstances: { destroyed: boolean }[] = [];

jest.mock("cytoscape", () => {
  // Answers anything, callably and recursively. This test is about how many graphs exist rather
  // than what is drawn on them, so naming each call the component makes would tie it to the
  // drawing code and break on every unrelated change to it.
  const anything = (): unknown =>
    new Proxy(function stub() {
      return undefined;
    } as unknown as Record<string, unknown>, {
      get: (_target, property) => (property === "length" ? 0 : anything()),
      apply: () => anything(),
    });

  const factory = jest.fn(() => {
    const instance = { destroyed: false };
    mockInstances.push(instance);
    return new Proxy(instance as unknown as Record<string, unknown>, {
      get(target: Record<string, unknown>, property: string) {
        if (property === "destroy") {
          return () => {
            target.destroyed = true;
          };
        }
        if (property === "destroyed") {
          return () => target.destroyed;
        }
        return anything();
      },
    });
  }) as unknown as { (): unknown; use: () => void };
  factory.use = () => undefined;
  return { __esModule: true, default: factory };
});

jest.mock("cytoscape-dagre", () => ({ __esModule: true, default: () => undefined }));
jest.mock("cytoscape-node-html-label", () => ({ __esModule: true, default: () => undefined }));

const schema = (id: string): GlobalSchemaModel =>
  ({
    "@id": id,
    "@type": "GlobalSchemaModel",
    nodeShapes: [],
  }) as unknown as GlobalSchemaModel;

describe("GlobalSchemaGraph", () => {
  beforeEach(() => {
    mockInstances.length = 0;
  });

  /**
   * The mapping page redraws on every progress signal, which the worker emits about twice a second
   * while a run is going. Registering the label plugin is awaited, so a redraw can arrive while a
   * previous one is still suspended — and a graph built after its own cleanup ran is one nothing
   * holds a reference to, so it is never destroyed and keeps drawing the schema as it was. The
   * symptom is a graph that stops following the run until the page is reloaded.
   */
  it("leaves one graph behind when the schema changes faster than the plugin loads", async () => {
    const view = render(<GlobalSchemaGraph schema={schema("a")} />);

    // Re-rendered without flushing between, so each effect re-runs while the previous is still
    // waiting on the import.
    view.rerender(<GlobalSchemaGraph schema={schema("b")} />);
    view.rerender(<GlobalSchemaGraph schema={schema("c")} />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const live = mockInstances.filter((instance) => !instance.destroyed);
    expect(live).toHaveLength(1);
  });

  it("destroys the graph it built when it goes away", async () => {
    const view = render(<GlobalSchemaGraph schema={schema("a")} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    view.unmount();

    expect(mockInstances.every((instance) => instance.destroyed)).toBe(true);
  });
});
