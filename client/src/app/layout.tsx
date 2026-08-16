import type { Metadata } from "next";
import "./globals.css";
import Provider from "@/context/Provider";
import { getAuthSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "CloudCanvas",
  description: "CloudCanvas is a visual AWS infrastructure and deployment platform inspired by n8n. Drag and connect AWS services, GitHub repositories, and Docker images to design infrastructure visually, then deploy it automatically using the AWS SDK. AI assists with architecture, configuration, scaling, security, and troubleshooting.",
  authors: [
    { name: "Suhas Kanwar", url: "https://suhaskanwar.vercel.app" },
  ],
  keywords: ["CloudCanvas", "AWS", "Infrastructure as Code", "Deployment", "Visual Programming", "AI Assistance", "Cloud Computing", "Serverless", "Microservices", "DevOps", "Automation", "CI/CD", "GitHub Integration", "Docker Integration"]
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getAuthSession();

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Provider session={session}>
          {children}
        </Provider>
      </body>
    </html>
  );
}
