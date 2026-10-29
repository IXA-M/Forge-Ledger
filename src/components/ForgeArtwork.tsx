/** Original, decorative forge illustration for the dashboard. */
export function ForgeArtwork() {
  return <svg className="forge-hero-art" viewBox="0 0 260 170" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="forge-sky" x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--art-sky-a)" /><stop offset="1" stopColor="var(--art-sky-b)" /></linearGradient>
      <linearGradient id="forge-steel" x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--art-steel-a)" /><stop offset=".48" stopColor="var(--art-steel-b)" /><stop offset="1" stopColor="var(--art-steel-c)" /></linearGradient>
      <linearGradient id="forge-flame" x1="0" y1="1" x2=".2" y2="0"><stop stopColor="var(--art-flame-a)" /><stop offset="1" stopColor="var(--art-flame-b)" /></linearGradient>
      <radialGradient id="forge-glow"><stop stopColor="var(--art-glow)" stopOpacity=".44" /><stop offset="1" stopColor="var(--art-glow)" stopOpacity="0" /></radialGradient>
      <pattern id="forge-grain" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 8 8 0M-2 2 2-2M7 11 11 7" stroke="var(--art-grain)" strokeOpacity=".2" strokeWidth=".7" /></pattern>
    </defs>
    <ellipse cx="138" cy="99" rx="105" ry="70" fill="url(#forge-glow)" />
    <path d="M52 132 96 55l24 34 25-50 62 93Z" fill="url(#forge-sky)" opacity=".8" />
    <path d="m86 74 10-19 11 16-8-3-5 8Zm48-17 11-18 15 23-13-5-7 8Z" fill="var(--art-snow)" opacity=".8" />
    <path d="M35 132 78 92l22 21 36-37 65 56Z" fill="var(--art-hill)" opacity=".72" />
    <path d="M23 137h217" stroke="var(--art-line)" strokeWidth="2" />
    <path d="M113 124c-8-17 10-21 4-37 17 8 18 18 13 26 13-6 13-17 12-22 15 18 8 28-1 36Z" fill="url(#forge-flame)" />
    <path d="M126 125c-3-8 5-11 5-18 8 7 8 13 3 18Z" fill="var(--art-core)" />
    <path d="m72 119 45-4 12 7 36-2-10 13H76Z" fill="url(#forge-steel)" stroke="var(--art-outline)" strokeWidth="2" />
    <path d="m72 119 45-4 12 7-36 3-9 8H76Z" fill="url(#forge-grain)" />
    <path d="m128 120 37-3 15 5-12 7-39-1Z" fill="var(--art-steel-b)" stroke="var(--art-outline)" strokeWidth="2" />
    <path d="m105 134-6 20h40l-7-20m-35 20h54" fill="none" stroke="var(--art-outline)" strokeWidth="4" strokeLinejoin="round" />
    <path d="m169 91 29-43 7 4-19 48m-14-14 19 8" fill="none" stroke="url(#forge-steel)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m188 48 14-14 15 8-12 15Z" fill="var(--art-flame-a)" stroke="var(--art-outline)" strokeWidth="2" />
    <path d="m184 104 4-8m-16 9 2-6m34 12 4-7" stroke="var(--art-spark)" strokeWidth="2" strokeLinecap="round" />
    <path d="M41 138h198" stroke="var(--art-line)" strokeOpacity=".35" />
  </svg>;
}
