export const DISCORD_URL = 'https://discord.gg/98yGAUma';

export const ORG_NAME = 'Comet Strategic Operations Corporation';
export const ORG_SHORT = 'C.O.M.E.T.';
export const ORG_ABBR = 'CSO';

export type Division = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  responsibilities: string[];
  accent: string;
  icon: string;
  units: { name: string; description: string }[];
};

export const divisions: Division[] = [
  {
    id: 'operations',
    name: 'Operations Division',
    shortName: 'OPS',
    description:
      'The strategic backbone of CSO. The Operations Division is responsible for orchestrating mass events, maintaining organizational discipline, and directing high-level disciplinary action against senior officials and STAFF.',
    responsibilities: [
      'Mass event planning & execution',
      'Disciplinary action — high-ranking officials & STAFF',
      'High-command oversight',
      'Cross-division coordination',
    ],
    accent: 'amber',
    icon: 'Crosshair',
    units: [],
  },
  {
    id: 'support',
    name: 'Support & Logistics Division',
    shortName: 'S&L',
    description:
      'The operational backbone that keeps every CSO mission running smoothly. Support & Logistics handles strategic development, task force personnel placement, rapid engagement training, and the discipline needed to execute safe and efficient convoys.',
    responsibilities: [
      'Strategic development & planning',
      'Task Force personnel coordination',
      'Fast Engagement Trainings',
      'Convoy discipline & execution',
    ],
    accent: 'emerald',
    icon: 'Package',
    units: [
      {
        name: 'C.O.M.E.T. Task Force',
        description:
          'Actions speak louder than words. The C.O.M.E.T. Task Force is the elite hard-working element of CSO — trained for every possible situation and deployed when the mission demands the best. No task too complex, no environment too hostile.',
      },
    ],
  },
  {
    id: 'capital',
    name: 'Capital Division',
    shortName: 'CAP',
    description:
      'CSO\'s most specialized division. The Capital Division fields capabilities most organizations simply do not have — Aviation, Medical, Contracting, and Reconnaissance — making it the most versatile and sought-after arm of the corporation.',
    responsibilities: [
      
      'Contract acquisition & partnership',
      'Forward reconnaissance, surveillance',
      'Protect the ground with the ground units in Recon'
      
    ],
    accent: 'sky',
    icon: 'Radar',
    units: [
      {
        name: 'Contractor Unit',
        description:
          'CSO\'s business development arm. Contractor Unit personnel actively approach businesses and server departments, brokering partnership agreements and securing contracts that expand CSO\'s reach and revenue.',
      },
      {
        name: 'Reconnaissance Unit',
        description:
          'Eyes in the sky and boots on the ground. Recon operators provide aerial surveillance via drones, overwatch with sniper positions, and ground-level coverage using binoculars and M4A1s. Recon keeps convoy and security teams ahead of threats, while Ground operators seal exits to prevent escape. The unit deploys via Van and Bearcat for rapid, concealed insertion and extraction. Current active strength: Snipers.',
      },
    ],
  },
];

export type Commander = {
  name: string;
  rank: string;
  division: string;
  bio: string;
  initials: string;
  accent: string;
};

export const commanders: Commander[] = [
  {
    name: 'A_BlueCrow126',
    rank: 'Grand Commander',
    division: 'CSO Command',
    bio: 'Supreme authority of the Comet Strategic Operations Corporation. The Grand Commander sets organizational direction, approves strategic operations, and represents CSO at the highest level.',
    initials: 'GC',
    accent: 'gold',
  },
  {
    name: 'orcaumschlag12',
    rank: 'Operations Commander',
    division: 'Operations Division',
    bio: 'Directs the Operations Division and oversees all field operations, mass events, and disciplinary procedures against high-ranking officials and STAFF.',
    initials: 'OC',
    accent: 'orange',
  },
  {
    name: 'yKWelTRcxOl',
    rank: 'Capital Commander',
    division: 'Capital Division',
    bio: 'Commands the Capital Division and its specialized units — Contractor, Reconnaissance, Aviation, and Medical — ensuring CSO maintains capabilities no other organization can match.',
    initials: 'CC',
    accent: 'sky',
  },
];

export type Business = {
  name: string;
  type: string;
  description: string;
  icon: string;
};

export const businesses: Business[] = [
  {
    name: 'Saber',
    type: 'Business inside of CSO',
    description:
      'SABER is a department strictly based on tactical operations. Operations such as hostage rescue, and more. SABER works with LEO during scenes they cannot normally handle.',
    icon: 'Swords',
  },
];

export type Stat = { value: string; label: string };

export const stats: Stat[] = [
  { value: '3', label: 'Divisions' },
  { value: '3', label: 'Specialized Units' },
  { value: '3', label: 'Commanders' },
  { value: '22+', label: 'Active Personnel' },
];
