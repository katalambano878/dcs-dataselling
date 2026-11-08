import Link from "next/link";
import { MessageCircle, Mail, ShieldCheck, Lock } from "lucide-react";
import { SITE } from "@/lib/constants";
import { DcsLogo } from "@/components/brand/dcs-logo";

const FOOTER_LINKS = {
  Platform: [
    { href: "/create-store", label: "Sell on DCS" },
    { href: "/developers", label: "Developer Docs" },
    { href: "/account", label: "My Account" },
  ],
  Company: [
    { href: "/about", label: `About ${SITE.name}` },
    { href: "/trust", label: "Trust & Security" },
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
  ],
  Support: [
    { href: "/support", label: "Help Centre" },
    { href: "/status", label: "System Status" },
  ],
};

export function SiteFooter() {
  return (
    <footer
      className="relative overflow-hidden border-t border-white/5"
      style={{
        background: `
          radial-gradient(at 12% 0%, rgba(212, 175, 55, 0.08) 0px, transparent 50%),
          radial-gradient(at 90% 100%, rgba(10, 46, 93, 0.4) 0px, transparent 50%),
          linear-gradient(180deg, #081F3F 0%, #0A2E5D 100%)
        `,
      }}
    >
      {/* Top hairline gradient */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.4) 50%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <div className="grid gap-5 sm:gap-8 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-start">
              <div className="min-w-0">
                <Link href="/" className="inline-flex">
                  <DcsLogo size={32} className="sm:hidden" />
                  <DcsLogo size={40} className="hidden sm:block" />
                </Link>
                <p className="mt-2 hidden max-w-sm text-xs leading-relaxed text-slate-400 sm:mt-4 sm:block">
                  {SITE.description}
                </p>
              </div>
              <div className="flex shrink-0 gap-2 sm:mt-5">
                <a
                  href={`https://wa.me/${SITE.supportWhatsApp.replace(/\D/g, "")}`}
                  aria-label="WhatsApp support"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 transition-colors hover:bg-emerald-500/20 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs sm:font-semibold"
                >
                  <MessageCircle className="h-3.5 w-3.5 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">WhatsApp</span>
                </a>
                <a
                  href={`mailto:${SITE.supportEmail}`}
                  aria-label="Email support"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs sm:font-semibold"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Email</span>
                </a>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:contents sm:gap-0">
            {Object.entries(FOOTER_LINKS).map(([title, links]) => (
              <div key={title}>
                <h4 className="text-[9px] font-bold uppercase tracking-[0.14em] text-gold-glow sm:text-[10px] sm:tracking-[0.18em]">
                  {title}
                </h4>
                <ul className="mt-1.5 space-y-1 sm:mt-3 sm:space-y-2">
                  {links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-[10px] text-slate-400 transition-colors hover:text-white sm:text-xs"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Trust strip */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-white/5 pt-3 text-[8px] uppercase tracking-[0.12em] text-slate-500 sm:mt-10 sm:gap-x-5 sm:gap-y-2 sm:pt-6 sm:text-[10px] sm:tracking-[0.16em]">
          <span className="flex items-center gap-1 text-slate-400 sm:gap-1.5">
            <Lock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            256-bit TLS
          </span>
          <span className="hidden min-[360px]:inline">Paystack · Arkesel SMS</span>
          <span className="flex items-center gap-1 text-slate-400 sm:gap-1.5">
            <ShieldCheck className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            Verified
          </span>
          <span className="hidden sm:inline">PCI-DSS aligned</span>
        </div>

        <div className="mt-3 flex flex-col items-center justify-between gap-1 border-t border-white/5 pt-3 text-center sm:mt-6 sm:flex-row sm:gap-2 sm:pt-6 sm:text-left">
          <p className="text-[9px] text-slate-500 sm:text-[11px]">
            © {new Date().getFullYear()} {SITE.name}. All rights reserved.
          </p>
          <p className="text-[9px] text-slate-500 sm:text-[11px]">
            Powered by{" "}
            <a href="https://doctorbarns.com" target="_blank" rel="noopener" className="text-slate-500 hover:underline">
              Doctor Barns Tech
            </a>
          </p>
          <p className="flex items-center gap-1 text-[9px] text-slate-500 sm:text-[11px]">
            <span className="pulse-dot" />
            <span className="ml-1">Ghana 🇬🇭</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
