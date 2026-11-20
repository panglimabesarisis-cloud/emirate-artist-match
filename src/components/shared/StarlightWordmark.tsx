export function StarlightWordmark() {
  return <div className="shared-wordmark" aria-hidden="true">{"Dealmaker".split("").map((c, i) => <span key={i}>{c}</span>)}<b>.</b><i className="shared-spark" /><i className="shared-spark" /><i className="shared-spark" /></div>;
}