/**
 * Convert the markdown an assistant message is rendered from into the plain
 * text it renders as, so copying a bubble pastes cleanly into Word, Excel or
 * an email client instead of showing `**bold**` and pipe tables.
 *
 * Rules mirror what the reader actually sees:
 * - headings, emphasis, inline code and link/image syntax are dropped, the
 *   visible text is kept (a link keeps its label, not its URL)
 * - fenced code blocks keep their contents verbatim, only the fences go
 * - table rows become tab-separated cells, which paste into a spreadsheet as
 *   real columns
 */
export function markdownToPlainText(markdown: string): string {
  if (!markdown) return "";

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  let fenceChar = "";

  for (const line of lines) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);

    if (fence) {
      const char = fence[1][0];

      if (!fenceChar) {
        fenceChar = char;
        continue;
      }

      if (char === fenceChar) {
        fenceChar = "";
        continue;
      }
    }

    // Inside a code block nothing is markdown - keep the line untouched.
    if (fenceChar) {
      out.push(line);
      continue;
    }

    if (isTableSeparator(line)) continue;

    if (isTableRow(line)) {
      out.push(tableRowToText(line));
      continue;
    }

    // Horizontal rule - renders as a divider, not as text.
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      out.push("");
      continue;
    }

    let text = line;

    text = text.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/\s+#+\s*$/, "");
    text = text.replace(/^\s*>\s?/, "");
    text = text.replace(/^(\s*)[-*+]\s+/, "$1- ");

    out.push(stripInline(text));
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripInline(text: string): string {
  // Backslash escapes and inline code render as their literal contents, so
  // park them behind placeholders before touching emphasis and link syntax.
  const literals: string[] = [];

  const park = (value: string) => {
    literals.push(value);
    return `\u0000${literals.length - 1}\u0000`;
  };

  const stripped = text
    .replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (_match, char: string) =>
      park(char),
    )
    .replace(/(`+)([^`]+)\1/g, (_match, _ticks, code: string) => park(code))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, "$1")
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
    .replace(/\*(?=\S)([^*]+?)\*/g, "$1")
    // Underscore emphasis only outside words, so snake_case survives.
    .replace(/(^|[^A-Za-z0-9_])_(?=\S)([^_]+?)_(?![A-Za-z0-9_])/g, "$1$2");

  return stripped.replace(
    /\u0000(\d+)\u0000/g,
    (_match, index: string) => literals[Number(index)],
  );
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.length > 1;
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("|") &&
    trimmed.includes("-") &&
    /^[|\s:-]+$/.test(trimmed)
  );
}

function tableRowToText(line: string): string {
  const trimmed = line.trim();

  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => stripInline(cell.trim()));

  return cells.join("\t");
}
