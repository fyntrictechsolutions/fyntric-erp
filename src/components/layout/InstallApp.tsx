"use client";

import { Download, Share, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/** Chrome/Edge/Samsung Internet's install event (not in the TypeScript DOM types yet). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
  // Register the service worker that makes the app installable (it caches nothing).
  if ("serviceWorker" in navigator && window.isSecureContext && process.env.NODE_ENV === "production") {
    const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    // This code often loads after the page's load event (the menu appears after sign-in).
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);
  }
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * "Install app" at the bottom of the menu. Android and desktop Chrome/Edge show their own install prompt;
 * on iPhone and iPad (which have no prompt) it explains Share → Add to Home Screen. Hidden once installed.
 */
export function InstallApp() {
  const [state, setState] = useState<{ canPrompt: boolean; ios: boolean; installed: boolean } | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const update = () => setState({ canPrompt: Boolean(deferred), ios: isIos(), installed: isStandalone() });
    update();
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);

  if (!state || state.installed || (!state.canPrompt && !state.ios)) return null;

  const install = async () => {
    if (!deferred) return setHelp(true);
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    deferred = null;
    listeners.forEach((l) => l());
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void install()}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
      >
        <Download className="size-[18px]" aria-hidden /> Install app
      </button>
      <Modal open={help} title="Install on your iPhone" onClose={() => setHelp(false)} footer={<Button onClick={() => setHelp(false)}>Got it</Button>}>
        <ol className="space-y-3 text-sm text-body">
          <li className="flex gap-3">
            <span className="font-semibold text-foreground">1.</span>
            <span>
              Open this page in <strong>Safari</strong>, then tap the <Share className="inline size-4 align-text-bottom" aria-label="Share" /> Share button.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-foreground">2.</span>
            <span>
              Scroll down and tap <strong>Add to Home Screen</strong> <SquarePlus className="inline size-4 align-text-bottom" aria-hidden />.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-foreground">3.</span>
            <span>Tap <strong>Add</strong>. Fyntric ERP now opens from its own icon, without the browser bar.</span>
          </li>
        </ol>
      </Modal>
    </>
  );
}
