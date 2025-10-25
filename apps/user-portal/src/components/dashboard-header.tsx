import Image from "next/image";
import { UserAvatarMenu } from "@/components/user-avatar-menu";

export function DashboardHeader() {
  return (
    <header className="border-b bg-background relative">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Image src="/crack-on-logo.png" alt="CrackOn" width={180} height={45} priority />
          </div>
          <div className="flex items-center space-x-4">
            <UserAvatarMenu />
          </div>
        </div>
      </div>
      {/* Orange accent line at bottom of header */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-brand opacity-80" />
    </header>
  );
}