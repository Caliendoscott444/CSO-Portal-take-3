import PageHero from '../components/PageHero';
import About from '../components/About';

export default function AboutPage() {
  return (
    <>
      <PageHero
        theme="about"
        eyebrow="About CSO"
        title="About"
        subtitle="Who we are, what we do, and the standards every member is held to."
        tags={['Est. Standards', 'Professional Corps', 'ERLC Roleplay']}
      />
      <About />
    </>
  );
}
