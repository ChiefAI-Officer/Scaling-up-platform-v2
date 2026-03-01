/**
 * Determines if a nav link href matches the current pathname.
 *
 * Rules:
 * - Exact match always wins
 * - For non-exact: pathname starts with href + "/" (nested routes)
 * - The "/" guard prevents "/bio" matching "/biotech"
 */
export function isNavLinkActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}
