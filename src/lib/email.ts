/**
 * Module d'envoi d'emails transactionnels via Gmail SMTP (Nodemailer).
 *
 * Pourquoi Gmail SMTP plutôt qu'un service dédié (Resend, SendGrid, etc.) ?
 *  - 100% gratuit, pas de domaine à acheter / vérifier
 *  - 500 emails/jour avec un Gmail standard, 2000/jour avec Workspace
 *    → largement suffisant pour une officine ~20 collaborateurs
 *  - Setup en 2 minutes : activer 2FA + créer un "Mot de passe d'application"
 *
 * À noter pour la suite :
 *  - Si la pharmacie scale (>500 emails/jour) ou veut un from "pro"
 *    (noreply@pharmacie.fr), basculer sur Resend avec domaine vérifié.
 *  - Gmail peut throttler / blacklister si volume soudain anormal — c'est
 *    fait pour de la transactionnelle légère, pas pour de la newsletter.
 *
 * Tous les envois sont best-effort : si SMTP est down ou la conf manque,
 * on log l'erreur mais on ne casse pas le flow utilisateur.
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const FROM =
  process.env.EMAIL_FROM ??
  (GMAIL_USER ? `PharmaPlanning <${GMAIL_USER}>` : "PharmaPlanning");

// Singleton transporter (réutilisé entre les requêtes pour pooler la connexion).
// nodemailer crée un pool TCP si on le configure : utile en serverless aussi
// car les invocations consécutives "froides" partagent le même process Node.
let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });
  return transporter;
}

function loginUrl(): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base}/login`;
}

/**
 * Wrapper safe : log les erreurs mais ne throw jamais.
 * Absence de GMAIL_USER / GMAIL_APP_PASSWORD = log warn et skip (utile en
 * dev sans conf ; les emails partent une fois Netlify configuré).
 */
async function safeSend(params: {
  to: string | string[];
  subject: string;
  html: string;
  /** Tag interne pour les logs */
  tag: string;
}): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.warn(
      `[email] GMAIL_USER/GMAIL_APP_PASSWORD non définis — email "${params.tag}" ignoré.`
    );
    return;
  }
  try {
    const info = await t.sendMail({
      from: FROM,
      to: Array.isArray(params.to) ? params.to.join(", ") : params.to,
      subject: params.subject,
      html: params.html,
    });
    if (info.rejected && info.rejected.length > 0) {
      console.warn(
        `[email:${params.tag}] destinataires rejetés :`,
        info.rejected
      );
    }
  } catch (e) {
    console.error(`[email:${params.tag}] exception :`, e);
  }
}

/* ─── Templates HTML ─────────────────────────────────────────────── */

const LOGO_URL = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/logo.png`;
const ADMIN_PHONE = process.env.ADMIN_CONTACT_PHONE ?? "07.69.46.24.46";
const ADMIN_EMAIL =
  process.env.ADMIN_CONTACT_EMAIL ?? "pharmapinvert.agenda@gmail.com";
const ADMIN_NAME = process.env.ADMIN_CONTACT_NAME ?? "l'administrateur";

/** Wrapper commun : header logo + corps + footer contact */
function layout(opts: { title: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background:#fafaff; color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fafaff; padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 4px 24px -8px rgba(76,29,149,0.08), 0 1px 3px rgba(0,0,0,0.04);">
          <!-- Header avec logo + nom -->
          <tr>
            <td style="padding:28px 40px 8px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:middle; padding-right:12px;">
                    <img src="${LOGO_URL}" alt="PharmaPlanning" width="44" height="44" style="display:block; border-radius:10px; object-fit:contain;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="font-size:16px; font-weight:600; color:#18181b; letter-spacing:-0.01em; line-height:1.2;">PharmaPlanning</div>
                    <div style="font-size:12px; color:#a1a1aa; margin-top:2px;">Gestion de planning d'officine</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Corps du message -->
          <tr>
            <td style="padding:8px 40px 32px;">
              ${opts.bodyHtml}
            </td>
          </tr>
          <!-- Footer interne : contact admin -->
          <tr>
            <td style="padding:0 40px 28px;">
              <div style="border-top:1px solid #f1f1f4; padding-top:20px;">
                <p style="margin:0 0 6px; font-size:12.5px; color:#71717a; line-height:1.6;">
                  <strong style="color:#52525b;">Une question ou un souci&nbsp;?</strong><br/>
                  Contacte ${escapeHtml(ADMIN_NAME)} :
                </p>
                <p style="margin:0; font-size:12.5px; color:#71717a; line-height:1.7;">
                  📞
                  <a href="tel:${ADMIN_PHONE.replace(/\./g, "")}" style="color:#7c3aed; font-weight:500; text-decoration:none;">
                    ${escapeHtml(ADMIN_PHONE)}
                  </a>
                  &nbsp;·&nbsp;
                  ✉️
                  <a href="mailto:${escapeHtml(ADMIN_EMAIL)}" style="color:#7c3aed; font-weight:500; text-decoration:none;">
                    ${escapeHtml(ADMIN_EMAIL)}
                  </a>
                </p>
              </div>
            </td>
          </tr>
        </table>
        <p style="font-size:12px; color:#a1a1aa; margin:20px 0 0;">
          PharmaPlanning · Gestion de planning pour officines de pharmacie
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Bouton CTA réutilisable */
function cta(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block; margin-top:24px; padding:12px 24px; background:linear-gradient(135deg,#7c3aed,#6366f1); color:#fff; text-decoration:none; font-weight:500; font-size:15px; border-radius:999px; box-shadow:0 4px 12px -2px rgba(124,58,237,0.3);">${escapeHtml(label)}</a>`;
}

