export function HeroArtwork() { return <>
<svg aria-hidden="true" className="geo">
<defs>
<pattern height="96" id="girih" patternUnits="userSpaceOnUse" width="96">
<g fill="none" stroke="var(--dm-gold)" strokeWidth=".8">
<path d="M48 14 L82 48 L48 82 L14 48Z"></path><path d="M24 24H72V72H24Z"></path>
<path d="M48 0V14M48 82V96M0 48H14M82 48H96M0 0L24 24M96 0L72 24M0 96L24 72M96 96L72 72"></path>
<circle cx="48" cy="48" r="9"></circle>
</g>
</pattern>
<radialGradient cx="50%" cy="42%" id="gm" r="60%"><stop offset="0" stopColor="var(--dm-light)" stopOpacity=".9"></stop><stop offset=".55" stopColor="var(--dm-light)" stopOpacity=".25"></stop><stop offset="1" stopColor="var(--dm-light)" stopOpacity="0"></stop></radialGradient>
<mask id="gmask"><rect fill="url(#gm)" height="100%" width="100%"></rect></mask>
</defs>
<rect className="geo-r" fill="url(#girih)" height="200%" mask="url(#gmask)" width="200%"></rect>
</svg>
<svg aria-hidden="true" className="arch" preserveAspectRatio="xMidYMax meet" viewBox="0 0 600 760">
<defs><linearGradient id="ag" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--dm-starlight)"></stop><stop offset="1" stopColor="var(--dm-gold-2)" stopOpacity="0"></stop></linearGradient></defs>
<path className="a1" d="M40 760V330C40 175 180 85 300 14C420 85 560 175 560 330V760"></path>
<path className="a2" d="M78 760V338C78 200 196 120 300 58C404 120 522 200 522 338V760"></path>
<path className="a3" d="M300 14V0M282 6L300 -14L318 6"></path>
</svg>
<svg aria-hidden="true" className="moon" viewBox="0 0 100 100"><path d="M62 10a40 40 0 1 0 28 62A34 34 0 1 1 62 10z"></path></svg>
<svg aria-hidden="true" className="skyline" preserveAspectRatio="xMidYMax slice" viewBox="0 0 1440 400">
<defs>
<linearGradient id="sk" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--dm-ink-3)"></stop><stop offset="1" stopColor="var(--dm-ink)"></stop></linearGradient>
<linearGradient id="sp" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--dm-gold)" stopOpacity=".8"></stop><stop offset="1" stopColor="var(--dm-gold)" stopOpacity="0"></stop></linearGradient>
</defs>
<path d="M0 400V300h40v-40h30v-60h28v60h22v-90h36v130h24v-40h40v-70h18v-30h20v100h30v-160h10v-30h8v30h10v160h26v-60h34v-110h30v110h20v40h36V140h6V60l6-50 6 50v80h6v160h30v-80h40v-60h22v140h34v-200h44v200h20v-50h40v-90h30v90h26V170h14v-30h18v30h14v130h40v-60h36v80h30V160h38v140h22v-50h40v-70h20v120h34v-150h42v150h20v-40h30v60h40v-110h28v110h24v-40h30v40h20V400z" fill="url(#sk)"></path>
<rect fill="url(#sp)" height="380" width="1.5" x="700" y="20"></rect>
</svg>
</>; }
