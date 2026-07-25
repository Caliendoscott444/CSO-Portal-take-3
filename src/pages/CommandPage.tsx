import PageHero from '../components/PageHero';
import Command from '../components/Command';

export default function CommandPage() {
  return (
    <>
      <PageHero
        theme="command"
        eyebrow="Department Structure"
        title="Command Staff"
        subtitle="The chain of authority that directs every operation, enforces discipline, and sets the strategic direction of the corporation."
        tags={['3 Commanders', 'Chain of Authority', 'Discipline & Direction']}
      />
      <Command />
    </>
  );
}
