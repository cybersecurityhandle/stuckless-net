import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface HubCardProps {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export function HubCard({ title, description, href, icon: Icon, comingSoon }: HubCardProps) {
  const content = (
    <Card className="group relative overflow-hidden transition-colors hover:border-emerald-500/50 hover:bg-card/80">
      {comingSoon && (
        <span className="absolute right-3 top-3 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          Coming Soon
        </span>
      )}
      <CardHeader>
        <Icon className="mb-2 h-8 w-8 text-emerald-500" />
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );

  if (comingSoon) {
    return <div className="cursor-default opacity-60">{content}</div>;
  }

  return <Link href={href}>{content}</Link>;
}
