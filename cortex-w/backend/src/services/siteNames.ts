/**
 * How a site name is shown. The MySQL names are typed by hand, so one district comes as "BHUBANESWAR" and the next as
 * "Cuttack". A name written only in capital letters is shown in title case ("Bhubaneswar"); short words stay as they
 * are because they are acronyms ("DMA 1", "MAIN DMA ZONE" -> "Main DMA Zone"). A name that already has lower case letters,
 * or a digit, is left exactly as it was written.
 */
const ACRONYM_MAX_LETTERS = 3;

export function tidySiteName(name: string): string {
  const text = String(name ?? '').trim();
  if (!text || /[a-z]/.test(text) || /\d/.test(text) || !/[A-Z]{4}/.test(text)) return text;
  return text.replace(/[A-Z]+/g, (word) =>
    word.length <= ACRONYM_MAX_LETTERS ? word : word[0] + word.slice(1).toLowerCase()
  );
}
