export type ArabCountry = {
  code: string; // ISO
  dial: string; // dial code without +
  ar: string;
  en: string;
};

export const ARAB_COUNTRIES: ArabCountry[] = [
  { code: "EG", dial: "20", ar: "مصر", en: "Egypt" },
  { code: "SA", dial: "966", ar: "السعودية", en: "Saudi Arabia" },
  { code: "AE", dial: "971", ar: "الإمارات", en: "United Arab Emirates" },
  { code: "KW", dial: "965", ar: "الكويت", en: "Kuwait" },
  { code: "QA", dial: "974", ar: "قطر", en: "Qatar" },
  { code: "BH", dial: "973", ar: "البحرين", en: "Bahrain" },
  { code: "OM", dial: "968", ar: "عُمان", en: "Oman" },
  { code: "YE", dial: "967", ar: "اليمن", en: "Yemen" },
  { code: "JO", dial: "962", ar: "الأردن", en: "Jordan" },
  { code: "PS", dial: "970", ar: "فلسطين", en: "Palestine" },
  { code: "LB", dial: "961", ar: "لبنان", en: "Lebanon" },
  { code: "SY", dial: "963", ar: "سوريا", en: "Syria" },
  { code: "IQ", dial: "964", ar: "العراق", en: "Iraq" },
  { code: "SD", dial: "249", ar: "السودان", en: "Sudan" },
  { code: "LY", dial: "218", ar: "ليبيا", en: "Libya" },
  { code: "TN", dial: "216", ar: "تونس", en: "Tunisia" },
  { code: "DZ", dial: "213", ar: "الجزائر", en: "Algeria" },
  { code: "MA", dial: "212", ar: "المغرب", en: "Morocco" },
  { code: "MR", dial: "222", ar: "موريتانيا", en: "Mauritania" },
  { code: "SO", dial: "252", ar: "الصومال", en: "Somalia" },
  { code: "DJ", dial: "253", ar: "جيبوتي", en: "Djibouti" },
  { code: "KM", dial: "269", ar: "جزر القمر", en: "Comoros" },
];

export function dialForCountry(name: string): string {
  if (!name) return "20";
  const n = name.trim().toLowerCase();
  const found = ARAB_COUNTRIES.find(
    (c) => c.ar === name || c.en.toLowerCase() === n || c.code.toLowerCase() === n,
  );
  return found?.dial ?? "20";
}
