/** "Ana is typing…" and friends. Announced politely, and empty when nobody is typing. */
export function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const who =
    names.length === 1
      ? `${names[0]} is typing…`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing…`
        : `${names.length} people are typing…`;
  return (
    <p role="status" aria-live="polite" className="text-muted-foreground px-1 text-xs">
      {who}
    </p>
  );
}
