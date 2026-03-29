import { describe, expect, it } from "bun:test";
import {
  safeBranchName,
  safeFilePath,
  sanitizeForGit,
  sanitizeGitAuthor,
  validateBillNumber,
} from "../src/validation.js";

describe("validateBillNumber", () => {
  it("accepts valid House bill numbers", () => {
    expect(validateBillNumber("C-11")).toBe("C-11");
    expect(validateBillNumber("C-1")).toBe("C-1");
    expect(validateBillNumber("C-999")).toBe("C-999");
  });

  it("accepts valid Senate bill numbers", () => {
    expect(validateBillNumber("S-4")).toBe("S-4");
    expect(validateBillNumber("S-210")).toBe("S-210");
  });

  it("trims whitespace", () => {
    expect(validateBillNumber(" C-11 ")).toBe("C-11");
  });

  it("rejects path traversal attempts", () => {
    expect(() => validateBillNumber("../../../etc")).toThrow("Invalid bill number");
  });

  it("rejects numbers with newlines", () => {
    expect(() => validateBillNumber("C-1\n--no-verify")).toThrow("Invalid bill number");
  });

  it("rejects empty strings", () => {
    expect(() => validateBillNumber("")).toThrow("Invalid bill number");
  });

  it("rejects arbitrary strings", () => {
    expect(() => validateBillNumber("not-a-bill")).toThrow("Invalid bill number");
  });
});

describe("sanitizeForGit", () => {
  it("strips control characters", () => {
    expect(sanitizeForGit("hello\nworld")).toBe("helloworld");
    expect(sanitizeForGit("test\x00value")).toBe("testvalue");
  });

  it("escapes double quotes", () => {
    expect(sanitizeForGit('say "hello"')).toBe('say \\"hello\\"');
  });

  it("trims whitespace", () => {
    expect(sanitizeForGit("  hello  ")).toBe("hello");
  });

  it("passes through clean strings", () => {
    expect(sanitizeForGit("Online Streaming Act")).toBe("Online Streaming Act");
  });
});

describe("sanitizeGitAuthor", () => {
  it("builds a safe author string", () => {
    expect(sanitizeGitAuthor("Pablo Rodriguez", "pablo.rodriguez@parl.gc.ca"))
      .toBe("Pablo Rodriguez <pablo.rodriguez@parl.gc.ca>");
  });

  it("strips invalid chars from email", () => {
    expect(sanitizeGitAuthor("Test", "test\n@evil.com")).toBe("Test <test@evil.com>");
  });
});

describe("safeBranchName", () => {
  it("creates branch name from valid bill number", () => {
    expect(safeBranchName("C-11")).toBe("bill/C-11");
  });

  it("rejects invalid bill numbers", () => {
    expect(() => safeBranchName("../../main")).toThrow("Invalid bill number");
  });
});

describe("safeFilePath", () => {
  it("creates a safe file path", () => {
    expect(safeFilePath("bills", "c-11")).toBe("bills/c-11.md");
  });

  it("strips unsafe characters from filename", () => {
    expect(safeFilePath("bills", "c-11")).toBe("bills/c-11.md");
  });

  it("rejects empty slugs", () => {
    expect(() => safeFilePath("bills", "")).toThrow("Invalid filename");
  });

  it("strips path traversal characters from filename", () => {
    // "../" chars get stripped, leaving "etc" which is safe
    expect(safeFilePath("bills", "../../etc")).toBe("bills/etc.md");
  });
});
