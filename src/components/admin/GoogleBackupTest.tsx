import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { testGoogleBackup } from "@/lib/ai-backup.functions";
import { Button } from "@/components/ui/button";

/** Checks the saved Google key without waiting for the built-in AI to fail. */
export function GoogleBackupTest() {
  const test$ = useServerFn(testGoogleBackup);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    try { setResult(await test$()); }
    catch (error) { setResult({ ok: false, message: error instanceof Error ? error.message : "Test failed" }); }
    finally { setBusy(false); }
  };
  return (
    <div className="max-w-3xl space-y-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void run()}>{busy ? "Testing…" : "Test Google key"}</Button>
      {result && <p role="status" className={`text-sm ${result.ok ? "text-emerald-500" : "text-destructive"}`}>{result.message}</p>}
    </div>
  );
}
