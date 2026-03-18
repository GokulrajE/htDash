// Language translations for exercises
// Add new languages as needed

const exerciseTranslations = {
  english: {
    // Header translations
    adlPrescription: "ADL Exercise Prescription",
    vcgPrescription: "VCG Exercise Prescription",
    patientId: "Patient ID",
    date: "Date",
    totalExercises: "Total Exercises",
    prescribedOn: "Prescribed On",
    exercises: "Exercises",
    exercise: "Exercise",
    sets: "Sets",
    reps: "Reps",
    description: "Description",
    instructions: "Instructions",
    video: "Video",
    scanQRCode: "Scan QR Code to watch video",
    prescribedBy: "Prescribed by: Healthcare Provider",
    note: "Note: Perform exercises as prescribed. Stop if pain occurs.",
    dosage: "Dosage",
    duration: "Duration",
    frequency: "Frequency",
    side: "Side",
    right: "Right",
    left: "Left",
    both: "Both",
    // Common
    loading: "Loading...",
    noExercises: "No exercises found",
    selectLanguage: "Select Language",
    print: "Print",
    cancel: "Cancel",
  },
  tamil: {
    // Header translations
    adlPrescription: "ADL உடற்பயிற்சி பரிந்துரை",
    vcgPrescription: "VCG உடற்பயிற்சி பரிந்துரை",
    patientId: "நோயாளி ID",
    date: "தேதி",
    totalExercises: "மொத்த உடற்பயிற்சிகள்",
    prescribedOn: "பரிந்துரைத்த தேதி",
    exercises: "உடற்பயிற்சிகள்",
    exercise: "உடற்பயிற்சி",
    sets: "செட்கள்",
    reps: "மீண்டும்",
    description: "விளக்கம்",
    instructions: "வழிமுறைகள்",
    video: "வீடியோ",
    scanQRCode: "QR குறியீட்டை ஸ்கேன் செய்து வீடியோவைக் காண்க",
    prescribedBy: "பரிந்துரைத்தவர்: சுகாதார நிபுணர்",
    note: "குறிப்பு: பரிந்துரைக்கப்பட்டபடி உடற்பயிற்சிகளைச் செய்க. வலி ஏற்பட்டால் நிறுத்தவும்.",
    dosage: "டோஸ்",
    duration: "நேரம்",
    frequency: "அதிர்வு",
    side: "பக்கம்",
    right: "வலது",
    left: "இடது",
    both: "இரண்டும்",
    // Common
    loading: "ஏற்றுகிறது...",
    noExercises: "உடற்பயிற்சிகள் இல்லை",
    selectLanguage: "மொழியைத் தேர்ந்தெடுக்க",
    print: " அச்சிடு",
    cancel: "ரத்து",
  },
  hindi: {
    // Header translations
    adlPrescription: "ADL व्यायाम नुस्खा",
    vcgPrescription: "VCG व्यायाम नुस्खा",
    patientId: "मरीज ID",
    date: "तारीख",
    totalExercises: "कुल व्यायाम",
    prescribedOn: "निर्धारित तारीख",
    exercises: "व्यायाम",
    exercise: "व्यायाम",
    sets: "सेट्स",
    reps: "रेप्स",
    description: "विवरण",
    instructions: "निर्देश",
    video: "वीडियो",
    scanQRCode: "वीडियो देखने के लिए QR कोड स्कैन करें",
    prescribedBy: "निर्धारित करने वाले: स्वास्थ्य विशेषज्ञ",
    note: "नोट: निर्धारित व्यायाम करें। दर्द होने पर रुकें।",
    dosage: "खुराक",
    duration: "अवधि",
    frequency: "आवृत्ति",
    side: "पक्ष",
    right: "दाएं",
    left: "बाएं",
    both: "दोनों",
    // Common
    loading: "लोड हो रहा है...",
    noExercises: "कोई व्यायाम नहीं मिला",
    selectLanguage: "भाषा चुनें",
    print: "प्रिंट",
    cancel: "रद्द करें",
  },
  telugu: {
    // Header translations
    adlPrescription: "ADL వ్యాయామం ప్రిస్క్రిప్షన్",
    vcgPrescription: "VCG వ్యాయామం ప్రిస్క్రిప్షన్",
    patientId: "రోగి ID",
    date: "తేదీ",
    totalExercises: "మొత్తం వ్యాయామాలు",
    prescribedOn: "బహుళ జరిగే",
    exercises: "వ్యాయామాలు",
    exercise: "व्यायाम",
    sets: "సెట్‌లు",
    reps: "रेप्स",
    description: "వివరణ",
    instructions: "సూచనలు",
    video: "वीडियो",
    scanQRCode: "QR కోడ్‌ను 스캔하여 비디오를 시청하세요",
    prescribedBy: " Prescription: ",
    note: " Note: Prescribed exercises. Stop if pain.",
    dosage: "Dosage",
    duration: "Duration",
    frequency: "Frequency",
    side: "Side",
    right: "Right",
    left: "Left",
    both: "Both",
    // Common
    loading: "Loading...",
    noExercises: "No exercises",
    selectLanguage: "Select Language",
    print: "Print",
    cancel: "Cancel",
  }
};

