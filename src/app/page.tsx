import { DemoLanding } from "@/components/demo-landing";

export default function Home() {
  const defaultAdminId = process.env.DEFAULT_ADMIN_ID?.trim() ?? "";
  const defaultBusinessName = process.env.DEFAULT_BUSINESS_NAME?.trim() ?? "SwiftSend";

  return (
    <DemoLanding
      defaultAdminId={defaultAdminId}
      defaultBusinessName={defaultBusinessName}
    />
  );
}
