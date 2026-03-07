export interface RichTextEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

interface SelectionInput {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  maxLength?: number;
}

function limitValue(value: string, maxLength?: number): string {
  return typeof maxLength === "number" ? value.slice(0, maxLength) : value;
}

export function wrapRichTextSelection(
  input: SelectionInput,
  prefix: string,
  suffix: string,
  placeholder = ""
): RichTextEditResult {
  const start = Math.max(0, input.selectionStart);
  const end = Math.max(start, input.selectionEnd);
  const selected = input.value.slice(start, end) || placeholder;
  const nextValue = limitValue(
    input.value.slice(0, start) + prefix + selected + suffix + input.value.slice(end),
    input.maxLength
  );
  const selectionOffset = prefix.length;

  return {
    value: nextValue,
    selectionStart: Math.min(nextValue.length, start + selectionOffset),
    selectionEnd: Math.min(nextValue.length, start + selectionOffset + selected.length),
  };
}

export function insertRichTextLink(
  input: SelectionInput,
  url: string,
  placeholder = "link text"
): RichTextEditResult {
  const start = Math.max(0, input.selectionStart);
  const end = Math.max(start, input.selectionEnd);
  const label = input.value.slice(start, end) || placeholder;
  const linkText = `[${label}](${url})`;
  const nextValue = limitValue(
    input.value.slice(0, start) + linkText + input.value.slice(end),
    input.maxLength
  );

  return {
    value: nextValue,
    selectionStart: Math.min(nextValue.length, start + 1),
    selectionEnd: Math.min(nextValue.length, start + 1 + label.length),
  };
}
