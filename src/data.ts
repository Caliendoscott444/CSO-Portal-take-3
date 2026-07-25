export const DISCORD_URL = 'https://discord.gg/ZwHYjesC';

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
      'Protect the ground with the ground units in Recon',
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
    name: 'Family Jewels',
    type: 'Business inside of CSO',
    description:
      "River City's premier jewelry business, offering a professional retail and security-focused roleplay experience. Partnered with CSO Security, Family Jewels combines realistic business operations with an active, welcoming community — offering opportunities in sales, security, and leadership. \"Where professionalism meets priceless roleplay.\"",
    icon: 'Gem',
  },
];

export type Stat = { value: string; label: string };

export const stats: Stat[] = [
  { value: '3', label: 'Divisions' },
  { value: '3', label: 'Specialized Units' },
  { value: '3', label: 'Commanders' },
  { value: '22+', label: 'Active Personnel' },
];

// ---------------------------------------------------------------------------
// Personnel roster — shown on the public "Personnel" page (/personnel).
// This is a manually-maintained list, separate from the private member
// portal roster. Add/update entries here as personnel join, rank up, or
// leave. Division must match one of: 'CSO Command', 'Operations Division',
// 'Support & Logistics Division', 'Capital Division'.
// ---------------------------------------------------------------------------
export type PersonnelStatus = 'Active' | 'Leave of Absence' | 'Inactive';

export type PersonnelMember = {
  callsign: string;
  name: string;
  rank: string;
  division: string;
  status: PersonnelStatus;
};

export const personnelDivisions = [
  'All divisions',
  'CSO Command',
  'Operations Division',
  'Support & Logistics Division',
  'Capital Division',
] as const;

export const personnelRoster: PersonnelMember[] = [
  {
    callsign: 'GCR-01',
    name: 'A_BlueCrow126',
    rank: 'Grand Commander',
    division: 'CSO Command',
    status: 'Active',
  },
  {
    callsign: 'COD-01',
    name: 'orcaumschlag12',
    rank: 'Operations Commander',
    division: 'Operations Division',
    status: 'Active',
  },
  {
    callsign: 'CCD-01',
    name: 'yKWelTRcxOl',
    rank: 'Capital Commander',
    division: 'Capital Division',
    status: 'Active',
  },
];

export type PhotoCategory =
  | 'Patrol'
  | 'Community'
  | 'Subdivisions'
  | 'Recruitment'
  | 'Official Media';

export type Photo = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  category: PhotoCategory;
  location?: string;
  date?: string;
  photographer?: string;
  featured?: boolean;
};

export const photoCategories: PhotoCategory[] = [
  'Patrol',
  'Community',
  'Subdivisions',
  'Recruitment',
  'Official Media',
];

// No photos yet — add entries here (or wire this up to Supabase) as they come in.
export const photos: Photo[] = [];
