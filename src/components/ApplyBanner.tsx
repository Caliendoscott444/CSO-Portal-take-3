const APPLICATIONS_URL = 'https://discord.com/channels/1462468082931990551/1462504644285698273';

export default function ApplyBanner() {
  return (
    <a
      href={APPLICATIONS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-full bg-amber-800 py-2 text-center text-sm font-bold text-white hover:bg-amber-700"
    >
      Apply Here →
    </a>
  );
}
