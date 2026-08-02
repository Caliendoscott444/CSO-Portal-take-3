import ApplicationsHero from '../components/ApplicationsHero';
import ApplicationsStats from '../components/ApplicationsStats';
import ApplicationsJoinPaths from '../components/ApplicationsJoinPaths';
import ApplicationsQuiz from '../components/ApplicationsQuiz';
import ApplicationsPrepQuiz from '../components/ApplicationsPrepQuiz';
import HowToJoin from '../components/HowToJoin';

export default function ApplicationsPage() {
  return (
    <>
      <ApplicationsHero />
      <ApplicationsStats />
      <ApplicationsJoinPaths />
      <ApplicationsQuiz />
      <ApplicationsPrepQuiz />
      <HowToJoin />
    </>
  );
}
