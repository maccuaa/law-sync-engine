import { describe, it, expect } from "bun:test";
import {
  extractText,
  renderSection,
  renderSubsection,
  renderHeading,
  renderParagraph,
  renderDefinition,
  renderMarginalNote,
  generateFrontmatter,
  ensureArray,
  findOrderedElement,
  renderOrderedBody,
  createOrderPreservingParser,
} from "../../src/parsers/shared.js";

describe("extractText", () => {
  it("returns empty string for null/undefined", () => {
    expect(extractText(null)).toBe("");
    expect(extractText(undefined)).toBe("");
  });

  it("returns string as-is", () => {
    expect(extractText("hello")).toBe("hello");
  });

  it("converts numbers to strings", () => {
    expect(extractText(44)).toBe("44");
  });

  it("extracts #text from object", () => {
    expect(extractText({ "#text": "hello world" })).toBe("hello world");
  });

  it("handles object with #text array", () => {
    expect(extractText({ "#text": ["hello", "world"] })).toBe("hello world");
  });

  it("handles DefinedTermEn inline", () => {
    const node = {
      "#text": "The term",
      DefinedTermEn: "broadcasting",
    };
    expect(extractText(node)).toBe("The term **broadcasting**");
  });

  it("handles XRefExternal inline", () => {
    const node = {
      "#text": "See the",
      XRefExternal: "Broadcasting Act",
    };
    expect(extractText(node)).toBe("See the Broadcasting Act");
  });

  it("handles Keep inline element", () => {
    const node = {
      "#text": "socio",
      Keep: "-economic",
    };
    expect(extractText(node)).toBe("socio -economic");
  });

  it("ignores attribute keys", () => {
    const node = {
      "#text": "hello",
      "@_type": "act",
    };
    expect(extractText(node)).toBe("hello");
  });
});

describe("renderMarginalNote", () => {
  it("returns empty string for falsy input", () => {
    expect(renderMarginalNote(null)).toBe("");
    expect(renderMarginalNote(undefined)).toBe("");
  });

  it("wraps text in italics", () => {
    expect(renderMarginalNote("Short title")).toBe("*Short title*");
  });
});

describe("renderHeading", () => {
  it("renders level 1 heading with ## prefix", () => {
    const heading = { "@_level": "1", TitleText: "Short Title" };
    expect(renderHeading(heading)).toBe("## Short Title\n");
  });

  it("renders level 2 heading with ### prefix", () => {
    const heading = { "@_level": "2", TitleText: "Interpretation" };
    expect(renderHeading(heading)).toBe("### Interpretation\n");
  });

  it("renders heading with label and title", () => {
    const heading = {
      "@_level": "1",
      Label: "PART I",
      TitleText: "General",
    };
    expect(renderHeading(heading)).toBe("## PART I — General\n");
  });

  it("caps at #### for high levels", () => {
    const heading = { "@_level": "5", TitleText: "Deep" };
    expect(renderHeading(heading)).toBe("#### Deep\n");
  });

  it("defaults to level 1 when no level attribute", () => {
    const heading = { TitleText: "No Level" };
    expect(renderHeading(heading)).toBe("## No Level\n");
  });
});

describe("renderSection", () => {
  it("renders section with label and text", () => {
    const section = {
      Label: "1",
      MarginalNote: "Short title",
      Text: "This Act may be cited as the Broadcasting Act.",
    };
    const result = renderSection(section);
    expect(result).toContain("### Section 1");
    expect(result).toContain("*Short title*");
    expect(result).toContain(
      "This Act may be cited as the Broadcasting Act.",
    );
  });

  it("renders section without subsections gracefully", () => {
    const section = { Label: "5", Text: "Simple text." };
    const result = renderSection(section);
    expect(result).toContain("### Section 5");
    expect(result).toContain("Simple text.");
  });
});

