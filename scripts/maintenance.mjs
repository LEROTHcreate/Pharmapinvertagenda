// Bascule le mode maintenance (page 503 servie par le middleware) via Edge Config.
// Usage : node scripts/maintenance.mjs on | off
// Effet INSTANTANÉ et global, sans redéploiement (le flag est lu par le
// middleware à chaque requête). Indépendant de Supabase/du build.
import { execSync } from "node:child_process";

const mode = process.argv[2];
if (mode !== "on" && mode !== "off") {
  console.error("Usage : node scripts/maintenance.mjs on|off");
  process.exit(1);
}

// Store Edge Config "maintenance-switch" (équipe lerothcreates-projects).
const ECFG = "ecfg_pesmff3j58tbuqytxoyqejkqdqip";
const value = mode === "on";
const json = JSON.stringify([
  { operation: "upsert", key: "maintenance", value },
]);

// Le CLI Vercel n'accepte que du JSON inline → on doit gérer le quoting du
// shell. Windows (cmd.exe) : guillemets doubles externes + guillemets internes
// échappés `\"`. POSIX : guillemets simples. `npx.cmd` ne peut pas être spawné
// en direct (EINVAL), d'où le passage par le shell via execSync.
const cmd =
  process.platform === "win32"
    ? `npx vercel edge-config update ${ECFG} --patch "${json.replace(/"/g, '\\"')}"`
    : `npx vercel edge-config update ${ECFG} --patch '${json}'`;

execSync(cmd, { stdio: "inherit" });

console.log(
  value
    ? "\n🔴 Maintenance ACTIVÉE — le site affiche la page 503 (propagation ~quelques secondes)."
    : "\n✅ Maintenance désactivée — le site est de nouveau accessible."
);
