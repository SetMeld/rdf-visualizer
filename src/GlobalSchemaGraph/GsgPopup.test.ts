import { generatePopupHTML, createTooltipContent } from "./GsgPopup";

describe("generatePopupHTML", () => {
  /**
   * A table or column name is a datasource's own text, not this app's, so a name containing markup
   * must not become markup in the popup.
   */
  it("escapes a heading, a key and a value that contain markup", () => {
    const html = generatePopupHTML({
      type: "node",
      title: `<img src=x onerror=alert(1)>`,
      data: [[`<b>key</b>`, `<i>value</i>`]],
    });

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>key</b>");
    expect(html).not.toContain("<i>value</i>");
    expect(html).toContain("&lt;img");
  });

  it("falls back to the type as a heading when given no title", () => {
    const html = generatePopupHTML({ type: "property", data: [] });
    expect(html).toContain("Property");
  });
});

describe("createTooltipContent", () => {
  it("reads the shape's own details, label and value in order", () => {
    const content = createTooltipContent({
      details: [
        { label: "Table", value: "customer" },
        { label: "Mapped as", value: "gist:Customer" },
      ],
    });

    expect(content).toEqual([
      ["Table", "customer"],
      ["Mapped as", "gist:Customer"],
    ]);
  });

  it("is empty for a shape with no details", () => {
    expect(createTooltipContent({})).toEqual([]);
  });
});