describe("renderSubsection", () => {
  it("renders label and text in bold label format", () => {
    const sub = { Label: "(1)", Text: "In this Act," };
    const result = renderSubsection(sub);
    expect(result).toContain("**(1)** In this Act,");
  });

  it("renders marginal note if present", () => {
    const sub = {
      MarginalNote: "Definitions",
      Label: "(1)",
      Text: "In this Act,",
    };
    const result = renderSubsection(sub);
    expect(result).toContain("*Definitions*");
  });

  it("renders text only when no label", () => {
    const sub = { Text: "Just text" };
    const result = renderSubsection(sub);
    expect(result).toContain("Just text");
  });
});

describe("renderParagraph", () => {
  it("renders paragraph with label and text", () => {
    const para = { Label: "(a)", Text: "the first item" };
    expect(renderParagraph(para)).toBe("  - (a) the first item\n");
  });

  it("renders paragraph without label", () => {
    const para = { Text: "no label item" };
    expect(renderParagraph(para)).toBe("  - no label item\n");
  });

  it("returns empty string when no text", () => {
    const para = { Label: "(a)" };
    expect(renderParagraph(para)).toBe("");
  });
});

describe("renderDefinition", () => {
  it("renders term and text in blockquote", () => {
    const def = {
      DefinedTermEn: "broadcasting",
      Text: "means any transmission of programs",
    };
    const result = renderDefinition(def);
    expect(result).toContain("> **broadcasting**");
    expect(result).toContain("> means any transmission of programs");
  });
});

describe("ensureArray", () => {
  it("returns empty array for null/undefined", () => {
    expect(ensureArray(null)).toEqual([]);
    expect(ensureArray(undefined)).toEqual([]);
  });

  it("wraps non-array in array", () => {
    expect(ensureArray("hello")).toEqual(["hello"]);
    expect(ensureArray(42)).toEqual([42]);
  });

  it("returns array as-is", () => {
    expect(ensureArray([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe("generateFrontmatter", () => {
  it("generates YAML frontmatter", () => {
    const result = generateFrontmatter({
      title: "Broadcasting Act",
      act_id: "B-9.01",
    });
    expect(result).toBe(
      '---\ntitle: "Broadcasting Act"\nact_id: "B-9.01"\n---',
    );
  });

  it("escapes double quotes", () => {
    const result = generateFrontmatter({ title: 'Say "hello"' });
    expect(result).toContain('title: "Say \\"hello\\""');
  });

  it("skips undefined values", () => {
    const result = generateFrontmatter({
      title: "Test",
      missing: undefined,
    });
    expect(result).not.toContain("missing");
  });
});

describe("findOrderedElement", () => {
  it("navigates the preserveOrder tree", () => {
    const parser = createOrderPreservingParser();
    const xml = "<Root><Body><Section>hello</Section></Body></Root>";
    const parsed = parser.parse(xml);
    const result = findOrderedElement(parsed, "Root", "Body");
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it("returns null for missing path", () => {
    const parser = createOrderPreservingParser();
    const xml = "<Root><Body>content</Body></Root>";
    const parsed = parser.parse(xml);
    const result = findOrderedElement(parsed, "Root", "Missing");
    expect(result).toBeNull();
  });
});

describe("renderOrderedBody", () => {
  it("preserves document order of headings and sections", () => {
    const parser = createOrderPreservingParser();
    const xml = [
      "<Body>",
      '  <Heading level="1"><TitleText>First</TitleText></Heading>',
      "  <Section><Label>1</Label><Text>Section one</Text></Section>",
      '  <Heading level="1"><TitleText>Second</TitleText></Heading>',
      "  <Section><Label>2</Label><Text>Section two</Text></Section>",
      "</Body>",
    ].join("");
    const parsed = parser.parse(xml);
    const body = findOrderedElement(parsed, "Body");
    expect(body).not.toBeNull();

    const result = renderOrderedBody(body!);
    const firstIdx = result.indexOf("First");
    const sec1Idx = result.indexOf("Section 1");
    const secondIdx = result.indexOf("Second");
    const sec2Idx = result.indexOf("Section 2");

    expect(firstIdx).toBeLessThan(sec1Idx);
    expect(sec1Idx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(sec2Idx);
  });
});
