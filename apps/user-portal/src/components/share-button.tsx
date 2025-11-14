"use client";

import { Share2, Users } from "lucide-react";
import { Button } from "@imaginecalendar/ui/button";
import { cn } from "@imaginecalendar/ui/cn";

interface ShareButtonProps {
  onClick: () => void;
  isShared?: boolean;
  shareCount?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ShareButton({
  onClick,
  isShared = false,
  shareCount = 0,
  size = "md",
  className,
}: ShareButtonProps) {
  const sizeClasses = {
    sm: "h-7 w-7",
    md: "h-8 w-8",
    lg: "h-9 w-9",
  };

  const iconSizes = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-4.5 w-4.5",
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      className={cn(
        sizeClasses[size],
        isShared
          ? "text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          : "hover:text-blue-600 hover:bg-blue-50",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={isShared ? `Shared with ${shareCount} ${shareCount === 1 ? "person" : "people"}` : "Share"}
    >
      {isShared ? (
        <Users className={iconSizes[size]} />
      ) : (
        <Share2 className={iconSizes[size]} />
      )}
    </Button>
  );
}