// Exercise translations by exercise ID
const exerciseNameTranslations = {
  english: {
    // ADL Exercises
    "sit_to_stand": "Sit to Stand",
    "sit_to_stand_desc": "Starting from a seated position, stand up fully without assistance.",
    "heel_raise": "Heel Raise",
    "heel_raise_desc": "Rise up on your heels while standing, then lower back down.",
    "toe_raise": "Toe Raise",
    "toe_raise_desc": "Rise up on your toes while standing, then lower back down.",
    "single_leg_stand": "Single Leg Stand",
    "single_leg_stand_desc": "Stand on one leg while holding support if needed.",
    "tandem_stance": "Tandem Stance",
    "tandem_stance_desc": "Stand with one foot directly in front of the other.",
    "side_walk": "Side Walk",
    "side_walk_desc": "Walk sideways with controlled steps.",
    // VCG Exercises
    "ankle_dorsiflexion": "Ankle Dorsiflexion",
    "ankle_dorsiflexion_desc": "Move foot upward at the ankle joint.",
    "ankle_plantarflexion": "Ankle Plantarflexion",
    "ankle_plantarflexion_desc": "Point toes downward at the ankle joint.",
    "ankle_inversion": "Ankle Inversion",
    "ankle_inversion_desc": "Turn foot inward at the ankle.",
    "ankle_eversion": "Ankle Eversion",
    "ankle_eversion_desc": "Turn foot outward at the ankle.",
  },
  tamil: {
    // ADL Exercises
    "sit_to_stand": "அமர்ந்து எழுக",
    "sit_to_stand_desc": "அமர்ந்த நிலையில், உதவியின்றி முழுவதுமாக எழும்புக.",
    "heel_raise": "முதுகெலும்பு உயர்த்தல்",
    "heel_raise_desc": "நின்றபடி உங்கள் முதுகெலும்பை உயர்த்தி, மீண்டும் கீழே இறக்குக.",
    "toe_raise": "கீல் உயர்த்தல்",
    "toe_raise_desc": "நின்றபடி உங்கள் கால்முனைகளை உயர்த்தி, மீண்டும் கீழே இறக்குக.",
    "single_leg_stand": "ஒரு கால் நிற்க",
    "single_leg_stand_desc": "தேவைப்படலாமென்று ஒரு கைப் பிடித்தபடி ஒரு கால்மீது நில்.",
    "tandem_stance": "இரட்டை நிற்க",
    "tandem_stance_desc": "ஒரு கால் முன் மற்ற காலுக்கு முன் வைத்து நில்.",
    "side_walk": "பக்கமாக நடக்க",
    "side_walk_desc": "கட்டுப்படுத்தப்பட்ட அடிகளுடன் பக்கமாக நடக்க.",
    // VCG Exercises
    "ankle_dorsiflexion": "கணுக்கால் மேல் வளைதல்",
    "ankle_dorsiflexion_desc": "கணு மூட்டில் காலை மேல் நகர்த்தவும்.",
    "ankle_plantarflexion": "கணுக்கால் கீழ் வளைதல்",
    "ankle_plantarflexion_desc": "கணு மூட்டில் கால்முனையை கீழ் நோக்கி திருப்பவும்.",
    "ankle_inversion": "கணுக்கால் உள் திருப்பல்",
    "ankle_inversion_desc": "கணு மூட்டில் காலை உள்ளே திருப்பவும்.",
    "ankle_eversion": "கணுக்கால் வெளி திருப்பல்",
    "ankle_eversion_desc": "கணு மூட்டில் காலை வெளியே திருப்பவும்.",
  },
  hindi: {
    // ADL Exercises
    "sit_to_stand": "बैठकर खड़े हो",
    "sit_to_stand_desc": "बैठी हुई स्थिति से बिना मदद के पूरी तरह खड़े हों।",
    "heel_raise": "हील उठाना",
    "heel_raise_desc": "खड़े होकर अपनी एड़ियों को उठाएं, फिर वापस नीचे लाएं।",
    "toe_raise": "टो उठाना",
    "toe_raise_desc": "खड़े होकर अपने पैर की उंगलियों को उठाएं, फिर वापस नीचे लाएं।",
    "single_leg_stand": "एक पैर पर खड़े रहना",
    "single_leg_stand_desc": "जरूरत पड़ने पर सहारा पकड़कर एक पैर पर खड़े रहें।",
    "tandem_stance": "टैंडम स्टांस",
    "tandem_stance_desc": "एक पैर को दूसरे पैर के सामने रखकर खड़े हों।",
    "side_walk": "साइड वॉक",
    "side_walk_desc": "नियंत्रित कदमों के साथ बगल में चलें।",
    // VCG Exercises
    "ankle_dorsiflexion": "टखना ऊपर उठाना",
    "ankle_dorsiflexion_desc": "टखने के जोड़ पर पैर को ऊपर की ओर ले जाएं।",
    "ankle_plantarflexion": "टखना नीचे मोड़ना",
    "ankle_plantarflexion_desc": "टखने के जोड़ पर पैर की उंगलियों को नीचे की ओर मोड़ें।",
    "ankle_inversion": "टखना अंदर मोड़ना",
    "ankle_inversion_desc": "टखने के जोड़ पर पैर को अंदर की ओर मोड़ें।",
    "ankle_eversion": "टखना बाहर मोड़ना",
    "ankle_eversion_desc": "टखने के जोड़ पर पैर को बाहर की ओर मोड़ें।",
  },
  telugu: {
    // ADL Exercises
    "sit_to_stand": "కూర్చో నిలబడు",
    "sit_to_stand_desc": "కూర్చున్న sthanam lo, sahaayakamga nilabaduthunna.",
    "heel_raise": " gaita prathi",
    "heel_raise_desc": "Nuvvu nilthunappudu nijangaa gurtukuni, maa paiga ki korika.",
    // VCG Exercises
    "ankle_dorsiflexion": "Kallu mechata",
    "ankle_dorsiflexion_desc": "Kallu joint lo paada meeda eskondi.",
    "ankle_plantarflexion": "Kallu tapta",
    "ankle_plantarflexion_desc": "Kallu joint lo paada ki jana eskondi.",
  }
};

// Get translation for a key
function t(key, lang = 'english') {
  const translations = exerciseTranslations[lang] || exerciseTranslations.english;
  return translations[key] || exerciseTranslations.english[key] || key;
}

// Get exercise name translation
function getExerciseName(exerciseId, lang = 'english') {
  const translations = exerciseNameTranslations[lang] || exerciseNameTranslations.english;
  return translations[exerciseId] || exerciseId;
}

// Get exercise description translation
function getExerciseDescription(exerciseId, lang = 'english') {
  const translations = exerciseNameTranslations[lang] || exerciseNameTranslations.english;
  const descKey = exerciseId + "_desc";
  return translations[descKey] || "";
}

// Available languages
const availableLanguages = [
  { code: 'english', name: 'English' },
  { code: 'tamil', name: 'தமிழ்' },
  { code: 'hindi', name: 'हिन्दी' },
  { code: 'telugu', name: 'తెలుగు' }
];
