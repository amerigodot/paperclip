import { cn } from "../lib/utils";

interface OmnIALogoIconProps {
  className?: string;
}

export function OmnIALogoIcon({ className }: OmnIALogoIconProps) {
  return (
    <>
      <img
        src="/brands/omnia-logo-dark.svg"
        alt="OmnIA"
        className={cn("dark:hidden", className)}
      />
      <img
        src="/brands/omnia-logo-light.svg"
        alt="OmnIA"
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}