/** Titre principal */
function h1(text: string): string {
  return `<h1 style="font-size:24px; font-weight:600; letter-spacing:-0.02em; color:#18181b; margin:24px 0 12px;">${escapeHtml(text)}</h1>`;
}

/** Paragraphe */
function p(text: string): string {
  return `<p style="font-size:15px; line-height:1.6; color:#52525b; margin:0 0 16px;">${escapeHtml(text)}</p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ─── Emails publics ─────────────────────────────────────────────── */

/** ✉️ 1. Confirmation après signup — l'utilisateur sait que sa demande est arrivée */
export async function sendSignupConfirmation(params: {
  to: string;
  name: string;
  pharmacyName: string;
}): Promise<void> {
  const html = layout({
    title: "Demande d'accès reçue",
    bodyHtml: [
      h1("Bonjour " + params.name.split(" ")[0] + " 👋"),
      p(
        `Ta demande d'accès à PharmaPlanning pour la ${params.pharmacyName} a bien été reçue.`
      ),
      p(
        "Un administrateur de ton officine va l'examiner. Tu recevras un nouvel email dès que ton compte sera activé."
      ),
      p("À très vite,"),
      `<p style="font-size:14px; color:#a1a1aa; margin:16px 0 0;">— L'équipe PharmaPlanning</p>`,
    ].join(""),
  });

  await safeSend({
    to: params.to,
    subject: "Ta demande d'accès est en cours d'examen",
    html,
    tag: "signup-confirmation",
  });
}

/** ✉️ 2. Approbation — le compte est validé, voici le lien de connexion */
export async function sendApprovalEmail(params: {
  to: string;
  name: string;
  role: "ADMIN" | "EMPLOYEE";
  pharmacyName: string;
}): Promise<void> {
  const roleLabel = params.role === "ADMIN" ? "administrateur" : "collaborateur";
  const html = layout({
    title: "Ton compte est activé",
    bodyHtml: [
      h1("Bienvenue " + params.name.split(" ")[0] + " 🎉"),
      p(
        `Ton compte ${roleLabel} pour la ${params.pharmacyName} vient d'être validé. Tu peux maintenant te connecter.`
      ),
      params.role === "ADMIN"
        ? p(
            "En tant qu'admin, tu peux gérer le planning, les gabarits S1/S2, les collaborateurs et valider les demandes d'inscription."
          )
        : p(
            "Tu peux consulter le planning de l'équipe en lecture seule et soumettre tes demandes d'absence."
          ),
      cta(loginUrl(), "Se connecter"),
      `<p style="font-size:13px; color:#a1a1aa; margin:24px 0 0;">Si le bouton ne fonctionne pas : <a href="${loginUrl()}" style="color:#7c3aed;">${loginUrl()}</a></p>`,
    ].join(""),
  });

  await safeSend({
    to: params.to,
    subject: "🎉 Ton compte PharmaPlanning est activé",
    html,
    tag: "approval",
  });
}

