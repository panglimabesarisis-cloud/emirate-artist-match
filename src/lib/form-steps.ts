/** An order form opens one question at a time: the next one appears once the current one is answered. */
import type { OrderField } from "@/components/dashboard/OrderFormBuilder";

const answered = (field: OrderField, answers: Record<string, string>) => !!(answers[field.id] ?? "").trim();

/** How many questions are on screen: those opened so far, and never fewer than reach the last answer
 *  (answers kept through a sign-in stay visible). */
export function visibleQuestions(fields: OrderField[], opened: number, answers: Record<string, string>) {
  let last = -1;
  fields.forEach((field, i) => { if (answered(field, answers)) last = i; });
  return Math.min(fields.length, Math.max(1, opened, last + 1));
}

/** A required question holds the form until it has an answer; an optional one may be passed. */
export const mayContinue = (field: OrderField, answers: Record<string, string>) => !field.required || answered(field, answers);

/** Picking an option or a full date finishes a question by itself; typed answers wait for Next or Enter. */
export function finishesItself(field: OrderField, value: string) {
  if (field.type === "dropdown" || field.type === "choice") return !!value;
  return field.type === "date" && /^(19|20)\d\d-\d\d-\d\d$/.test(value);
}

/** The whole form is on screen and its last question may be left as it is. */
export function formComplete(fields: OrderField[], opened: number, answers: Record<string, string>) {
  const last = fields[fields.length - 1];
  return !!last && visibleQuestions(fields, opened, answers) === fields.length && mayContinue(last, answers) && fields.every((field) => mayContinue(field, answers));
}
