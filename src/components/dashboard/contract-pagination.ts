/** Browser layout only: clone React-rendered text, never parse HTML or alter stored terms. */
export function paginateContract(source: HTMLElement, host: HTMLElement, continuation: string, pageLabel: (page: number, total: number) => string) {
  const dom = host.ownerDocument;
  host.replaceChildren();
  const pages: { sheet: HTMLElement; body: HTMLElement; number: HTMLElement }[] = [];
  const makePage = () => {
    const sheet = dom.createElement("article");
    sheet.className = "contract-a4-page";
    sheet.setAttribute("data-paper", "");
    sheet.setAttribute("dir", "ltr");
    if (pages.length) {
      const header = dom.createElement("header"); header.className = "contract-page-continuation";
      const brand = dom.createElement("b"); brand.textContent = "DEALMAKER";
      const identity = dom.createElement("span"); identity.textContent = continuation;
      header.append(brand, identity); sheet.append(header);
    }
    const body = dom.createElement("div"); body.className = "contract-a4-body";
    const footer = dom.createElement("footer"); footer.className = "contract-page-footer";
    const identity = dom.createElement("span"); identity.textContent = continuation;
    const number = dom.createElement("span");
    // Reserve final footer geometry before measuring body height.
    number.textContent = pageLabel(pages.length + 1, 999);
    footer.append(identity, number); sheet.append(body, footer); host.append(sheet);
    pages.push({ sheet, body, number }); return body;
  };
  // A small safety allowance also covers A4's fractional CSS-pixel print dimensions.
  const fits = (body: HTMLElement) => body.scrollHeight <= body.clientHeight;
  let body = makePage();
  for (const original of Array.from(source.children)) {
    if (!(original instanceof HTMLElement)) continue;
    let block = original.cloneNode(true) as HTMLElement;
    body.append(block);
    if (fits(body)) continue;
    block.remove();
    if (body.children.length) body = makePage();
    body.append(block);
    if (fits(body)) continue;
    block.remove();

    // A single paragraph/rider can itself exceed A4: split it without dropping characters.
    const originalText = original.querySelector<HTMLElement>("[data-pagination-text]");
    const text = originalText?.textContent ?? original.textContent ?? "";
    let remaining = text;
    let first = true;
    while (remaining.length) {
      block = original.cloneNode(true) as HTMLElement;
      if (!first) block.querySelectorAll("[data-pagination-heading]").forEach((heading) => heading.remove());
      let target = block.querySelector<HTMLElement>("[data-pagination-text]");
      if (!target) { block.replaceChildren(); target = dom.createElement("p"); block.append(target); }
      body.append(block);
      let low = 1; let high = remaining.length; let count = 0;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        target.textContent = remaining.slice(0, middle);
        if (fits(body)) { count = middle; low = middle + 1; }
        else high = middle - 1;
      }
      if (!count) {
        // Defensive fallback for pathological oversized headings: retain their text too.
        block.remove();
        if (body.children.length) { body = makePage(); continue; }
        if (originalText) {
          block.replaceChildren(); target = dom.createElement("p"); block.append(target); body.append(block);
          target.textContent = remaining.slice(0, 1); count = 1;
        } else { block.append(target); body.append(block); target.textContent = remaining.slice(0, 1); count = 1; }
      }
      if (count < remaining.length) {
        const prefix = remaining.slice(0, count);
        const boundary = Math.max(prefix.lastIndexOf(" "), prefix.lastIndexOf("\n"));
        if (boundary > count / 2) count = boundary + 1;
      }
      target.textContent = remaining.slice(0, count);
      remaining = remaining.slice(count);
      first = false;
      if (remaining.length) body = makePage();
    }
  }
  for (const [index, page] of pages.entries()) {
    page.number.textContent = pageLabel(index + 1, pages.length);
    page.sheet.setAttribute("aria-label", pageLabel(index + 1, pages.length));
  }
}