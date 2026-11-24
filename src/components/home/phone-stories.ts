import { Ban, Clock3, CalendarX2, Banknote, Bot } from "lucide-react";

// Illustrative conversations only: never read or mutate real chats/bookings.
export const phoneStories = [
  {
    title: "Fans chat", person: "A fan", detail: "Friendly chat. No booking.", icon: Ban,
    outcome: "No job · Blocked", caption: "A lovely conversation. But not a job.",
    messages: [
      { text: "Hi! How are you? I loved your performance. I'm a big fan!", time: "10:02", me: false },
      { text: "I'm well, thank you! That's so kind. Thanks for supporting me!", time: "10:04", me: true },
      { text: "Can we meet for coffee today? Just the two of us?", time: "10:05", me: false },
      { text: "Thank you, but I keep this chat for event bookings.", time: "10:06", me: true },
    ],
  },
  {
    title: "Too late to reply", person: "Wedding client", detail: "Six hours later…", icon: Clock3,
    outcome: "Booking lost", caption: "How long will you keep replying one by one? Clients need a fast response.",
    messages: [
      { text: "Hi! Are you available to sing at our wedding on Saturday?", time: "10:00", me: false },
      { text: "Hello? We'd love to confirm today.", time: "11:20", me: false },
      { text: "Sorry, I've been replying to everyone one by one. Yes, I'm available!", time: "16:30", me: true },
      { text: "Sorry, we already booked another artist. We couldn't wait.", time: "16:32", me: false },
    ],
  },
  {
    title: "Clashing schedules", person: "Event organiser", detail: "One date. Two commitments.", icon: CalendarX2,
    outcome: "Schedule conflict", caption: "Two bookings at the same time. Now you're in trouble.",
    messages: [
      { text: "Can you perform on the 20th at 7 pm? Let's confirm.", time: "12:00", me: false },
      { text: "Yes, confirmed. See you there!", time: "12:05", me: true },
      { text: "I'm sorry, I just realised I have another booking then. Can we cancel?", time: "15:10", me: true },
      { text: "No! We've already announced your performance. You agreed!", time: "15:12", me: false },
    ],
  },
  {
    title: "Chasing payment", person: "Yesterday's client", detail: "The event is over. The balance isn't.", icon: Banknote,
    outcome: "Job finished · Still unpaid", caption: "The work is complete. You're still chasing the payment.",
    messages: [
      { text: "Thank you for yesterday! When can you send the remaining payment?", time: "Monday", me: true },
      { text: "I'll pay you soon, don't worry.", time: "Monday", me: false },
      { text: "Hi, just following up on the balance.", time: "Tuesday · ✓✓", me: true },
      { text: "Hello? Any update on the payment, please?", time: "Thursday · ✓✓", me: true },
    ],
  },
  {
    title: "How Dealmaker works", person: "Dealmaker AI", detail: "From enquiry to artist notification.", icon: Bot,
    outcome: "Your AI manager · 24/7", caption: "Dealmaker AI handles enquiries around the clock, with your prices, rules and approval.",
    messages: [
      { text: "Are you available for our event on Saturday?", time: "Client", me: false },
      { text: "Let's check your date and time using the calendar form.", time: "AI · Calendar form", me: true },
      { text: "Saturday, 7 pm. I'd like to book!", time: "Client", me: false },
      { text: "Please complete the booking form with your venue and event details.", time: "AI · Booking form", me: true },
      { text: "Done. I agree to the offer and terms.", time: "Client", me: false },
      { text: "After artist approval, your invoice and payment link are ready. Booking details are sent to the artist.", time: "AI · Invoice + notification", me: true },
    ],
  },
];