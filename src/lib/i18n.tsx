import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

/** English text is the key; missing Arabic falls back to English. */
const AR: Record<string, string> = {
  "Custom conversation flow": "مسار المحادثة المخصص", "Custom flow active": "المسار المخصص نشط", "Standard flow active": "المسار القياسي نشط",
  "Yes · Artist approves": "نعم · يوافق الفنان", "No · Artist declines": "لا · يرفض الفنان", "Continue Yes branch": "متابعة فرع نعم", "Continue No branch": "متابعة فرع لا",
  "Yes · Approve": "نعم · موافقة", "No · Decline": "لا · رفض", "Your response is sent to the client chat.": "يُرسل ردك إلى محادثة العميل.",
  "Card title": "عنوان البطاقة", "General information": "معلومات عامة", "Questions & answers": "أسئلة وأجوبة", "Question": "السؤال", "Answer": "الإجابة", "Delete question": "حذف السؤال", "Add question & answer": "إضافة سؤال وإجابة",
  Ratecard: "قائمة الأسعار", Invoice: "فاتورة", Contract: "عقد", Artist: "الفنان", Client: "العميل", Total: "الإجمالي", Payment: "الدفع", Balance: "الرصيد", View: "عرض", Service: "الخدمة", Time: "الوقت",
  "Job type": "نوع العمل", "Add ratecard": "إضافة سعر", "Edit ratecard": "تعديل السعر", "Search ratecards": "البحث في الأسعار", "No ratecards yet.": "لا توجد أسعار بعد.", "All artists": "كل الفنانين",
  "Search invoices": "البحث في الفواتير", "Payment status": "حالة الدفع", "All payments": "كل المدفوعات", Unpaid: "غير مدفوع", Paid: "مدفوع", "Paid 100%": "مدفوع 100%", "Partially paid": "مدفوع جزئياً", "Paid at": "تاريخ الدفع", "No invoices yet.": "لا توجد فواتير بعد.", "Invoice preview": "معاينة الفاتورة",
  "Total invoiced": "إجمالي الفواتير", "Total paid": "إجمالي المدفوع", "Outstanding balance": "الرصيد المتبقي", "Search contracts": "البحث في العقود", "Acceptance status": "حالة الموافقة", "All contracts": "كل العقود", Accepted: "تمت الموافقة", "Awaiting acceptance": "بانتظار الموافقة", "Accepted at": "تاريخ الموافقة", "No contracts yet.": "لا توجد عقود بعد.", "Contract preview": "معاينة العقد", "Booking contract": "عقد الحجز", Booking: "الحجز", "Booking status": "حالة الحجز",
  "Could not load invoices.": "تعذر تحميل الفواتير.", "Could not load contracts.": "تعذر تحميل العقود.", "Could not load artists.": "تعذر تحميل الفنانين.", "Could not load ratecards.": "تعذر تحميل الأسعار.",
  Talent: "الموهبة", City: "المدينة", Event: "المناسبة", Categories: "الفئات",
  "AI booking agent": "وكيل الحجز الذكي", "Transparent pricing": "أسعار واضحة",
  "See all talent": "عرض جميع المواهب", "Discover performers with reviews from completed bookings.": "اكتشف فنانين بتقييمات من حجوزات مكتملة.",
  "No featured artists in this category yet.": "لا يوجد فنانون مميزون في هذه الفئة بعد.", "Browse this category": "تصفح هذه الفئة",
  "Why Dealmaker": "لماذا ديلميكر", "Booking talent, finally made simple.": "حجز المواهب أصبح بسيطًا.",
  "From first enquiry to final invoice — everything in one place.": "من أول استفسار إلى الفاتورة النهائية — كل شيء في مكان واحد.",
  "Effortless booking": "حجز بسهولة", "Clear, trackable payments": "مدفوعات واضحة وقابلة للتتبع", "Served by AI, 24/7": "خدمة ذكية على مدار الساعة",
  "Find your performer, check their schedule and keep every booking detail in one place.": "اختر فنانك وتحقق من جدول أعماله واحتفظ بتفاصيل الحجز في مكان واحد.",
  "Review your contract and invoice before paying your deposit, with your balance always visible.": "راجع العقد والفاتورة قبل دفع العربون وتابع الرصيد المتبقي.",
  "Every artist has an AI manager that answers enquiries using their own prices and rules.": "لكل فنان مدير ذكي يجيب عن الاستفسارات وفق أسعاره وقواعده.",
  "Google Calendar availability checks": "التحقق من التوفر عبر تقويم Google", "Itemised invoices in AED": "فواتير مفصلة بالدرهم",
  "All bookings tracked in one dashboard": "جميع الحجوزات في لوحة واحدة", "Deposit and balance payment tracking": "متابعة العربون والرصيد المتبقي",
  "VAT invoices & receipts": "فواتير وإيصالات ضريبية", "Clear cancellation & refund policy": "سياسة واضحة للإلغاء والاسترداد",
  "Enquiries any time of day": "استفسارات في أي وقت", "English & Arabic": "الإنجليزية والعربية", "Artist approval before your invoice": "موافقة الفنان قبل إصدار الفاتورة",
  Choose: "اختر", Quote: "عرض السعر", Confirm: "تأكيد", "Invoice · Contract · Payment": "فاتورة · عقد · دفع",
  "Booking details in one place": "تفاصيل الحجز في مكان واحد", "Your artist's AI manager": "المدير الذكي لفنانك", "Available for enquiries 24/7": "متاح للاستفسارات على مدار الساعة",
  "Reviews only from completed bookings": "تقييمات من حجوزات مكتملة فقط", "For event organisers": "لمنظمي الفعاليات", "For performers": "للفنانين",
  "Are you looking for talent?": "هل تبحث عن موهبة؟", "Are you a performer?": "هل أنت فنان؟", "Explore talent": "اكتشف المواهب",
  "Browse performers across the UAE and find the right talent for your next event.": "تصفح الفنانين في الإمارات واعثر على الموهبة المناسبة لفعاليتك المقبلة.",
  "Create your profile and let your AI manager handle enquiries while you perform.": "أنشئ ملفك ودع مديرك الذكي يتولى الاستفسارات أثناء تقديم عروضك.",
  "Scroll categories backward": "تمرير الفئات للخلف", "Scroll categories forward": "تمرير الفئات للأمام",
  "Book Artist": "احجز الفنان", "Photos & videos": "الصور والفيديو", "Estimated total (excl. VAT)": "الإجمالي التقديري (بدون الضريبة)",
  "Job Detail": "تفاصيل العمل", Start: "البداية", End: "النهاية", Duration: "المدة", "Budget (AED)": "الميزانية (درهم)", "Please enter your budget.": "يرجى إدخال ميزانيتك.",
  Performance: "الأداء", Punctuality: "الالتزام بالمواعيد", Communication: "التواصل",
  "Also ask up to 2 similar artists": "اطلب أيضًا من فنانَين مشابهين كحد أقصى", "Your quote requests were sent": "تم إرسال طلبات عرض السعر",
  "Each artist replies in its own chat. Save these links to come back later.": "يرد كل فنان في محادثة منفصلة. احفظ هذه الروابط للعودة لاحقًا.",
  "Open chat": "فتح المحادثة", "unavailable on that date": "غير متاح في هذا التاريخ",
  "This conversation link is invalid.": "رابط المحادثة غير صالح.", "Save this page's link to come back to your conversation.": "احفظ رابط هذه الصفحة للعودة إلى محادثتك.",
  "Booking details": "تفاصيل الحجز", "Booking offer": "عرض الحجز", "waiting for the artist to approve": "بانتظار موافقة الفنان", "incl. VAT": "شامل الضريبة",
  "Review & pay": "راجع وادفع", "The artist is handling this chat personally": "الفنان يتولى هذه المحادثة بنفسه",
  "AI assistant replying on the artist's behalf": "مساعد ذكي يرد نيابة عن الفنان", "View profile": "عرض الملف", "Typing…": "يكتب…",
  "AI assistant": "المساعد الذكي", "Type your message…": "اكتب رسالتك…", "Message failed. Please try again.": "فشل إرسال الرسالة. حاول مرة أخرى.",
  "DEMO MODE · Phone numbers, emails and social handles are hidden automatically to keep you protected.": "وضع تجريبي · يتم إخفاء أرقام الهواتف والبريد الإلكتروني وحسابات التواصل تلقائيًا لحمايتك.",
  Inbox: "صندوق الوارد", Bookings: "الحجوزات", "Quote requests": "طلبات عروض الأسعار", Availability: "التوفر", "My requests": "طلباتي",
  "AI agent": "الوكيل الذكي", "AI flow": "مسار الذكاء الاصطناعي", Credits: "الأرصدة", Profile: "الملف الشخصي", "Public stats": "الإحصاءات العامة",
  Verification: "التوثيق", Team: "الفريق", "Export data": "تصدير البيانات", "View public profile": "عرض الملف العام", "Plan:": "الخطة:",
  "DEMO MODE — no real payments are processed.": "وضع تجريبي — لا تتم معالجة أي مدفوعات حقيقية.",
  Musicians: "موسيقيون", DJs: "منسقو أغاني", "Cultural Acts": "عروض ثقافية", "How it works": "كيف يعمل",
  Admin: "الإدارة", Dashboard: "لوحة التحكم", "Sign out": "تسجيل الخروج", "Sign in": "تسجيل الدخول", "Join as talent": "انضم كفنان",
  "Dubai's AI-powered talent marketplace. Every artist deserves an AI manager.": "سوق المواهب في دبي المدعوم بالذكاء الاصطناعي. كل فنان يستحق مديرًا ذكيًا.",
  Discover: "اكتشف", "Musicians in Dubai": "موسيقيون في دبي", "DJs in Dubai": "منسقو أغاني في دبي", "Variety entertainers": "فنانو الترفيه المتنوع",
  "For talent": "للفنانين", "Create a profile": "أنشئ ملفًا شخصيًا",
  "Prices in AED, incl. 5% VAT where applicable. Demo platform — no real payments.": "الأسعار بالدرهم الإماراتي وتشمل ضريبة القيمة المضافة 5% حيثما ينطبق. منصة تجريبية — لا مدفوعات حقيقية.",
  "Dubai · Abu Dhabi · Sharjah": "دبي · أبوظبي · الشارقة",
  "Book the talent that makes the night.": "احجز الموهبة التي تصنع الليلة.",
  "Verified singers, DJs and cultural acts — with an AI booking agent that quotes you in seconds.": "مطربون ومنسقو أغاني وعروض ثقافية موثقة — مع وكيل حجز ذكي يرسل لك عرض السعر خلال ثوانٍ.",
  Category: "الفئة", Emirate: "الإمارة", "Event type": "نوع المناسبة", "Any event": "أي مناسبة", Search: "بحث",
  "Browse by category": "تصفح حسب الفئة", "Featured in Dubai": "مميزون في دبي", "See all →": "عرض الكل ←",
  "Instant AI quotes": "عروض أسعار فورية بالذكاء الاصطناعي", "Every artist has an AI agent that replies 24/7 using their own prices and rules.": "لكل فنان وكيل ذكي يرد على مدار الساعة بأسعاره وقواعده الخاصة.",
  "Verified talent": "مواهب موثقة", "ID, business and performer badges reviewed by our team before they appear.": "شارات الهوية والرخصة التجارية والأداء يراجعها فريقنا قبل ظهورها.",
  "Real reviews only": "تقييمات حقيقية فقط", "Reviews come exclusively from completed bookings on the platform.": "التقييمات تأتي حصريًا من حجوزات مكتملة على المنصة.",
  "Top Performer": "الأفضل أداءً", Verified: "موثق", bookings: "حجوزات", from: "من",
  Home: "الرئيسية", All: "الكل", "Budget (starting price)": "الميزانية (السعر المبدئي)", "Any budget": "أي ميزانية", "Up to": "حتى",
  Language: "اللغة", "Any language": "أي لغة", "Minimum rating": "الحد الأدنى للتقييم", "Any rating": "أي تقييم",
  "Verified only": "الموثقون فقط", "Top Performers": "الأفضل أداءً", "Areas in": "مناطق في", "artists found": "فنان",
  Recommended: "موصى به", "Highest rated": "الأعلى تقييمًا", "Most booked": "الأكثر حجزًا", "Price: low to high": "السعر: من الأقل للأعلى", "Price: high to low": "السعر: من الأعلى للأقل",
  "No artists match these filters yet. Try widening your search.": "لا يوجد فنانون يطابقون هذه الفلاتر. جرّب توسيع البحث.",
  "Show more": "عرض المزيد", "Frequently asked questions": "الأسئلة الشائعة",
  "How much does it cost to book in Dubai?": "كم تكلفة الحجز في دبي؟",
  "Prices start from each artist's package rate in AED. Request a free quick quote and the artist's AI agent replies with an exact price for your date and venue.": "تبدأ الأسعار من باقة كل فنان بالدرهم. اطلب عرض سعر سريع مجاني وسيرد وكيل الفنان الذكي بسعر دقيق لتاريخك ومكانك.",
  "Are the reviews real?": "هل التقييمات حقيقية؟", "Yes. Only clients with a completed booking on the platform can leave a review.": "نعم. فقط العملاء الذين أكملوا حجزًا على المنصة يمكنهم كتابة تقييم.",
  "Do I need an event permit?": "هل أحتاج إلى تصريح للمناسبة؟",
  "Public events in Dubai may require a DET permit. The organiser is responsible for permits; artists can advise on requirements.": "قد تتطلب الفعاليات العامة في دبي تصريحًا من دائرة الاقتصاد والسياحة. المنظم مسؤول عن التصاريح، ويمكن للفنانين تقديم المشورة.",
  reviews: "تقييمات", travels: "يتنقل حتى", km: "كم", "Track record": "السجل",
  "Calculated from bookings on the platform. The artist chooses which figures to show.": "محسوبة من الحجوزات على المنصة. يختار الفنان الأرقام التي تظهر.",
  About: "نبذة", Packages: "الباقات", min: "دقيقة", Reviews: "التقييمات", "No reviews yet.": "لا توجد تقييمات بعد.",
  "Verified booking": "حجز موثق", "Reply from artist:": "رد الفنان:",
  "Starting from": "يبدأ من", "Free Quick Quote": "عرض سعر سريع مجاني", Date: "التاريخ", Guests: "الضيوف", "Venue area": "منطقة المكان",
  "Budget (AED, optional)": "الميزانية (درهم، اختياري)", "Your name": "اسمك", Email: "البريد الإلكتروني", "Phone (+971…)": "الهاتف (+971…)",
  "Tell the artist about your event": "أخبر الفنان عن مناسبتك", "Get my free quote": "احصل على عرض السعر المجاني", "Assistant is replying…": "المساعد يرد…",
  "An AI assistant replies instantly on behalf of the artist. Contact details stay private until booking.": "يرد مساعد ذكي فورًا نيابة عن الفنان. تبقى بيانات الاتصال خاصة حتى الحجز.",
  "Please enter your name and a valid email.": "يرجى إدخال اسمك وبريد إلكتروني صحيح.", "The artist is unavailable on that date.": "الفنان غير متاح في هذا التاريخ.",
  "Could not send your request. Please try again.": "تعذر إرسال طلبك. حاول مرة أخرى.",
  "Completed bookings": "حجوزات مكتملة", Rating: "التقييم", "Total earned": "إجمالي الأرباح", "Response rate": "معدل الرد", "Repeat clients": "عملاء متكررون", "Member since": "عضو منذ",
  "ID Verified": "هوية موثقة", "Business Verified": "نشاط تجاري موثق", "Verified Performer": "فنان موثق",
  // event types (by English name)
  Wedding: "حفل زفاف", Corporate: "فعالية شركات", "Corporate event": "فعالية شركات", "Birthday": "عيد ميلاد", "Private party": "حفلة خاصة", "Gala dinner": "عشاء رسمي", "Product launch": "إطلاق منتج", Festival: "مهرجان", Ramadan: "رمضان", "Ramadan / Iftar": "رمضان / إفطار", "Hotel & venue": "فندق ومكان", "Yacht party": "حفلة يخت", "National Day": "اليوم الوطني",
};

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (s: string) => string }>({ lang: "en", setLang: () => {}, t: (s) => s });

export function translate(lang: Lang, s: string) {
  return lang === "ar" ? AR[s] ?? s : s;
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    const saved = localStorage.getItem("dm_lang");
    if (saved === "ar") setLangState("ar");
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  const setLang = useCallback((l: Lang) => { localStorage.setItem("dm_lang", l); setLangState(l); }, []);
  const t = useCallback((s: string) => translate(lang, s), [lang]);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

/** Pick the Arabic name from catalog rows when available. */
export const localName = (lang: Lang, row: { name: string; name_ar?: string | null } | null | undefined) =>
  row ? (lang === "ar" && row.name_ar ? row.name_ar : row.name) : "";
