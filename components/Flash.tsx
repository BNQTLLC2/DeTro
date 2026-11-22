export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (error) {
    return (
      <p role="alert" className="mb-3 rounded-xl bg-bad-bg p-3 text-sm font-medium text-bad">
        {error}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="mb-3 rounded-xl bg-ok-bg p-3 text-sm font-medium text-ok">
        {ok}
      </p>
    );
  }
  return null;
}