/** ✉️ 4. Demande d'absence — notifie les admins de la pharmacie */
export async function sendAbsenceRequestEmail(params: {
  to: string[];
  employeeName: string;
  absenceLabel: string;
  dateStart: string; // YYYY-MM-DD
  dateEnd: string;
  reason: string | null;
  pharmacyName: string;
}): Promise<void> {
  if (params.to.length === 0) return;

  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });

  const periodLabel =
    params.dateStart === params.dateEnd
      ? fmtDate(params.dateStart)
      : `${fmtDate(params.dateStart)} → ${fmtDate(params.dateEnd)}`;

  const reviewUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/absences`;

  const html = layout({
    title: "Nouvelle demande d'absence",
    bodyHtml: [
      h1("📋 Demande d'absence"),
      p(`${params.employeeName} vient de soumettre une demande d'absence pour la ${params.pharmacyName}.`),
      `<div style="background:#fef9c3; border-radius:12px; padding:14px 16px; margin:16px 0;">
        <p style="margin:0 0 8px; font-size:13px; color:#854d0e; font-weight:600;">
          ${escapeHtml(params.absenceLabel)}
        </p>
        <p style="margin:0; font-size:14px; color:#713f12;">
          ${escapeHtml(periodLabel)}
        </p>
        ${params.reason
          ? `<p style="margin:8px 0 0; font-size:13px; color:#713f12; font-style:italic;">« ${escapeHtml(params.reason)} »</p>`
          : ""}
      </div>`,
      cta(reviewUrl, "Examiner la demande"),
    ].join(""),
  });

  await safeSend({
    // safeSend gère array → join interne (nodemailer veut une string CSV)
    to: params.to,
    subject: `📋 Demande d'absence — ${params.employeeName}`,
    html,
    tag: "absence-request",
  });
}

/** ✉️ 5. Demande d'absence APPROUVÉE — notifie le collaborateur */
export async function sendAbsenceApprovedEmail(params: {
  to: string;
  employeeName: string;
  absenceLabel: string;
  dateStart: string;
  dateEnd: string;
  adminNote: string | null;
}): Promise<void> {
  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  const periodLabel =
    params.dateStart === params.dateEnd
      ? fmtDate(params.dateStart)
      : `${fmtDate(params.dateStart)} → ${fmtDate(params.dateEnd)}`;

  const html = layout({
    title: "Ta demande d'absence a été validée",
    bodyHtml: [
      h1("✅ Demande validée"),
      p(
        `Bonjour ${params.employeeName.split(" ")[0]}, ta demande d'absence a été acceptée par le titulaire.`
      ),
      `<div style="background:#f0fdf4; border-radius:12px; padding:14px 16px; margin:16px 0;">
        <p style="margin:0 0 8px; font-size:13px; color:#166534; font-weight:600;">${escapeHtml(params.absenceLabel)}</p>
        <p style="margin:0; font-size:14px; color:#14532d;">${escapeHtml(periodLabel)}</p>
      </div>`,
      params.adminNote
        ? `<div style="background:#f4f4f5; border-left:3px solid #a1a1aa; padding:10px 14px; border-radius:6px; margin:0 0 16px;">
            <p style="font-size:12px; color:#71717a; margin:0 0 4px; font-weight:600;">Note du titulaire</p>
            <p style="font-size:13.5px; color:#52525b; margin:0;">${escapeHtml(params.adminNote)}</p>
           </div>`
        : "",
      p("Tes créneaux planning sur la période ont été automatiquement marqués comme absence."),
    ].join(""),
  });

  await safeSend({
    to: params.to,
    subject: "✅ Ton absence a été validée",
    html,
    tag: "absence-approved",
  });
}

