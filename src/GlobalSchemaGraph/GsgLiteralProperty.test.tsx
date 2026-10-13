import { generateLiteralPropertyHTML } from "./GsgLiteralProperty";
import type { GlobalSchemaPropertyShape } from "./types";

const propertyShape = (
  overrides: Partial<GlobalSchemaPropertyShape> = {}
): GlobalSchemaPropertyShape => ({
  "@id": "email",
  "@type": "GlobalSchemaPropertyShape",
  datasourceRepresentations: [
    { "@id": "rep-1", "@type": "DatasourceColumn", keyName: "email" },
  ],
  datatype: "xsd:string",
  ...overrides,
});

describe("generateLiteralPropertyHTML", () => {
  const getColor = () => "#000000";

  it("names the property by the column's own key", () => {
    const html = generateLiteralPropertyHTML({
      propertyShape: propertyShape(),
      index: 0,
      nodeId: "customer",
      getColor,
    });

    expect(html).toContain("email");
    expect(html).toContain("xsd:string");
  });

  /** A column named with markup is a real possibility this app does not control. */
  it("escapes a key name and a datatype that contain markup", () => {
    const html = generateLiteralPropertyHTML({
      propertyShape: propertyShape({
        datasourceRepresentations: [
          { "@id": "rep-1", "@type": "DatasourceColumn", keyName: `<b>email</b>` },
        ],
        datatype: `<i>xsd:string</i>`,
      }),
      index: 0,
      nodeId: "customer",
      getColor,
    });

    expect(html).not.toContain("<b>email</b>");
    expect(html).not.toContain("<i>xsd:string</i>");
  });

  it("says 0-1 for a property that is optional and single-valued", () => {
    const html = generateLiteralPropertyHTML({
      propertyShape: propertyShape({ minCount: 0, maxCount: 1 }),
      index: 0,
      nodeId: "customer",
      getColor,
    });

    expect(html).toContain("0-1");
  });

  it("says ∞ for a property with no maximum", () => {
    const html = generateLiteralPropertyHTML({
      propertyShape: propertyShape({ minCount: 0, maxCount: null }),
      index: 0,
      nodeId: "customer",
      getColor,
    });

    expect(html).toContain("∞");
  });
});
