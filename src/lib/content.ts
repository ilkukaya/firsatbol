/** Reading time for Turkish prose (~200 words per minute), minimum one minute. */
export function readingMinutes(markdown: string): number {
  const words = markdown
    .replace(/[#>*_`[\]()|-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
