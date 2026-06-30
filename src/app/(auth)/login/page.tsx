import { Card3DTilt } from "@/components/auth/Card3DTilt";
import { LoginCard } from "@/components/auth/LoginCard";

export const metadata = { title: "Connexion · PharmaPlanning" };

export default function LoginPage() {
  return (
    <div className="w-full max-w-[420px]">
      {/* Tilt 3D au survol souris (no-op sur mobile / reduced-motion) */}
      <Card3DTilt max={6} className="rounded-[28px]">
        {/* Carte principale — bordure aurora + glass + halo */}
        <div className="aurora-border animate-fade-up rounded-[28px]">
          <LoginCard />
        </div>
      </Card3DTilt>
    </div>
  );
}
