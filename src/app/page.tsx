/**
 * @file src/app/page.tsx
 * @description Public landing page — assembles all landing section components.
 *
 * This is a React Server Component (RSC). It only imports:
 * - Other Server Components (HeroSection, FeaturesSection, etc.)
 * - One Client Component boundary: <Navbar> (for theme toggle + mobile menu)
 *
 * SSR happens automatically for all Server Components.
 */

import Navbar             from "@/components/landing/Navbar";
import HeroSection        from "@/components/landing/HeroSection";
import FeaturesSection    from "@/components/landing/FeaturesSection";
import HowItWorksSection  from "@/components/landing/HowItWorksSection";
import Footer             from "@/components/landing/Footer";

/**
 * Root landing page of the AIDL Platform.
 * Composed of: Navbar → Hero → Features → HowItWorks → Footer.
 */
export default function HomePage() {
  return (
    <>
      {/* Client Component: handles theme toggle & mobile menu state */}
      <Navbar />

      <main>
        {/* SSR Server Components below — rendered on the server, zero JS to client */}
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
      </main>

      <Footer />
    </>
  );
}
