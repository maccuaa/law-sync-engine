import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseStatuteXml } from "../../src/parsers/justice-laws-xml.js";

const fixtureXml = readFileSync(
  join(import.meta.dir, "../fixtures/sample-statute-broadcasting.xml"),
  "utf-8",
);

describe("parseStatuteXml", () => {
  const { metadata, markdown } = parseStatuteXml(fixtureXml, "B-9.01");

  describe("metadata", () => {
    it("extracts short title", () => {
      expect(metadata.shortTitle).toBe("Broadcasting Act");
    });

    it("extracts long title", () => {
      expect(metadata.longTitle).toContain("An Act respecting broadcasting");
    });

    it("preserves actId", () => {
      expect(metadata.actId).toBe("B-9.01");
    });

    it("extracts lastAmended date", () => {
      expect(metadata.lastAmended).toBe("2023-06-22");
    });
  });

  describe("markdown output", () => {
    it("starts with frontmatter", () => {
      expect(markdown).toMatch(/^---\n/);
      expect(markdown).toContain('title: "Broadcasting Act"');
      expect(markdown).toContain('act_id: "B-9.01"');
      expect(markdown).toContain("laws-lois.justice.gc.ca");
    });

    it("contains the title heading", () => {
      expect(markdown).toContain("# Broadcasting Act");
    });

    it("contains section headings", () => {
      expect(markdown).toContain("### Section 1");
      expect(markdown).toContain("### Section 2");
    });

    it("contains heading structure", () => {
      expect(markdown).toContain("Short Title");
      expect(markdown).toContain("PART I");
      expect(markdown).toContain("General");
    });

    it("contains definitions with bold terms", () => {
      expect(markdown).toContain("**affiliate**");
      expect(markdown).toContain("**broadcasting**");
    });

    it("handles lims namespace attributes gracefully", () => {
      // Should not crash and should produce valid output
      expect(markdown.length).toBeGreaterThan(100);
    });

    it("ends with a newline", () => {
      expect(markdown.endsWith("\n")).toBe(true);
    });
  });
});
