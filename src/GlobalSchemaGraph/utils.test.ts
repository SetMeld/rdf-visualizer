import { escapeHtml, extractDatasourceIds } from "./utils";

describe("escapeHtml", () => {
  it("replaces the characters that would reopen a tag or an attribute", () => {
    expect(escapeHtml(`<script>&"'`)).toBe("&lt;script&gt;&amp;&quot;&#39;");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeHtml("customer_id")).toBe("customer_id");
  });
});

describe("extractDatasourceIds", () => {
  it("reads the @id out of an object-shaped datasource reference", () => {
    expect(extractDatasourceIds([{ datasource: { "@id": "DS1" } }])).toEqual(["DS1"]);
  });

  it("reads a string-shaped datasource reference as-is", () => {
    expect(extractDatasourceIds([{ datasource: "DS2" }])).toEqual(["DS2"]);
  });

  it("is empty for representations that name no datasource", () => {
    expect(extractDatasourceIds([{}])).toEqual([]);
  });

  it("is empty for undefined, rather than throwing", () => {
    expect(extractDatasourceIds(undefined)).toEqual([]);
  });
});
