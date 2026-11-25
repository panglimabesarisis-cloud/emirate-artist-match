/** Makes the server's own dashboard and map links tappable. Other addresses stay plain text. */
const LINK = /(https:\/\/(?:dealmakertalent\.com\/|www\.google\.com\/maps\/)[^\s]*)/g;

export function LinkedText({ text }: { text: string }) {
  return <>{text.split(LINK).map((part, index) => index % 2
    ? <a key={index} href={part} target="_blank" rel="noreferrer" className="break-all underline">{part}</a>
    : part)}</>;
}
