import PageHero from '../components/PageHero';
import Departments from '../components/Departments';

export default function DivisionsPage() {
  return (
    <>
      <PageHero
        theme="ops"
        eyebrow="Specialized Operations"
        title="Divisions"
        subtitle="The Comet Strategic Operations Corporation operates through three elite divisions, each with distinct capabilities and specialized units. Select a division to see its responsibilities and units."
      />
      <section className="relative py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Departments />
        </div>
      </section>
    </>
  );
}
