// Ayanamsha: the offset between the tropical zodiac (used by astronomy-engine
// and Western astrology) and the sidereal zodiac (used by Vedic/Jyotish
// astrology).
//
// True sidereal longitude = tropical longitude - ayanamsha
//
// We use the Lahiri (Chitra Paksha) ayanamsha, the de facto standard in
// Indian astrological software (JHora, Parashara's Light, etc.), via the
// standard linear approximation anchored at J2000.0. This is a well-established
// approximation (accurate to within a few arcseconds over multi-century ranges)
// rather than the full IAU precession-nutation model.
//
// NOTE: The course summary (Rule 1.1) lists "Chandra Hari" ayanamsha among the
// source lecture's stated Jagannatha Hora settings, but the lecturer himself
// states elsewhere (transcript §41) that ayanamsha is one and only one —
// Chitrapaksha — and that named variants are false. Chitrapaksha IS what Lahiri
// implements, so we keep Lahiri here in line with the teacher's spoken rule.

const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0); // Jan 1 2000, 12:00 UTC
const LAHIRI_AYANAMSHA_AT_J2000 = 23.85333333; // degrees (~23°51.2')
const PRECESSION_RATE_DEG_PER_YEAR = 50.2388475 / 3600; // arcsec/year -> deg/year

const getAyanamsha = (date) => {
  const daysSinceJ2000 = (date.getTime() - J2000) / (1000 * 60 * 60 * 24);
  const yearsSinceJ2000 = daysSinceJ2000 / 365.25;
  return LAHIRI_AYANAMSHA_AT_J2000 + yearsSinceJ2000 * PRECESSION_RATE_DEG_PER_YEAR;
};

const toSidereal = (tropicalLongitude, date) => {
  const ayanamsha = getAyanamsha(date);
  return ((tropicalLongitude - ayanamsha) % 360 + 360) % 360;
};

module.exports = { getAyanamsha, toSidereal };
