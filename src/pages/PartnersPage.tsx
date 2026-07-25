import PageHero from '../components/PageHero';
import Businesses from '../components/Businesses';

export default function PartnersPage() {
  return (
    <>
      <PageHero
        theme="partners"
        eyebrow="Business Partners"
        title="Partners"
        subtitle="Organizations CSO works alongside, sharing our standards of professionalism, reliability, and tactical capability."
        tags={['Strategic Alliances', 'Shared Standards', 'Open Network']}
      />
      <Businesses />
    </>
  );
}
