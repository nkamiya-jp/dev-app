import { RoadmapTabs } from "./roadmap-tabs";

export default function RoadmapLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <RoadmapTabs />
    </>
  );
}
