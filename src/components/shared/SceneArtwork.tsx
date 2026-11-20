import { useId } from "react";

export function SceneArtwork({ arch }: { arch: boolean }) {
 const id = useId().replace(/:/g, "");
 return <>
<div aria-hidden="true" className="scene scene-night">
<canvas className="scene-stars"></canvas>
<svg className="moon" viewBox="0 0 100 100"><path d="M62 10a40 40 0 1 0 28 62A34 34 0 1 1 62 10z"></path></svg>
<div className="city far"><div className="strip"><svg className="cs1" preserveAspectRatio="none" viewBox="0 0 1440 400"><path d="M0 400V300h40v-40h30v-60h28v60h22v-90h36v130h24v-40h40v-70h18v-30h20v100h30v-160h10v-30h8v30h10v160h26v-60h34v-110h30v110h20v40h36V140h6V60l6-50 6 50v80h6v160h30v-80h40v-60h22v140h34v-200h44v200h20v-50h40v-90h30v90h26V170h14v-30h18v30h14v130h40v-60h36v80h30V160h38v140h22v-50h40v-70h20v120h34v-150h42v150h20v-40h30v60h40v-110h28v110h24v-40h30v40h20V400z" className="city-fill-far"></path></svg><svg className="cs1" preserveAspectRatio="none" viewBox="0 0 1440 400"><path d="M0 400V300h40v-40h30v-60h28v60h22v-90h36v130h24v-40h40v-70h18v-30h20v100h30v-160h10v-30h8v30h10v160h26v-60h34v-110h30v110h20v40h36V140h6V60l6-50 6 50v80h6v160h30v-80h40v-60h22v140h34v-200h44v200h20v-50h40v-90h30v90h26V170h14v-30h18v30h14v130h40v-60h36v80h30V160h38v140h22v-50h40v-70h20v120h34v-150h42v150h20v-40h30v60h40v-110h28v110h24v-40h30v40h20V400z" className="city-fill-far"></path></svg></div></div>
<div className="city near"><div className="strip"><svg className="cs2" preserveAspectRatio="none" viewBox="0 0 1440 400"><path d="M0 400V300h40v-40h30v-60h28v60h22v-90h36v130h24v-40h40v-70h18v-30h20v100h30v-160h10v-30h8v30h10v160h26v-60h34v-110h30v110h20v40h36V140h6V60l6-50 6 50v80h6v160h30v-80h40v-60h22v140h34v-200h44v200h20v-50h40v-90h30v90h26V170h14v-30h18v30h14v130h40v-60h36v80h30V160h38v140h22v-50h40v-70h20v120h34v-150h42v150h20v-40h30v60h40v-110h28v110h24v-40h30v40h20V400z" className="city-fill-near"></path></svg><svg className="cs2" preserveAspectRatio="none" viewBox="0 0 1440 400"><path d="M0 400V300h40v-40h30v-60h28v60h22v-90h36v130h24v-40h40v-70h18v-30h20v100h30v-160h10v-30h8v30h10v160h26v-60h34v-110h30v110h20v40h36V140h6V60l6-50 6 50v80h6v160h30v-80h40v-60h22v140h34v-200h44v200h20v-50h40v-90h30v90h26V170h14v-30h18v30h14v130h40v-60h36v80h30V160h38v140h22v-50h40v-70h20v120h34v-150h42v150h20v-40h30v60h40v-110h28v110h24v-40h30v40h20V400z" className="city-fill-near"></path></svg></div><div className="win" ></div></div>
</div>
<div aria-hidden="true" className="scene scene-dusk"><canvas className="scene-glitter"></canvas>
<div className="halo"></div><div className="sunbox"><div className="sun"><span className="sun-red"></span></div></div>
<div className="sea"><canvas className="seacv"></canvas><div className="scol"></div><canvas className="refl"></canvas></div>
<div className="birds"><span></span><span></span><span></span></div>
<svg className="dune" preserveAspectRatio="none" viewBox="0 0 1440 160"><path d="M0 160V80C200 40 420 30 640 60S1100 120 1440 70V160Z"></path></svg>
<svg aria-hidden="true" className="palm p1" viewBox="0 0 300 520"><g className="tree">
<path d="M138 520C142 420 150 320 170 230C176 200 186 170 196 150L206 154C196 176 188 204 182 232C164 320 158 420 158 520Z"></path>
<g className="fr">
<path d="M200 150C160 110 100 100 40 130C100 112 150 122 196 158Z"></path>
<path d="M200 150C170 90 120 60 70 60C120 74 160 106 194 156Z"></path>
<path d="M200 150C210 90 250 50 300 40C256 70 226 104 206 156Z"></path>
<path d="M200 150C250 120 300 130 300 190C276 150 246 140 204 158Z"></path>
<path d="M200 150C170 170 130 220 120 280C150 220 176 186 204 158Z"></path>
<path d="M200 150C230 180 250 230 250 290C236 236 220 196 198 160Z"></path>
<circle cx="196" cy="166" r="9"></circle><circle cx="210" cy="164" r="8"></circle><circle cx="203" cy="176" r="8"></circle>
</g></g></svg>
<svg aria-hidden="true" className="palm p2" viewBox="0 0 300 520"><g className="tree">
<path d="M138 520C142 420 150 320 170 230C176 200 186 170 196 150L206 154C196 176 188 204 182 232C164 320 158 420 158 520Z"></path>
<g className="fr">
<path d="M200 150C160 110 100 100 40 130C100 112 150 122 196 158Z"></path>
<path d="M200 150C170 90 120 60 70 60C120 74 160 106 194 156Z"></path>
<path d="M200 150C210 90 250 50 300 40C256 70 226 104 206 156Z"></path>
<path d="M200 150C250 120 300 130 300 190C276 150 246 140 204 158Z"></path>
<path d="M200 150C170 170 130 220 120 280C150 220 176 186 204 158Z"></path>
<path d="M200 150C230 180 250 230 250 290C236 236 220 196 198 160Z"></path>
<circle cx="196" cy="166" r="9"></circle><circle cx="210" cy="164" r="8"></circle><circle cx="203" cy="176" r="8"></circle>
</g></g></svg>
<svg aria-hidden="true" className="palm p3" viewBox="0 0 300 520"><g className="tree">
<path d="M138 520C142 420 150 320 170 230C176 200 186 170 196 150L206 154C196 176 188 204 182 232C164 320 158 420 158 520Z"></path>
<g className="fr">
<path d="M200 150C160 110 100 100 40 130C100 112 150 122 196 158Z"></path>
<path d="M200 150C170 90 120 60 70 60C120 74 160 106 194 156Z"></path>
<path d="M200 150C210 90 250 50 300 40C256 70 226 104 206 156Z"></path>
<path d="M200 150C250 120 300 130 300 190C276 150 246 140 204 158Z"></path>
<path d="M200 150C170 170 130 220 120 280C150 220 176 186 204 158Z"></path>
<path d="M200 150C230 180 250 230 250 290C236 236 220 196 198 160Z"></path>
<circle cx="196" cy="166" r="9"></circle><circle cx="210" cy="164" r="8"></circle><circle cx="203" cy="176" r="8"></circle>
</g></g></svg>
</div>
<div aria-hidden="true" className="hscrim"></div>
<svg aria-hidden="true" className="geo"><defs><pattern id={`${id}-girih`} width="96" height="96" patternUnits="userSpaceOnUse"><g fill="none" stroke="currentColor" strokeWidth=".8"><path d="M48 14L82 48L48 82L14 48Z M24 24H72V72H24Z M48 0V14M48 82V96M0 48H14M82 48H96M0 0L24 24M96 0L72 24M0 96L24 72M96 96L72 72"/><circle cx="48" cy="48" r="9"/></g></pattern></defs>
<rect className="geo-r" fill={`url(#${id}-girih)`} height="200%" width="200%"></rect>
</svg>
{arch && <svg aria-hidden="true" className="arch" preserveAspectRatio="xMidYMax meet" viewBox="0 0 600 760">
<path className="a1" d="M40 760V330C40 175 180 85 300 14C420 85 560 175 560 330V760"></path>
<path className="a2" d="M78 760V338C78 200 196 120 300 58C404 120 522 200 522 338V760"></path>
<path className="a3" d="M300 14V0M282 6L300 -14L318 6"></path>
</svg>}
</>;
}
