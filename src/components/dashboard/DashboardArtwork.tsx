import { useId } from "react";

/** Decorative reference artwork only; no booking or account state. */
export function DashboardArtwork() {
  const pattern = useId();
  const skyline = <svg viewBox="0 0 900 150" preserveAspectRatio="none"><path className="studio-city-far" d="M0 150V85h32V56h28v42h30V70h34V42h24v61h30V65h42V87h18V35h23V72h37V45h32V88h27V30h21V81h39V59h31V17h15V0h4v17h15v66h34V49h30v41h22V29h24V65h30V42h39v39h26V56h32V97h20V35h25V79h32V53h30V91h28V26h29V79h31V57h33v46h32V78h36v72Z"/><path className="studio-city-near" d="M0 150v-33h37V95h43v32h29V80h40v47h40V101h46v26h22V62h33v64h26v-18h30V73h26v54h33V98h43v29h23V57h30v70h27V90h35v37h27V74h30v53h32V97h37v30h28V68h23v59h33V93h32v34h30V86h30v40h28v-26h36v50Z"/>{Array.from({ length: 38 }, (_, i) => <rect key={i} className="studio-city-window" x={i * 23 + 8} y={106 + (i % 3) * 9} width="2" height="4" />)}</svg>;
  return <div className="studio-artwork" aria-hidden="true">
    <svg className="studio-geo"><defs><pattern id={pattern} width="96" height="96" patternUnits="userSpaceOnUse"><g fill="none" stroke="currentColor" strokeWidth=".8"><path d="M48 14L82 48L48 82L14 48Z M24 24H72V72H24Z M48 0V14M48 82V96M0 48H14M82 48H96M0 0L24 24M96 0L72 24M0 96L24 72M96 96L72 72"/><circle cx="48" cy="48" r="9"/><path d="M48 34V62M34 48H62"/></g></pattern></defs><rect width="100%" height="100%" fill={`url(#${pattern})`} /></svg>
    <svg className="studio-moon" viewBox="0 0 100 100"><path d="M62 10a40 40 0 1 0 28 62A34 34 0 1 1 62 10z" /></svg>
    <div className="studio-sky"><div className="studio-city-strip">{skyline}{skyline}</div></div>
    <div className="studio-embers">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>
  </div>;
}
