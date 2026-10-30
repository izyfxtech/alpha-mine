import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "@/components/marketing/legal";

const DESC = "How AlphaMine collects, uses and protects your account and trading journal data.";
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy policy | AlphaMine" }, { name: "description", content: DESC }, { property: "og:title", content: "Privacy policy | AlphaMine" }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }] }),
  component: () => <LegalPage title="Privacy policy" updated="26 October 2026" other={{ to: "/terms", label: "Read the terms of service" }}
    intro="AlphaMine is a trading journal published by IZ Technologies Limited. This page explains what information the app holds, why, and what control you have over it." sections={sections} />,
});

const sections: LegalSection[] = [
  { h: "What we collect", p: [
    "Account details: your email address, your name if you give one, and your password. Passwords are handled by our authentication provider and are never stored in readable form. If you sign in with Google, we receive your name and email address from Google.",
    "Journal content: everything you enter or import, including trades, trading plans, notes, diary entries, setups, custom statistics, deposits and withdrawals, and trade screenshots.",
    "Browser storage: your sign in session, plus display choices such as your theme and table layout, are kept in your browser so the app remembers them.",
  ] },
  { h: "How we use it", p: [
    "We use your information to run the service: to store your journals, calculate statistics, draw charts, and send account emails such as sign up confirmations and password resets.",
    "We do not sell your data. The app currently has no advertising and no analytics trackers.",
  ] },
  { h: "Where it is stored", p: [
    "Your data is stored with Supabase, which provides our database, authentication and file storage. Database rules restrict each journal to the account that owns it.",
    "Screenshots are kept in a private storage bucket and are opened through short lived signed links.",
    "Our pages load fonts from Google Fonts, so your browser contacts Google servers when a page loads. If you choose Google sign in, Google processes that sign in under its own policy.",
  ] },
  { h: "Share links", p: [
    "You can create a read only public link to a journal's performance. Anyone who has the link can view what it shows, without signing in, so treat it like a password. You can create a new link, which replaces the old one, or stop sharing at any time from the Share Journal button.",
  ] },
  { h: "Keeping and deleting your data", p: [
    "We keep your data for as long as your account exists. You can delete trades, journals and screenshots inside the app whenever you like. To delete your whole account, or to ask for a copy of your data, contact us using the details on this page.",
  ] },
  { h: "Your rights", p: [
    "Depending on where you live, data protection law may give you the right to access, correct, export or delete your personal data, and to object to certain uses. Contact us and we will help you use those rights.",
  ] },
  { h: "Children", p: ["AlphaMine is meant for adults. Do not create an account if you are under 18."] },
  { h: "Changes to this policy", p: ["If we change this policy in a meaningful way, we will update the date at the top of this page and, for major changes, tell you in the app or by email."] },
];
