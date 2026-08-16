import { Sidebar } from "@/components/crm/Sidebar";
import { requirePageSession } from "@/lib/auth/require-page-session";
import { getDriveRootFolderId } from "@/lib/google/auth";

export const dynamic = "force-dynamic";

export default async function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageSession();

  const driveRootId = getDriveRootFolderId();
  const driveUrl = driveRootId
    ? `https://drive.google.com/drive/folders/${driveRootId}`
    : "https://drive.google.com/drive/my-drive";

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar driveUrl={driveUrl} />
      <div className="crm-content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
