import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalSection } from "@/components/legal";

const DESC = "The terms for using AlphaMine, including your data, acceptable use and trading risk.";
export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of service | AlphaMine" }, { name: "description", content: DESC }, { property: "og:title", content: "Terms of service | AlphaMine" }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }] }),
  component: () => <LegalPage title="Terms of service" updated="26 October 2026" other={{ to: "/privacy", label: "Read the privacy policy" }}
    intro="These terms apply when you use AlphaMine. By creating an account or using the app, you agree to them." sections={sections} />,
});

const sections: LegalSection[] = [
  { h: "Using AlphaMine", p: ["AlphaMine is a journal and analytics tool for traders, published by IZ Technologies Limited. You must be at least 18 and able to enter a binding agreement to use it."] },
  { h: "Your account", p: ["Keep your sign in details secure. You are responsible for activity on your account, so tell us promptly if you think someone else has access."] },
  { h: "Your data", p: [
    "You own the content you add to AlphaMine. You give us permission to store and process it only as needed to run the service for you, such as saving your trades, calculating statistics and showing charts.",
    "Make sure you have the right to upload anything you add, including screenshots and broker reports.",
  ] },
  { h: "Acceptable use", p: ["Do not misuse the service. That includes trying to access other people's data, probing or disrupting the app, uploading harmful files, or using automated tools to overload it."] },
  { h: "Not financial advice", p: [
    "AlphaMine shows statistics about your own past trades. It does not give investment, trading, tax or legal advice, and nothing in the app is a recommendation to buy or sell anything.",
    "Trading carries a real risk of loss, and past results do not predict future results. Decisions you make are your own.",
  ] },
  { h: "Imports and calculations", p: ["Figures in AlphaMine depend on the reports and entries you provide. Imports can contain gaps or formatting differences, so check important numbers against your broker statements before relying on them."] },
  { h: "Sharing", p: ["If you create a share link, anyone with that link can view what it shows. You are responsible for deciding who receives it, and you can stop sharing at any time."] },
  { h: "Availability and changes", p: ["We work to keep AlphaMine running and your data safe, but we cannot promise the service will always be available or free of errors. Features may change or be removed over time."] },
  { h: "Ending your use", p: ["You can stop using AlphaMine at any time. We may suspend or close accounts that break these terms. Contact us if you want your account and data deleted."] },
  { h: "Limits of liability", p: ["AlphaMine is provided as is. To the extent the law allows, we are not liable for trading losses, lost profits or indirect damages arising from your use of the app, and our total responsibility to you is limited to the amount you paid us in the previous twelve months."] },
  { h: "Changes to these terms", p: ["We may update these terms. We will change the date above, and continuing to use AlphaMine after an update means you accept it."] },
];
