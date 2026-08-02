import Hero from '../components/Hero';
import RecruitmentBanner from '../components/RecruitmentBanner';
import JoinCTA from '../components/JoinCTA';
import Reveal from '../components/Reveal';

export default function HomePage() {
  return (
    <>
      <Hero />
      <RecruitmentBanner />
      <Reveal>
        <JoinCTA />
      </Reveal>
    </>
  );
}
