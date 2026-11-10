"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const KEY = "nexus.preferences";

export interface Preferences {
  speakReplies: boolean;
  reduceMotion: boolean;
}

/** Device-local preferences (this browser only). */
export function PreferencesPanel({ allowReset }: { allowReset: boolean }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Preferences>({ speakReplies: true, reduceMotion: false });
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setPrefs({ ...prefs, ...JSON.parse(raw) });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(p: Partial<Preferences>) {
    const next = { ...prefs, ...p };
    setPrefs(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    toast.success("Preference saved on this device");
  }

  async function reset() {
    if (!confirm("Reset all demo data? This clears negotiations, orders and merchant changes on this server.")) return;
    setResetting(true);
    await fetch("/api/dev/reset", { method: "POST" });
    setResetting(false);
    toast.success("Demo data reset");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="surface divide-y">
        <Row title="Speak buyer-agent replies" body="In voice mode, read replies aloud. You can mute at any time.">
          <Switch checked={prefs.speakReplies} onCheckedChange={(v) => update({ speakReplies: v })} aria-label="Speak buyer agent replies" />
        </Row>
        <Row title="Reduce motion" body="Nexus already follows your system's reduced-motion setting.">
          <Switch checked={prefs.reduceMotion} onCheckedChange={(v) => update({ reduceMotion: v })} aria-label="Reduce motion" />
        </Row>
      </section>
      {allowReset && (
        <section className="surface flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-medium">Reset demo data</p>
            <p className="text-xs text-muted-foreground">Development only. Clears negotiations, orders, ledger and merchant configuration.</p>
          </div>
          <Button variant="outline" onClick={reset} disabled={resetting}>
            {resetting && <Loader2Icon className="animate-spin" />} Reset
          </Button>
        </section>
      )}
    </div>
  );
}

function Row({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 p-5">
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}
