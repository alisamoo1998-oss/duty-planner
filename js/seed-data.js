// قائمة الأفراد الأولية (18 فردًا) — بيانات فقط بلا اعتماديات.
// الترتيب ثابت: يُشتق منه معرّف كل سجل (p_seed_01 ... p_seed_18).
export const SEED_PEOPLE = [
  { name: "بن ناصر", isDriver: false },
  { name: "عقون", isDriver: false },
  { name: "بوثلجة", isDriver: false },
  { name: "فقير", isDriver: true },
  { name: "خدام", isDriver: true },
  { name: "غربي", isDriver: false },
  { name: "حميدي", isDriver: false },
  { name: "دبزة", isDriver: false },
  { name: "بن مهيدي", isDriver: false },
  { name: "شيتور", isDriver: false },
  { name: "مرزوقي", isDriver: true },
  { name: "غنانوة", isDriver: false },
  { name: "عيدة", isDriver: true },
  { name: "سيش", isDriver: false },
  { name: "فلاح", isDriver: true },
  { name: "شيباني", isDriver: false },
  { name: "جريدي", isDriver: false },
  { name: "رويسي", isDriver: false },
];

export const SEED_MARKER_KEY = "initialSeed"; // settings/initialSeed
export const seedPersonId = (index) => `p_seed_${String(index + 1).padStart(2, "0")}`;
