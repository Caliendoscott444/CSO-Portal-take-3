import { Target, ShieldCheck, Users, Zap, ArrowRight } from 'lucide-react';
import { DISCORD_URL, ORG_ABBR } from '../data';
import { DiscordIcon } from './Navbar';
import { SectionHeader } from './Departments';

const pillars = [
  {
    icon: Target,
    title: 'Armed Protection',
    body: 'We provide armed escort and close-protection services for VIPs and high-ranking personnel inside partnered Roblox ERLC servers.',
  },
  {
    icon: ShieldCheck,
    title: 'Professional Standards',
    body: 'CSO is built on professionalism and organization. Every member is trained, every operation is planned, and every interaction reflects our corporate values.',
  },
  {
    icon: Zap,
    title: 'Military Combat Training',
    body: 'We conduct regular military-style combat training exercises to ensure our personnel are ready for every scenario — defensive, offensive, and reconnaissance.',
  },
  {
    icon: Users,
    title: 'Partnered Operations',
    body: 'We partner with servers and organizations to embed our protection capabilities directly into their communities and operations.',
  },
];

export default function About() {
  return (
    <section id="about" className="relative py-24 lg:py-32 border-t border-zinc-900/80">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <SectionHeader
          eyebrow="About CSO"
          title="What we do, and who we are"
          subtitle={`The Comet Strategic Operations Corporation is a Professional and Organized group designed for protecting Partnered Servers' high-ranking personnel inside of roleplay, Military Combat Training, Armed Protection, and more. We ensure the safety of VIPs and all personnel under our protection.`}
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 transition-colors hover:border-zinc-700 hover:bg-zinc-900/70"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30">
                <p.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-bold text-white">
                {p.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {p.body}
              </p>
            </div>
          ))}
        </div>

        <div className="relative mt-16 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8 lg:p-12">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-600/15 blur-3xl" />
          <div className="absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-amber-800/10 blur-3xl" />
          <div className="relative flex flex-col items-center gap-3 text-center">
            <img
              src="/CSO_CORPORATION_LOGO_1-2.png"
              alt={`${ORG_ABBR} Logo`}
              className="h-20 w-20 object-contain brightness-0 invert opacity-80"
            />
            <h3 className="text-2xl font-black text-white sm:text-3xl text-balance max-w-xl">
              Ready to join Comet Strategic Operations?
            </h3>
            <p className="mt-1 text-base leading-relaxed text-zinc-300 max-w-lg">
              Join our Discord to apply for a division, attend combat training, and
              start your career in one of Roblox ERLC's most professional corps.
            </p>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 group inline-flex items-center gap-2.5 rounded-xl bg-[#5865F2] px-7 py-4 text-base font-semibold text-white shadow-xl shadow-indigo-600/30 transition-all hover:bg-[#4752c4] hover:-translate-y-0.5"
            >
              <DiscordIcon className="h-5 w-5" />
              Join Our Discord
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