/** ✉️ 6. Demande d'absence REFUSÉE — notifie le collaborateur avec motif */
export async function sendAbsenceRejectedEmail(params: {
  to: string;
  employeeName: string;
  absenceLabel: string;
  dateStart: string;
  dateEnd: string;
  adminNote: string | null;
}): Promise<void> {
  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  const periodLabel =
    params.dateStart === params.dateEnd
      ? fmtDate(params.dateStart)
      : `${fmtDate(params.dateStart)} → ${fmtDate(params.dateEnd)}`;

  const html = layout({
    title: "Ta demande d'absence n'a pas été validée",
    bodyHtml: [
      h1("Demande non validée"),
      p(
        `Bonjour ${params.employeeName.split(" ")[0]}, ta demande d'absence n'a pas été acceptée.`
      ),
      `<div style="background:#fef2f2; border-radius:12px; padding:14px 16px; margin:16px 0;">
        <p style="margin:0 0 8px; font-size:13px; color:#991b1b; font-weight:600;">${escapeHtml(params.absenceLabel)}</p>
        <p style="margin:0; font-size:14px; color:#7f1d1d;">${escapeHtml(periodLabel)}</p>
      </div>`,
      params.adminNote
        ? `<div style="background:#fef9c3; border-left:3px solid #eab308; padding:12px 16px; border-radius:8px; margin:0 0 16px;">
            <p style="font-size:13px; color:#854d0e; margin:0 0 4px; font-weight:600;">Motif du refus</p>
            <p style="font-size:14px; color:#713f12; margin:0;">${escapeHtml(params.adminNote)}</p>
           </div>`
        : p("Aucun motif n'a été précisé. N'hésite pas à en discuter directement avec le titulaire."),
    ].join(""),
  });

  await safeSend({
    to: params.to,
    subject: "Ta demande d'absence",
    html,
    tag: "absence-rejected",
  });
}

/** ✉️ 3. Refus — le compte est rejeté, avec motif optionnel */
export async function sendRejectionEmail(params: {
  to: string;
  name: string;
  pharmacyName: string;
  reason: string | null;
}): Promise<void> {
  const html = layout({
    title: "Ta demande d'accès n'a pas été validée",
    bodyHtml: [
      h1("Bonjour " + params.name.split(" ")[0]),
      p(
        `Ta demande d'accès à PharmaPlanning pour la ${params.pharmacyName} n'a pas été validée.`
      ),
      params.reason
        ? `<div style="background:#fef9c3; border-left:3px solid #eab308; padding:12px 16px; border-radius:8px; margin:0 0 16px;">
            <p style="font-size:13px; color:#854d0e; margin:0 0 4px; font-weight:600;">Motif</p>
            <p style="font-size:14px; color:#713f12; margin:0;">${escapeHtml(params.reason)}</p>
           </div>`
        : "",
      p(
        "Si tu penses qu'il s'agit d'une erreur, contacte directement le titulaire de ton officine."
      ),
      `<p style="font-size:14px; color:#a1a1aa; margin:16px 0 0;">— L'équipe PharmaPlanning</p>`,
    ].join(""),
  });

  await safeSend({
    to: params.to,
    subject: "Ta demande d'accès PharmaPlanning",
    html,
    tag: "rejection",
  });
}

/** ✉️ 7. Reset password — lien magique pour réinitialiser son mot de passe */
export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}): Promise<void> {
  const html = layout({
    title: "Réinitialisation de ton mot de passe",
    bodyHtml: [
      h1("Bonjour " + params.name.split(" ")[0]),
      p(
        "Tu as demandé à réinitialiser ton mot de passe PharmaPlanning. Clique sur le bouton ci-dessous — le lien est valable " +
          params.expiresInMinutes +
          " minutes."
      ),
      cta(params.resetUrl, "Réinitialiser mon mot de passe"),
      `<p style="font-size:13px; color:#a1a1aa; margin:24px 0 0;">Si le bouton ne fonctionne pas, copie-colle ce lien dans ton navigateur :<br/><a href="${params.resetUrl}" style="color:#7c3aed; word-break:break-all;">${params.resetUrl}</a></p>`,
      `<p style="font-size:13px; color:#a1a1aa; margin:16px 0 0;">Si ce n'est pas toi qui as fait cette demande, tu peux ignorer cet email — ton mot de passe actuel reste valide.</p>`,
    ].join(""),
  });

  await safeSend({
    to: params.to,
    subject: "Réinitialisation de ton mot de passe PharmaPlanning",
    html,
    tag: "password-reset",
  });
}
