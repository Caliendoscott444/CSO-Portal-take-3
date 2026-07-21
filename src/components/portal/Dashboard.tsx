import { useEffect, useState } from 'react';
import {
  User,
  Radio,
  CalendarClock,
  Bell,
  Users,
  Building2,
  FileText,
  Star,
  BookOpen,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase, DisciplineRecord } from '../../lib/supabaseClient';
import { StatCard, ToolCard, SectionHeading } from './cards';

function isoWeekKey(d: Date): string {
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const WEEKLY_REQUIREMENT_MINUTES = 60;

export default function Dashboard() {
  const { profile } = useAuth();
  const [creditedMinutes, setCreditedMinutes] = useState(0);
  const [records, setRecords] = useState<DisciplineRecord[]>([]);

  useEffect(() => {
    if (!profile) return;
    const weekKey = isoWeekKey(new Date());

    supabase
      .from('weekly_credit_v')
      .select('credited_minutes')
      .eq('user_id', profile.id)
      .eq('week_key', weekKey)
      .maybeSingle()
      .then(({ data }) => setCreditedMinutes(data?.credited_minutes ?? 0));

    supabase
      .from('discipline_records')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setRecords(data ?? []));
  }, [profile]);

  if (!profile) return null;

  const weekKey = isoWeekKey(new Date());

  return (
    <div>
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/40 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-400">
          CSO Portal
        </p>
        <h1 className="mt-1 text-3xl font-black text-white">
          Welcome, {profile.discord_username ?? 'Member'}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          <span className="font-semibold text-zinc-300">{profile.access_level}</span> access
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Weekly Credited"
          value={formatMinutes(creditedMinutes)}
          caption={`${weekKey} · Requirement ${formatMinutes(WEEKLY_REQUIREMENT_MINUTES)}`}
        />
        <StatCard
          label="Discipline"
          value={`${profile.warnings}W · ${profile.strikes}S`}
          caption={profile.strikes > 0 ? 'Active strikes on record' : 'No active suspensions'}
        />
        <StatCard
          label="Current Assignment"
          value={profile.current_assignment ?? 'Not confirmed'}
          caption="Synced from your active shift."
        />
        <StatCard
          label="LOA"
          value={profile.loa_status === 'active' ? 'Active' : 'Clear'}
          caption={profile.loa_reason ?? 'No active LOA on record.'}
        />
      </div>

      <SectionHeading kicker="Member Tools" title="Your workspace" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ToolCard
          to="/portal/profile"
          icon={<User className="h-4.5 w-4.5" />}
          eyebrow="Profile"
          title="My Profile"
          description="View your callsign, department record, LOA status, discipline summary, and recent activity."
        />
        <ToolCard
          to="/portal/shifts"
          icon={<Radio className="h-4.5 w-4.5" />}
          eyebrow="Shifts"
          title="Start Shift"
          description="Open the labeled Shift Selection page to start an eligible patrol, subdivision, K9, STORM, or administrative shift."
        />
        <ToolCard
          to="/portal/loa"
          icon={<CalendarClock className="h-4.5 w-4.5" />}
          eyebrow="Leave"
          title="Leave of Absence"
          description="Submit or review your LOA requests."
        />
        <ToolCard
          to="/portal/notifications"
          icon={<Bell className="h-4.5 w-4.5" />}
          eyebrow="Updates"
          title="Notifications"
          description="View department updates, LOA notices, application decisions, and staff alerts."
        />
      </div>

      <SectionHeading kicker="Department Resources" title="Explore CSO" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ToolCard
          to="/portal/roster"
          icon={<Users className="h-4.5 w-4.5" />}
          eyebrow="Roster"
          title="Live Roster"
          description="Search current members, profile cards, LOA status, contributors, and department badges."
        />
        <ToolCard
          to="/portal/subdivisions"
          icon={<Building2 className="h-4.5 w-4.5" />}
          eyebrow="Departments"
          title="Subdivisions"
          description="View CVE, MSPR, SRT, CID, OPS, FTO, STORM, Review Committee, and more."
        />
        <ToolCard
          to="/portal/applications"
          icon={<FileText className="h-4.5 w-4.5" />}
          eyebrow="Recruitment"
          title="Applications"
          description="Apply for CSO, review application status, and access active recruitment information."
        />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        <ToolCard
          href="/exam"
          icon={<Star className="h-4.5 w-4.5" />}
          eyebrow="Promotion"
          title="Sergeant Exam"
          description="Open the website-based Sergeant Promotional Exam after Department Administration grants access through /exam."
          highlight
        />
        <ToolCard
          to="/portal/ranks"
          icon={<Star className="h-4.5 w-4.5" />}
          eyebrow="Structure"
          title="Ranks"
          description="Review the chain of command, rank expectations, and progression through CSO."
        />
        <ToolCard
          to="/portal/media"
          icon={<ImageIcon className="h-4.5 w-4.5" />}
          eyebrow="Media"
          title="Pictures"
          description="View featured photos, official media, gallery rotations, and approved submissions."
        />
        <ToolCard
          href="https://cso-sop.gitbook.io"
          icon={<BookOpen className="h-4.5 w-4.5" />}
          eyebrow="Policy"
          title="Standard Operating Procedures"
          description="Open the official CSO SOP GitBook covering department policies, expectations, patrol procedures, and operating standards."
        />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-400">
            Department History
          </p>
          <p className="mb-4 text-lg font-bold text-white">Recent Activity</p>
          <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
            {records.length === 0 && (
              <p className="px-5 py-6 text-sm text-zinc-500">No recent activity on record.</p>
            )}
            {records.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-bold capitalize text-white">{r.type}</p>
                  <p className="text-sm text-zinc-400">{r.reason}</p>
                </div>
                <p className="text-xs text-zinc-500">
                  {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-400">
            Quick Status
          </p>
          <p className="mb-4 text-lg font-bold text-white">Current Record</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Callsign
              </p>
              <p className="mt-1 text-lg font-bold text-white">
                {profile.callsign ?? 'Not assigned'}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Access
              </p>
              <p className="mt-1 text-lg font-bold capitalize text-white">
                {profile.access_level}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Warnings
              </p>
              <p className="mt-1 text-lg font-bold text-white">{profile.warnings}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                Strikes
              </p>
              <p className="mt-1 text-lg font-bold text-white">{profile.strikes}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
