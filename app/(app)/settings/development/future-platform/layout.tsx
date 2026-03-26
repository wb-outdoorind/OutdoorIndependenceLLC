import LabLayout from "@/components/development/LabLayout";
import {
  FuturePlatformLabProvider,
} from "@/components/development/FuturePlatformLabProvider";
import WilliamPlanningClientGuard from "@/components/development/WilliamPlanningClientGuard";

export default function FuturePlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WilliamPlanningClientGuard
      initialAllowed
      nextPath="/settings/development/future-platform"
    >
      <FuturePlatformLabProvider>
        <div style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 32 }}>
          <LabLayout>{children}</LabLayout>
        </div>
      </FuturePlatformLabProvider>
    </WilliamPlanningClientGuard>
  );
}
