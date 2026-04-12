import { HubCard } from "@/components/hub-card";
import { Shield, TrendingUp, User, Code } from "lucide-react";

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mb-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Stuckless
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Cybersecurity &middot; Finance &middot; Technology
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <HubCard
          title="Threat Intel"
          description="Live CVE feed, vulnerability search, threat actor directory, and security analytics."
          href="/intel"
          icon={Shield}
        />
        <HubCard
          title="Finance"
          description="Market analysis, portfolio tracking, and financial intelligence."
          href="/finance"
          icon={TrendingUp}
          comingSoon
        />
        <HubCard
          title="About"
          description="Who I am, what I do, and how to get in touch."
          href="/about"
          icon={User}
          comingSoon
        />
        <HubCard
          title="GitHub"
          description="Open source projects, contributions, and code."
          href="https://github.com"
          icon={Code}
        />
      </div>
    </div>
  );
}
