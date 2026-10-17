import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pay Per Call Agent — AI Services, Priced Per Request",
  description: "A marketplace concept for AI agents to discover specialist services and pay per request with clear spending controls.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
