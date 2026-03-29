import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBillXml } from "../../src/parsers/bill-xml.js";

const fixtureXml = readFileSync(
  join(import.meta.dir, "../fixtures/sample-bill-c11.xml"),
  "utf-8",
);

describe("parseBillXml", () => {
  const { metadata, markdown } = parseBillXml(fixtureXml);

  describe("metadata", () => {
    it("extracts bill number", () => {
      expect(metadata.billNumber).toBe("C-11");
    });

    it("extracts session", () => {
      expect(metadata.session).toBe("44-1");
    });

    it("extracts long title", () => {
      expect(metadata.longTitle).toContain(
        "An Act to amend the Broadcasting Act",
      );
    });

    it("extracts short title", () => {
      expect(metadata.shortTitle).toBe("Online Streaming Act");
    });

    it("extracts stage", () => {
      expect(metadata.stage).toBe("assented-to");
    });

    it("extracts introduced date", () => {
      expect(metadata.introducedDate).toBe("2023-04-27");
    });
  });

  describe("markdown output", () => {
    it("starts with frontmatter", () => {
      expect(markdown).toMatch(/^---\n/);
      expect(markdown).toContain('bill_number: "C-11"');
      expect(markdown).toContain('stage: "assented-to"');
    });

    it("contains the bill title heading", () => {
      expect(markdown).toContain("# Bill C-11");
    });

    it("contains the summary section", () => {
      expect(markdown).toContain("## Summary");
    });

    it("contains section headings", () => {
      expect(markdown).toContain("### Section 1");
      expect(markdown).toContain("### Section 2");
    });

    it("contains heading text", () => {
      expect(markdown).toContain("Short Title");
      expect(markdown).toContain("Broadcasting Act");
    });

    it("renders inline elements", () => {
      // DefinedTermEn should be bold
      expect(markdown).toContain("**broadcasting**");
    });

    it("ends with a newline", () => {
      expect(markdown.endsWith("\n")).toBe(true);
    });
  });
});
