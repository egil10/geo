import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NorgeQuiz — Norges ultimate geografiquiz",
  description:
    "Bli best i norsk geografi. Endeløs quiz om fylker, kommuner, fjell, elver, innsjøer, fjorder, øyer, kommunevåpen og kommunenummer — med Elo-rangering.",
  applicationName: "NorgeQuiz",
  authors: [{ name: "NorgeQuizBC" }],
  keywords: ["Norge", "geografi", "quiz", "fylker", "kommuner", "fjell", "kart"],
  openGraph: {
    title: "NorgeQuiz — Norges ultimate geografiquiz",
    description: "Endeløs quiz om norsk geografi med Elo-rangering.",
    type: "website",
    locale: "nb_NO",
  },
};

export const viewport: Viewport = {
  themeColor: "#fafaf7",
  width: "device-width",
  initialScale: 1,
};

const themeInit = `try{var q=new URLSearchParams(location.search).get('theme');var t=q||localStorage.getItem('norgequiz.theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}if(q==='light'){document.documentElement.classList.remove('dark')}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className={`min-h-dvh antialiased font-sans ${display.variable}`}>{children}</body>
    </html>
  );
}
