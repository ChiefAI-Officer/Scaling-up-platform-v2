import {
  insertRichTextLink,
  wrapRichTextSelection,
} from "@/lib/rich-text-formatting";

describe("rich text formatting helpers", () => {
  it("wraps selected text with markdown markers", () => {
    const result = wrapRichTextSelection(
      {
        value: "hello world",
        selectionStart: 6,
        selectionEnd: 11,
      },
      "**",
      "**",
      "bold text"
    );

    expect(result.value).toBe("hello **world**");
  });

  it("uses placeholder text when no selection exists", () => {
    const result = wrapRichTextSelection(
      {
        value: "",
        selectionStart: 0,
        selectionEnd: 0,
      },
      "*",
      "*",
      "italic text"
    );

    expect(result.value).toBe("*italic text*");
  });

  it("inserts markdown links around selected text", () => {
    const result = insertRichTextLink(
      {
        value: "share details",
        selectionStart: 6,
        selectionEnd: 13,
      },
      "https://example.com"
    );

    expect(result.value).toBe("share [details](https://example.com)");
  });
});
