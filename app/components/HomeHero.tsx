/**
 * HomeHero — eyebrow + headline + lede above the sticky search zone.
 *
 * Why a server component: the hero is pure presentation; no state, no
 * effects, no event handlers. Keeping it server-side shaves a few KB
 * off the home client bundle (which is already on the heavy-page list,
 * see memory: maporia_project.md).
 *
 * Why NOT sticky: the hero deliberately scrolls away so that the
 * tabs+search row (which is sticky at top-[64px]) becomes the persistent
 * navigation surface — same Airbnb-style pattern we already use.
 *
 * Cross-link: docs/HOME_REDESIGN_INTEGRATION_PLAN.md (Phase 1).
 */
export default function HomeHero() {
  return (
    <section
      aria-labelledby="home-hero-title"
      className="px-4 pt-8 pb-4 sm:pt-12 sm:pb-6 text-center"
    >
      <p className="text-[11px] tracking-[0.18em] uppercase font-semibold text-[#556036]">
        Discover · Curated by locals
      </p>
      <h1
        id="home-hero-title"
        className="font-fraunces text-[36px] sm:text-[48px] lg:text-[56px] leading-[1.05] tracking-[-0.02em] mt-3 text-[#1F2A1F]"
      >
        Where to{" "}
        <em className="italic font-medium text-[#8F9E4F]">next</em>?
      </h1>
      <p className="text-[15px] sm:text-[16px] text-[#6F7A5A] max-w-[540px] mx-auto mt-2">
        Найди место, опыт или сервис в один клик.
      </p>
    </section>
  );
}
