import Link from "next/link";
import { AlertTriangle, Clock, User } from "lucide-react";

interface Props {
  profileComplete: boolean;
  consoleEnabled: boolean;
  profileHref: string;
}

export function ConsoleStatusBanners({ profileComplete, consoleEnabled, profileHref }: Props) {
  return (
    <div className="mb-4 space-y-2">
      {!profileComplete ? (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-100">Complete your console profile</p>
            <p className="mt-0.5 text-xs text-amber-100/75">
              Same login as dcselite.com — add your name and phone here for the data console only. This
              is not the main vendor dashboard wallet.
            </p>
          </div>
          <Link href={profileHref} className="susu-btn-gold inline-flex items-center gap-1.5 text-xs">
            <User className="h-3.5 w-3.5" />
            Console profile
          </Link>
        </div>
      ) : null}

      {!consoleEnabled ? (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-sky-100">Awaiting console data credit</p>
            <p className="mt-0.5 text-xs text-sky-100/75">
              Admin allocates GB from Admin → Data Consoles. That balance is separate from GHS wallet
              top-ups on the vendor dashboard.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
