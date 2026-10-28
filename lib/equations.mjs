// Basal metabolic rate in kcal per day. Shared by the browser and the tests.
// Linear rows are [constant, per kg, per cm, per year].
const LINEAR = {
  mifflinStJeor: { male: [5, 10, 6.25, -5], female: [-161, 10, 6.25, -5] },
  harrisBenedict: { male: [88.362, 13.397, 4.799, -5.677], female: [447.593, 9.247, 3.098, -4.33] },
};
// Henry 2005 (Oxford), weight only, MJ per day. Rows are [from age, per kg, constant].
const OXFORD = {
  male: [[18, 0.0669, 2.28], [30, 0.0592, 2.48], [60, 0.0563, 2.15]],
  female: [[18, 0.0546, 2.33], [30, 0.0407, 2.9], [60, 0.0424, 2.38]],
};
const KCAL_PER_MJ = 239.006;

const num = (name, v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new TypeError(`${name} must be a number`);
  return n;
};

export function bmr({ sex, ageYears, weightKg, heightCm, bodyFatPct }) {
  if (sex !== 'male' && sex !== 'female') throw new TypeError('sex must be "male" or "female"');
  const a = num('ageYears', ageYears);
  const w = num('weightKg', weightKg);
  const h = num('heightCm', heightCm);
  const fat = bodyFatPct == null || bodyFatPct === '' ? null : num('bodyFatPct', bodyFatPct);

  const raw = { harrisBenedict: null, mifflinStJeor: null, cunningham: null, oxford: null };
  if (a >= 18) {
    for (const [key, rows] of Object.entries(LINEAR)) {
      const [c, kw, kh, ka] = rows[sex];
      raw[key] = c + kw * w + kh * h + ka * a;
    }
    const [, kw, c] = OXFORD[sex].findLast(([from]) => a >= from);
    raw.oxford = (kw * w + c) * KCAL_PER_MJ;
    if (fat != null) raw.cunningham = 500 + 22 * w * (1 - fat / 100);
  }
  const round = (v) => (v == null ? null : Math.round(v));
  return {
    harrisBenedict: round(raw.harrisBenedict),
    mifflinStJeor: round(raw.mifflinStJeor),
    cunningham: round(raw.cunningham),
    oxford: round(raw.oxford),
    raw,
  };
}
