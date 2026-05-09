export function getInitials(name: string): string {
  if (!name) return "??";
  const tokens = name.trim().split(/\s+/);
  if (tokens.length === 1) return tokens[0]!.slice(0, 2).toUpperCase();
  return (tokens[0]![0] + tokens[tokens.length - 1]![0]).toUpperCase();
}
