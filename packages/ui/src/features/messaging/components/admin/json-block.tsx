export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  );
}
