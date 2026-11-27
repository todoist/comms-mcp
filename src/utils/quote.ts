const QUOTE_LIMIT = 80

/** A title or message short enough to quote in a question put to the user. */
export function quote(text: string): string {
    return text.length > QUOTE_LIMIT ? `${text.slice(0, QUOTE_LIMIT - 1)}…` : text
}
