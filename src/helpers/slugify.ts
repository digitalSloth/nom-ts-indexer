/**
 * Converts a name to a URL-friendly slug: lowercase, whitespace → hyphens.
 */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}
