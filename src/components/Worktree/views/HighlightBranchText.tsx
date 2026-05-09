export function HighlightBranchText({
  text,
  matchRanges,
  nameLength,
}: {
  text: string;
  matchRanges: { start: number; end: number }[];
  nameLength: number;
}) {
  if (matchRanges.length === 0) return <>{text}</>;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (let i = 0; i < matchRanges.length; i++) {
    const { start, end } = matchRanges[i]!;
    if (start >= nameLength) break;
    const clampedEnd = Math.min(end, nameLength - 1);
    if (start > lastIndex) {
      nodes.push(text.substring(lastIndex, start));
    }
    nodes.push(
      <mark key={i} className="bg-daintree-accent/25 text-inherit rounded-sm">
        {text.substring(start, clampedEnd + 1)}
      </mark>
    );
    lastIndex = clampedEnd + 1;
  }

  if (lastIndex < text.length) {
    nodes.push(text.substring(lastIndex));
  }

  return <>{nodes}</>;
}
