import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const display = Newsreader({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-family",
  display: "swap",
});

const ui = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-ui-family",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Otterscale",
  description: "Team mesh control platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} h-full antialiased`}>
      <body className={`${ui.className} flex min-h-full flex-col bg-parchment text-off-black`}>
        {children}
      </body>
    </html>
  );
}
