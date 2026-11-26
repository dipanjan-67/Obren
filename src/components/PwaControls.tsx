import React, { useEffect, useState } from 'react';
import { Check, Download, RefreshCw, Share, WifiOff, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  const isIos =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;

  useEffect(() => {
    const checkStandalone = () => {
      const standaloneMatch = window.matchMedia?.('(display-mode: standalone)').matches;
      const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(Boolean(standaloneMatch || iosStandalone));
    };
    checkStandalone();

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isInstalled) {
    return (
      <span className="hidden xl:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
        <Check className="w-3 h-3" />
        <span>App Ready</span>
      </span>
    );
  }

  if (!deferredPrompt && !isIos) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      return;
    }
    if (isIos) {
      setShowIosGuide(true);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void handleInstall()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-950/50 cursor-pointer whitespace-nowrap"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Install App</span>
      </button>

      {showIosGuide && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-xl z-50 text-xs space-y-2">
          <div className="flex items-center justify-between font-bold">
            <span>Install OBREN on iOS</span>
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Tap <Share className="w-3.5 h-3.5 inline mx-0.5 text-indigo-500" /> Share in Safari and select{' '}
            <strong>&quot;Add to Home Screen&quot;</strong> for offline CBT &amp; formula access.
          </p>
        </div>
      )}
    </div>
  );
};

interface OfflineIndicatorProps {
  isOffline: boolean;
  queuedCount: number;
  syncing?: boolean;
  onSyncNow?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  isOffline,
  queuedCount,
  syncing = false,
  onSyncNow,
}) => {
  if (!isOffline && queuedCount === 0) return null;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        {isOffline
          ? queuedCount > 0
            ? `Offline · ${queuedCount} test(s) queued`
            : 'Offline Mode'
          : `${queuedCount} queued test(s) syncing`}
      </span>
      {!isOffline && queuedCount > 0 && onSyncNow && (
        <button
          type="button"
          disabled={syncing}
          onClick={onSyncNow}
          className="inline-flex items-center gap-1 underline hover:text-amber-950 dark:hover:text-white cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Syncing' : 'Sync'}</span>
        </button>
      )}
    </div>
  );
};
