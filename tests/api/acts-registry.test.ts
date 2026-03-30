import { describe, expect, test } from "bun:test";
import { titleToSlug } from "../../src/api/acts-registry.js";

describe("acts-registry", () => {
  describe("titleToSlug", () => {
    test("simple act name", () => {
      expect(titleToSlug("Broadcasting Act")).toBe("broadcasting-act");
    });

    test("criminal code", () => {
      expect(titleToSlug("Criminal Code")).toBe("criminal-code");
    });

    test("multi-word act", () => {
      expect(titleToSlug("Access to Information Act")).toBe(
        "access-to-information-act",
      );
    });

    test("act with year suffix strips year", () => {
      expect(titleToSlug("Budget Implementation Act, 2007")).toBe(
        "budget-implementation-act",
      );
    });

    test("act with parenthetical strips it", () => {
      expect(titleToSlug("Agricultural and Rural Development Act (ARDA)")).toBe(
        "agricultural-and-rural-development-act",
      );
    });

    test("hyphenated country names", () => {
      expect(
        titleToSlug("Canada-Belgium Income Tax Convention Act, 1976"),
      ).toBe("canada-belgium-income-tax-convention-act");
    });

    test("matches extractAffectedStatutes output for Citizenship Act", () => {
      // extractAffectedStatutes("An Act to amend the Citizenship Act (2025)")
      // → captures "Citizenship Act" → slug "citizenship-act"
      expect(titleToSlug("Citizenship Act")).toBe("citizenship-act");
    });

    test("title with Acts (plural) stops at Act", () => {
      // "Constitution Acts, 1867 to 1982" — regex matches up to first "Act"
      expect(titleToSlug("Constitution Acts, 1867 to 1982")).toBe(
        "constitution-act",
      );
    });

    test("en dash in title", () => {
      expect(titleToSlug("Canada–Armenia Tax Convention Act, 2004")).toBe(
        "canadaarmenia-tax-convention-act",
      );
    });
  });
});
