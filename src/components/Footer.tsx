import { DISCORD_URL, ORG_ABBR, ORG_NAME } from '../data';
import { DiscordIcon } from './Navbar';

export default function Footer() {
  return (
    <footer className="border-t border-zinc-900/80 bg-zinc-950">
      <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-3">
              <img
                src="/CSO_CORPORATION_LOGO_1-2.png"
                alt={`${ORG_ABBR} Logo`}
                className="h-10 w-10 object-contain brightness-0 invert opacity-80"
              />
              <div>
                <p className="text-sm font-bold text-white">{ORG_ABBR} Corporation</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                  Roblox · ERLC
                </p>
              </div>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-zinc-400">
              Professional armed protection, military combat training, and strategic operations for partnered ERLC servers.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
              Explore
            </h4>
            <ul className="mt-4 space-y-2 text-sm text-zinc-400">
              <li><a href="#divisions" className="hover:text-white transition-colors">Divisions</a></li>
              <li><a href="#command" className="hover:text-white transition-colors">Command Staff</a></li>
              <li><a href="#partners" className="hover:text-white transition-colors">Partners</a></li>
              <li><a href="#about" className="hover:text-white transition-colors">About Us</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">
              Community
            </h4>
            <p className="mt-4 text-sm text-zinc-400">
              Join our Discord to apply, train, and serve with CSO.
            </p>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
            >
              <DiscordIcon className="h-4 w-4" />
              Join Discord
            </a>
          </div>
        </div>

        <div className="mt-10 border-t border-zinc-900 pt-6 text-center text-xs text-zinc-500">
          <p>
            © {new Date().getFullYear()} {ORG_NAME}. Not affiliated with Roblox Corporation or the developers of Emergency Response: Liberty County.
          </p>
        </div>
      </div>
    </footer>
  );
}
