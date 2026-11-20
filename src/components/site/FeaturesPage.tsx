import { Link } from "@tanstack/react-router";
import { SceneBackground } from "@/components/shared/SceneBackground";
import { ReferenceTheme } from "@/components/shared/ReferenceTheme";
import { PublicLayout } from "./PublicLayout";
import { FlowDemo, NoCodeDemo } from "./FeatureDemos";
import "./information.css";

export function FeaturesPage() { return <ReferenceTheme><PublicLayout><section className="reference-features">
<div className="f-hero scenehost" data-scenes="arch"><SceneBackground></SceneBackground>
<div className="wrap f-hero-in">
<div className="eyebrow">Features</div>
<h1 className="serif">Your booking desk <span className="it">runs itself.</span></h1>
<p className="lead">Five things Dealmaker does for you, so you can stop answering messages and start performing.</p>
<ol className="f-index">
<li><a href="#ft1"><b>01</b>AI flow automation</a></li>
<li><a href="#ft2"><b>02</b>Secure wallet</a></li>
<li><a href="#ft3"><b>03</b>24/7 AI agent</a></li>
<li><a href="#ft4"><b>04</b>Drag and drop flow agent</a></li>
<li><a href="#ft5"><b>05</b>No code needed</a></li>
</ol>
</div>
</div>
<div className="wrap">
<article className="feat" id="ft1">
<div className="ft-txt in"><span className="ft-n serif">01</span><h2 className="serif">AI flow <span className="it">automation</span></h2>
<p>Every enquiry follows the same path without you touching it: the AI reads the request, checks your rules, quotes from your rate card and prepares the invoice. You only step in to approve.</p>
<ul><li>Quotes built from your own prices</li><li>Your approval before any invoice</li><li>Every step logged in your dashboard</li></ul></div>
<div className="ft-vis in d1"><div className="flow" id="flow">
<div className="fn"><i>✉</i><b>Client enquiry</b><small>"Free on 14 Dec?"</small></div>
<div className="fn"><i>✦</i><b>AI agent replies</b><small>Checks availability</small></div>
<div className="fn"><i>≡</i><b>Quote sent</b><small>From your rate card</small></div>
<div className="fn"><i>✓</i><b>You approve</b><small>One tap</small></div>
<div className="fn"><i>◎</i><b>Invoice and deposit</b><small>Paid to Dealmaker</small></div>
</div></div>
</article>
<article className="feat flip" id="ft2">
<div className="ft-txt in"><span className="ft-n serif">02</span><h2 className="serif">Secure <span className="it">wallet</span></h2>
<p>Client money lands in your Dealmaker wallet and stays held until the job is completed. Then it is released to you. You always see what is held, what is coming and what is paid.</p>
<ul><li>Deposit and balance tracking</li><li>Released only after the job is done</li><li>VAT invoices and receipts in AED</li></ul></div>
<div className="ft-vis in d1"><div className="wallet">
<div className="w-top"><span>Dealmaker wallet</span><span className="w-ex">Example</span></div>
<div className="w-bal"><div><small>Held for upcoming jobs</small><b className="serif">AED 12,300</b></div><div><small>Released to you</small><b className="serif">AED 8,700</b></div></div>
<div className="w-bar"><i></i></div>
<ul className="w-tx">
<li><span className="d held"></span><div><b>Deposit received</b><small>Wedding · Palm Jumeirah</small></div><em>+ AED 2,250</em></li>
<li><span className="d held"></span><div><b>Deposit received</b><small>Corporate gala · DIFC</small></div><em>+ AED 3,900</em></li>
<li><span className="d rel"></span><div><b>Payment released</b><small>Job completed · JBR</small></div><em>AED 1,800</em></li>
</ul>
</div></div>
</article>
<article className="feat" id="ft3">
<div className="ft-txt in"><span className="ft-n serif">03</span><h2 className="serif">24/7 <span className="it">AI agent</span></h2>
<p>Clients ask at midnight, during your set, on the way to a gig. Your AI agent answers every one of them in English and Arabic, with your prices and your rules, while you sleep or perform.</p>
<ul><li>Replies any time of day</li><li>English and Arabic</li><li>Hands over to you only when a booking is real</li></ul></div>
<div className="ft-vis in d1"><div className="clock">
<div className="dial"><span className="hand"></span><span className="hub"></span>
<i></i><i></i><i></i><i></i><i></i><i></i></div>
<ul className="c-log"><li><time>02:14</time>Answered a price question</li><li><time>04:37</time>Sent a quote for Saturday</li><li><time>13:05</time>Checked your calendar</li><li><time>23:58</time>Confirmed a booking for you</li></ul>
</div></div>
</article>
<article className="feat flip" id="ft4">
<div className="ft-txt in"><span className="ft-n serif">04</span><h2 className="serif">Drag and drop <span className="it">flow agent</span></h2>
<p>Decide how your agent works by arranging blocks. Drag a step into your flow, move it up or down, remove what you do not need, then run it to see the order. Try it here.</p>
<ul><li>Build your own booking flow</li><li>Reorder steps any time</li><li>Changes apply to the next enquiry</li></ul></div>
<div className="ft-vis in d1"><div className="dnd">
<FlowDemo></FlowDemo>


</div></div>
</article>
<article className="feat" id="ft5">
<div className="ft-txt in"><span className="ft-n serif">05</span><h2 className="serif">No code <span className="it">needed</span></h2>
<p>You set rules in plain words, the way you would brief a manager. Dealmaker turns them into the logic behind the scenes, so you never write or read a single line of code.</p>
<ul><li>Rules written like sentences</li><li>Rate card, availability and policies in simple forms</li><li>Works on your phone</li></ul></div>
<div className="ft-vis in d1"><NoCodeDemo></NoCodeDemo></div>
</article>
<div className="f-cta in"><h2 className="serif">Ready to let it <span className="it">run?</span></h2><div><Link className="btn btn-gold" to="/join">Join as talent <span className="arr">→</span></Link><Link params={{category:"musicians"}} className="btn btn-line" to="/$category">Find talent</Link></div></div>
</div>
</section></PublicLayout></ReferenceTheme>; }
