import { Shield, Handshake, Eye } from 'lucide-react';
import { SectionHeading } from './cards';

interface Unit {
  name: string;
  description: string;
  icon: React.ReactNode;
}

const UNITS: Unit[] = [
  {
    name: 'C.O.M.E.T. Task Force',
    description:
      "Actions speak louder then words. Hard working. Trained for every possible situation.",
    icon: <Shield className="h-5 w-5" />,
  },
  {
    name: 'Contractor Unit',
    description: 'Goes out and try\'s to get us contracts with businesses, and departments.',
    icon: <Handshake className="h-5 w-5" />,
  },
  {
    name: 'Reconnaissance Unit',
    description:
      'Recon and ground unit that helps keeps eyes in the air and ahead for those doing convoys or even just sitting at a security spot. You can use drones, snipers, binoculars, and M4A1. As the recon part you will be the eyes in the skies and the protection for the ground units. For the ground units you will assist CBU by staying outside and making sure no one is able to run away and get out safely. As this unit we will use the van, and the bearcat to get there safely and away safely. This unit will allow Capital Division to where it has more people joining!',
    icon: <Eye className="h-5 w-5" />,
  },
];

export default function Units() {
  return (
    <div>
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/40 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
          CSO Portal
        </p>
        <h1 className="mt-1 text-3xl font-black text-white">Units</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Specialized units within CSO and what each one does.
        </p>
      </div>

      <SectionHeading kicker="Department Structure" title="Current Units" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {UNITS.map((unit) => (
          <div
            key={unit.name}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400">
                {unit.icon}
              </div>
              <p className="text-lg font-bold text-white">{unit.name}</p>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              {unit.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
