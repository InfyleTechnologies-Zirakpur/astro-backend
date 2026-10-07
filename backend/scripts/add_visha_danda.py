import json

with open(r'C:\Users\chirayu\Downloads\astro_backend\astro_backend\backend\data\astroKnowledgeBase.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# New entries for Visha Danda & Garuda Remedies
new_entries = [
    {
        "id": "27.1",
        "title": "Garuda Invocation & Prana Protection",
        "section": "27. Visha Danda (Poison Combustion) & Garuda Remedies",
        "part": "Panchanga Webinar Transcript",
        "text": "Before beginning any study of poisonous/venomous combinations (Visha), invoke Garuda — the eagle vehicle of Vishnu, devourer of serpents (Sarpas). Garuda represents Prana (life force) removing poisons from the system. Garuda Nyasa (Placement Mantra): Concentrate on forehead (Garuda's beak at center, right wing = Ham, left wing = Shaam). Mantra: Om Ham Om Ham Shaam Om Ham Shaam Om Ham Shaam — Garuda descends from forehead to Anahata (heart center). Then: Ham Garuda Garuda Garuda Garuda Garuda — Garuda flies down to remove snakes/poisons. Garuda Gayatri / Protection Mantra: Om at mouth (beak), Kuru at neck, Kunde at calves, Swaha at feet. Touch each body part while visualizing Garuda's corresponding limb. If written in a Yantra and placed in the home, all Sarpas flee; Kala Sarpa Yoga is broken in that house. Warning: If alcohol or non-vegetarian food is consumed in that house, Garuda may treat the residents as snakes. Japa Count: 700,000 repetitions (6,482 malas ≈ 1 mala/day for 18 years = Rahu's Vimshottari period). Alternatively, complete in 1 year for urgent poison removal.",
        "tokens": ["garuda", "invocation", "prana", "protection", "garuda", "nyasa", "mantra", "ham", "shaam", "anahata", "garuda", "gayatri", "yantra", "kala", "sarpa", "yoga", "japa", "rahu", "vimshottari"]
    },
    {
        "id": "27.2",
        "title": "Visha Danda Definition & Mechanism",
        "section": "27. Visha Danda (Poison Combustion) & Garuda Remedies",
        "part": "Panchanga Webinar Transcript",
        "text": "Visha = poison. Danda = combustion/burning. Visha Danda = body burning due to poison. Poison (Visha) arises from Shaam (left wing of Garuda at forehead chakra). Left wing generates poison. Dangda = burnt by poison. Manifestations: Black spots on skin/face, peculiar burning sensations, internal organ burning. Blood pressure = Visha Danda (internal organs burnt by poison from BP). Alcohol → facial skin burning (cheeks connected to liver). Darkening/spots on cheeks = liver damage severity. Spleen damage → eye region spoilage. Sugar digestion affliction → diabetes from BP. Water system poisoned → poison dissolves in bodily water, damaging the water element. Prolonged → premature death (e.g., Malavya Mahapurusha Yoga promises 80+ years; Visha can cut 10–22 years). Death before allotted time → becomes a Preta (ghost/host) on earth for remaining years.",
        "tokens": ["visha", "danda", "poison", "combustion", "shaam", "garuda", "forehead", "chakra", "dangda", "blood", "pressure", "alcohol", "liver", "spleen", "diabetes", "water", "element", "premature", "death", "malavya", "mahapurusha", "preta"]
    },
    {
        "id": "27.3",
        "title": "Rahu & Retrograde Planets — Reversed View",
        "section": "27. Visha Danda (Poison Combustion) & Garuda Remedies",
        "part": "Panchanga Webinar Transcript",
        "text": "Rahu causes reversed view (upside-down perception). Lagna behaves like 7th house, 7th behaves like Lagna. Result: Native dislikes home, prefers outside; outside feels good, inside feels bad. Retrograde planets behave abnormally — direct planets behave normally (good or bad), retrograde distort. Health application: Poison/toxins (Ama) that should LEAVE the body (urine, stool, sweat, breath) get stuck inside → body generates poison. Trigger: Fire-Water combination (Vara fire + Tithi water mixing) → dangerous poisonous mixture. Panchanga Gandanta and Danda Danda (Agni Danda, Visha Danda) are such combinations. Countries like Sri Lanka, Pakistan destroyed by Agni Danda.",
        "tokens": ["rahu", "retrograde", "reversed", "view", "lagna", "seventh", "house", "ama", "toxins", "fire", "water", "vara", "tithi", "panchanga", "gandanta", "agni", "danda", "sri", "lanka", "pakistan"]
    },
    {
        "id": "27.4",
        "title": "Visha Danda Rule — Tithi Lord as Poison Carrier",
        "section": "27. Visha Danda (Poison Combustion) & Garuda Remedies",
        "part": "Panchanga Webinar Transcript",
        "text": "Core Rule: Strange Rahu/snake energy enters the Tithi Lord. Tithi Lord takes snake-like appearance, flowing through veins → fatal attractions, terrible experiences. Difference from Agni Danda: Agni Danda = fire in Varesha (weekday lord); Visha Danda = poison in Tithi Lord. Table: Visha Danda by Weekday & Tithi — Sunday/Chaturthi/Mercury, Monday/Shashthi/Venus, Tuesday/Saptami/Mars, Wednesday/Ashtami/Moon (Mercury hates Moon: emotional hatred from Tara rape), Thursday/Navami/Rahu (Jupiter hates Rahu: cheating vs Satya), Friday/Dashami/Sun (Venus wants rebirth; Sun angry at endless cycle), Saturday/Ekadashi/Saturn. Observations: Saptami appears twice (Mars + Saturn); Mars missing from table; Rahu is ultimate poison source. Destruction: Rahu destroys mind (Moon) and name/reputation.",
        "tokens": ["visha", "danda", "tithi", "lord", "poison", "carrier", "agni", "danda", "varesha", "weekday", "sunday", "chaturthi", "mercury", "monday", "shashthi", "venus", "tuesday", "saptami", "mars", "wednesday", "ashtami", "moon", "thursday", "navami", "rahu", "jupiter", "friday", "dashami", "sun", "saturday", "ekadashi", "saturn", "mind", "reputation"]
    },
    {
        "id": "27.5.1",
        "title": "Case Study — Donald Sutherland",
        "section": "27. Visha Danda (Poison Combustion) & Garuda Remedies",
        "part": "Panchanga Webinar Transcript",
        "text": "Born Wednesday, Krishna Dvitiya (2nd Tithi). Vara=Mercury, Tithi Lord=Moon → Visha Danda active. Mercury in own sign (Virgo) → body-level results controlled by Rahu (Rahu debilitated, afflicting Mercury & Moon by Drishti). Rahu in 5th house → snake in stomach. Moon strong (Krishna Dvitiya = good light) but Papakartari between Rahu & Saturn afflicting Moon/Tithi Lord. Virgo Lagna → Rahu in 4th = Lagna Khara (destroys intelligence/health). Diseases: Pneumonia, polio, hepatitis, appendectomy, scarlet fever, spinal meningitis (near death). Saviors: Strong Moon; Saturn as Shubhapati (Moon sign lord) in 6th house (protective); Mercury as Lagna/10th lord in 10th.",
        "tokens": ["donald", "sutherland", "wednesday", "krishna", "dvitiya", "mercury", "moon", "virgo", "rahu", "debilitated", "fifth", "house", "papakartari", "saturn", "lagna", "khara", "pneumonia", "polio", "hepatitis", "appendectomy", "scarlet", "fever", "spinal", "meningitis", "shubhapati", "sixth", "house"]
    },
    {
        "id": "27.5.2",
        "title": "Case Study — Jack London",
        "section": "27. Visha Danda (Poison Combustion) & Garuda Remedies",
        "part": "Panchanga Webinar Transcript",
        "text": "Born Wednesday, Vara=Mercury, Tithi Lord=Moon → Visha Danda. Rahu aspects Moon (5th aspect); Rahu = 7th lord Maraka for Taurus Lagna; Rahu debilitated. Karma Amrita Yoga (Rahu start, Ketu end) → building moksha (bad). Moon in 3rd (Aries, Ketu in 5th) → Eclipse Kartari on 4th house (Moon-Ketu one sign apart). Sun in 9th, Rahu in 11th → Solar Eclipse Kartari on 10th. Diseases: Lame, pyorrhea, rectal ulcer, skin (pellagra/psoriasis), kidney disease → suicidal tendencies. Odd diet: raw fish, raw meat sandwiches (Rahu behavior). Died of morphine overdose (Visha Danda death by poison). Wolf House built 1913 (age 38, Ketu period) → burned down (Sun-Rahu Yoga).",
        "tokens": ["jack", "london", "wednesday", "mercury", "moon", "rahu", "taurus", "lagna", "maraka", "karma", "amrita", "yoga", "eclipse", "kartari", "aries", "ketu", "sun", "pyorrhea", "rectal", "ulcer", "pellagra", "psoriasis", "kidney", "suicidal", "raw", "fish", "meat", "morphine", "overdose", "wolf", "house"]
    },
    {
        "id": "27.5.3",
        "title": "Case Study — Wladimir Köppen (Climatologist)",
        "section": "27. Visha Danda (Poison Combustion) & Garuda Remedies",
        "part": "Panchanga Webinar Transcript",
        "text": "Born Thursday, Ashtami → Visha Danda in Tithi Lord = Rahu. Rahu in Pisces (exalted/excellent) → ocean absorbs/cleans poisons. Rahu = 9th lord → work = poisoning of world (climate, pollution). Jupiter in Lagna (Bhava Pushkara) → knowledge to combat poison. Ketu in Makara (MKS) = end of Kala Amrita Yoga, dispositor of Rahu → destroys poison. Saturn + Ketu control Rahu → long life, survived poison.",
        "tokens": ["wladimir", "koppen", "climatologist", "thursday", "ashtami", "rahu", "pisces", "exalted", "ninth", "lord", "climate", "pollution", "jupiter", "lagna", "bhava", "pushkara", "ketu", "makara", "mks", "kala", "amrita", "yoga", "dispositor", "saturn", "long", "life"]
    },
    {
        "id": "27.5.4",
        "title": "Case Study — World Trade Center Opening (4 April 1973)",
        "section": "27. Visha Danda (Poison Combustion) & Garuda Remedies",
        "part": "Panchanga Webinar Transcript",
        "text": "Opened Wednesday, Dvitiya → Worst Visha Danda (Wednesday + Dvitiya = Moon poison). Moon in Aries (Bhava), aspected by Rahu (5th aspect), Rahu = 7th lord Maraka, Rahu debilitated. Kala Amrita Yoga → building destined for moksha (destruction). Moon in Ashwini (Ketu nakshatra), Ketu debilitated → trouble from overseas (Ketu = vertical/aircraft), height, Mercury sign (aircraft). Jupiter debilitated → security fails. Attack timing (9/11): Mars-Ketu in 4th over natal Rahu → Nodal Reversal (Rahu/Ketu exchange positions = karma catching up). Saturn return. Moon in Gemini. Guru-Chandala Yoga.",
        "tokens": ["world", "trade", "center", "opening", "wednesday", "dvitiya", "moon", "aries", "rahu", "maraka", "debilitated", "kala", "amrita", "yoga", "ashwini", "ketu", "nakshatra", "overseas", "aircraft", "jupiter", "debilitated", "security", "nodal", "reversal", "saturn", "return", "gemini", "guru", "chandala"]
    },
    {
        "id": "27.6",
        "title": "Ashta Naga — Eight Naga Kings for Propitiation",
        "section": "27. Visha Danda (Poison Combustion) & Garuda Remedies",
        "part": "Panchanga Webinar Transcript",
        "text": "When poison-generating planet is known, propitiate the corresponding Naga king (from Garuda Purana): Sun → Ashtanaga; Moon → Phanipa/Vasukhi; Mars → Takshaka (most violent, fights Garuda equally); Mercury → Karkotaka; Jupiter → Padma Naga; Venus → Mahapadma/Shankhapala; Saturn → Shankapala/Kulika; Rahu → Kulika. Alternative: Strong Jupiter → pray to Garuda directly (Jupiter = Garuda Vahana or elephant crushing snakes). Based on native's birth Tithi, worship the corresponding Naga.",
        "tokens": ["ashta", "naga", "eight", "naga", "kings", "propitiation", "garuda", "purana", "sun", "ashtanaga", "moon", "phanipa", "vasukhi", "mars", "takshaka", "mercury", "karkotaka", "jupiter", "padma", "naga", "venus", "mahapadma", "shankhapala", "saturn", "rahhu", "kulika", "garuda", "vahana", "birth", "tithi"]
    },
    {
        "id": "27.7",
        "title": "Additional Remedies — Dreams, Arudha, Garuda Activation",
        "section": "27. Visha Danda (Poison Combustion) & Garuda Remedies",
        "part": "Panchanga Webinar Transcript",
        "text": "Sarpa in Dreams / Nightmares: Om Pakshi Swaha (3 malas) upon waking. Arudha Check: Examine Arudha of 6th house (Rahu's Moolatrikona = Virgo/6th) and 3rd house (Rahu's Exaltation = Gemini/3rd) for poison entry. Garuda Activation (Fighting Mantra): 1. Meditate: Garudoham (I am Garuda) — feel Garuda in Anahata. 2. Mantra: Om Rim Ram Rim Varunaya Swaha × 100,000 japa. 3. Once awakened, recite in ears of patient/place → poison leaves body. Shiva Remedy: For active poison generation (e.g., existing BP/disease) → Shiva worship (Somnath, Om Namah Shivaya) — Shiva drinks poison. Garuda Remedy: For prevention (young charts) → Garuda eats snakes for breakfast. Remedy Hierarchy: 1. Prevention: Garuda Mantra + Nyasa + Yantra. 2. Active Poison: Shiva worship. 3. Emergency/Severe: Garuda Activation Mantra + Garudoham meditation. 4. Dream/Sleep Disturbance: Om Pakshi Swaha × 3 malas.",
        "tokens": ["sarpa", "dreams", "nightmares", "om", "pakshi", "swaha", "arudha", "sixth", "house", "moolatrikona", "virgo", "third", "house", "exaltation", "gemini", "garuda", "activation", "fighting", "mantra", "garudoham", "anahata", "rim", "ram", "varunaya", "japa", "shiva", "somnath", "namah", "shivaya", "prevention", "yantra", "emergency"]
    },
    {
        "id": "28.1",
        "title": "Visha Danda Identification",
        "section": "28. Key Principles Summary — Visha Danda & Garuda",
        "part": "Panchanga Webinar Transcript",
        "text": "Check Panchanga: Weekday (Vara) + Tithi combination from table in 27.4. If match found → Tithi Lord becomes poison carrier. Check if Tithi Lord is afflicted (Rahu aspect, Papakartari, debilitation, enemy sign).",
        "tokens": ["visha", "danda", "identification", "panchanga", "weekday", "vara", "tithi", "combination", "tithi", "lord", "poison", "carrier", "rahu", "aspect", "papakartari", "debilitation", "enemy", "sign"]
    },
    {
        "id": "28.2",
        "title": "Severity Factors",
        "section": "28. Key Principles Summary — Visha Danda & Garuda",
        "part": "Panchanga Webinar Transcript",
        "text": "Rahu aspecting Tithi Lord → severe poison. Tithi Lord in own sign → shifts poison to Rahu (body level). Papakartari on Tithi Lord/Moon → extreme suffering. 6th house Saturn (Shubhapati) + strong Moon/Lagna lord = protection/survival.",
        "tokens": ["severity", "factors", "rahu", "aspecting", "tithi", "lord", "severe", "poison", "own", "sign", "shifts", "body", "level", "papakartari", "moon", "extreme", "suffering", "sixth", "house", "saturn", "shubhapati", "strong", "lagna", "protection", "survival"]
    },
    {
        "id": "28.3",
        "title": "Remedy Hierarchy",
        "section": "28. Key Principles Summary — Visha Danda & Garuda",
        "part": "Panchanga Webinar Transcript",
        "text": "1. Prevention (no active disease): Garuda Mantra + Nyasa + Yantra in home. 2. Active Poison (disease present): Shiva worship (Somnath, Om Namah Shivaya) — Shiva drinks poison. 3. Emergency/Severe: Garuda Activation Mantra (Om Rim Ram Rim Varunaya Swaha 100k) + Garudoham meditation. 4. Dream/Sleep Disturbance: Om Pakshi Swaha × 3 malas.",
        "tokens": ["remedy", "hierarchy", "prevention", "garuda", "mantra", "nyasa", "yantra", "home", "active", "poison", "disease", "shiva", "worship", "somnath", "namah", "shivaya", "emergency", "garuda", "activation", "rim", "ram", "varunaya", "garudoham", "meditation", "dream", "sleep", "disturbance", "pakshi", "mala"]
    },
    {
        "id": "28.4",
        "title": "Panchanga Seriousness",
        "section": "28. Key Principles Summary — Visha Danda & Garuda",
        "part": "Panchanga Webinar Transcript",
        "text": "Panchanga = limbs of time. If time (Kala) is angry, no one can stop it. Must rush to Shiva/Garuda before it's too late. Laziness in checking Panchanga flows = nations/people suffer needlessly.",
        "tokens": ["panchanga", "seriousness", "limbs", "time", "kala", "angry", "shiva", "garuda", "laziness", "checking", "flows", "nations", "people", "suffer", "needlessly"]
    }
]

data.extend(new_entries)

with open(r'C:\Users\chirayu\Downloads\astro_backend\astro_backend\backend\data\astroKnowledgeBase.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Added {len(new_entries)} new entries. Total: {len(data)}")