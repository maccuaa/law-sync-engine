import { describe, expect, test } from "bun:test";
import { BillSchema, PoliticianSchema } from "../../src/api/openparliament.js";

import billsListFixture from "../fixtures/sample-api-responses/bills-list.json";
import politicianFixture from "../fixtures/sample-api-responses/politician.json";

describe("BillSchema", () => {
  test("parses a fully populated bill", () => {
    const bill = billsListFixture.objects[0];
    const result = BillSchema.parse(bill);

    expect(result.session).toBe("44-1");
    expect(result.number).toBe("C-11");
    expect(result.name.en).toContain("Broadcasting Act");
    expect(result.law).toBe(true);
    expect(result.sponsor_politician_url).toBe("/politicians/pablo-rodriguez/");
    expect(result.vote_urls).toEqual(["/votes/44-1/292/"]);
    expect(result.url).toBe("/bills/44-1/C-11/");
  });

  test("parses a minimal bill with only required fields", () => {
    const bill = billsListFixture.objects[1];
    const result = BillSchema.parse(bill);

    expect(result.session).toBe("44-1");
    expect(result.number).toBe("C-26");
    expect(result.name.en).toContain("cyber security");
    expect(result.url).toBe("/bills/44-1/C-26/");
    expect(result.short_title).toBeUndefined();
    expect(result.introduced).toBeUndefined();
    expect(result.text_url).toBeUndefined();
  });

  test("parses a bill with null fields from the API", () => {
    const result = BillSchema.parse({
      session: "45-1",
      number: "C-99",
      name: { en: "Test Act", fr: null },
      url: "/bills/45-1/C-99/",
      introduced: null,
      short_title: null,
      home_chamber: null,
      sponsor_politician_url: null,
      text_url: null,
    });

    expect(result.number).toBe("C-99");
    expect(result.introduced).toBeNull();
    expect(result.short_title).toBeNull();
  });

  test("rejects a bill missing required fields", () => {
    expect(() =>
      BillSchema.parse({
        session: "44-1",
        // missing name, number, url
      }),
    ).toThrow();
  });

  test("rejects a bill with wrong types", () => {
    expect(() =>
      BillSchema.parse({
        session: "44-1",
        name: { en: 123 },
        number: "C-11",
        url: "/bills/44-1/C-11/",
      }),
    ).toThrow();
  });
});

describe("PoliticianSchema", () => {
  test("parses a valid politician", () => {
    const result = PoliticianSchema.parse(politicianFixture);

    expect(result.name).toBe("Pablo Rodriguez");
    expect(result.given_name).toBe("Pablo");
    expect(result.family_name).toBe("Rodriguez");
    expect(result.email).toBe("pablo.rodriguez@parl.gc.ca");
    expect(result.url).toBe("/politicians/pablo-rodriguez/");
  });

  test("parses a minimal politician with only name", () => {
    const result = PoliticianSchema.parse({ name: "Jane Doe" });

    expect(result.name).toBe("Jane Doe");
    expect(result.given_name).toBeUndefined();
    expect(result.email).toBeUndefined();
  });

  test("rejects a politician missing name", () => {
    expect(() =>
      PoliticianSchema.parse({
        email: "test@example.com",
      }),
    ).toThrow();
  });
});
