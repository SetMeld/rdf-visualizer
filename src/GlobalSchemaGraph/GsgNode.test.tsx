import { generateNodeHTML } from "./GsgNode";
import type { GlobalSchemaNodeShape } from "./types";

const nodeShape = (overrides: Partial<GlobalSchemaNodeShape> = {}): GlobalSchemaNodeShape => ({
  "@id": "customer",
  "@type": "GlobalSchemaNodeShape",
  datasourceRepresentations: [
    { "@id": "rep-1", "@type": "DatasourceTable", primaryLabel: ["Customer"] },
  ],
  ...overrides,
});

describe("generateNodeHTML", () => {
  const getColor = () => "#000000";

  it("labels the box with the node's primary label", () => {
    const html = generateNodeHTML({ nodeShape: nodeShape(), literalPropertyShapes: [], getColor });
    expect(html).toContain("Customer");
  });

  /** A table named with markup is a real possibility this app does not control. */
  it("escapes a label and an id that contain markup", () => {
    const html = generateNodeHTML({
      nodeShape: nodeShape({
        "@id": `<img src=x onerror=alert(1)>`,
        datasourceRepresentations: [
          { "@id": "rep-1", "@type": "DatasourceTable", primaryLabel: [`<b>Customer</b>`] },
        ],
      }),
      literalPropertyShapes: [],
      getColor,
    });

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>Customer</b>");
  });

  it("draws a row for each literal property given", () => {
    const html = generateNodeHTML({
      nodeShape: nodeShape(),
      literalPropertyShapes: [
        {
          "@id": "email",
          "@type": "GlobalSchemaPropertyShape",
          datasourceRepresentations: [{ "@id": "rep-2", "@type": "DatasourceColumn", keyName: "email" }],
          datatype: "xsd:string",
        },
      ],
      getColor,
    });

    expect(html).toContain("email");
  });
});
