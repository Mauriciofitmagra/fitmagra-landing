import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bmr } from '../lib/equations.mjs';

const man = { sex: 'male', ageYears: 30, weightKg: 80, heightCm: 180 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} != ${expected}`);

test('Mifflin-St Jeor, male 80 kg 180 cm 30 y', () => {
  assert.equal(bmr(man).raw.mifflinStJeor, 1780);
  assert.equal(bmr(man).mifflinStJeor, 1780);
});

test('Mifflin-St Jeor, female 60 kg 165 cm 30 y', () => {
  close(bmr({ sex: 'female', ageYears: 30, weightKg: 60, heightCm: 165 }).raw.mifflinStJeor, 1320.25);
});

test('Harris-Benedict revised 1984, male 80 kg 180 cm 30 y', () => {
  close(bmr(man).raw.harrisBenedict, 1853.632);
  assert.equal(bmr(man).harrisBenedict, 1854);
});

test('Cunningham 1980, 80 kg at 20 % fat', () => {
  close(bmr({ ...man, bodyFatPct: 20 }).raw.cunningham, 1908);
});

test('Oxford (Henry 2005), male 30 to 60, 80 kg', () => {
  close(bmr(man).raw.oxford, 1724.67);
  assert.equal(bmr(man).oxford, 1725);
});

test('Cunningham without body fat is null', () => {
  assert.equal(bmr(man).cunningham, null);
  assert.equal(bmr({ ...man, bodyFatPct: '' }).cunningham, null);
});

test('under 18 returns null for every equation', () => {
  const r = bmr({ ...man, ageYears: 17, bodyFatPct: 20 });
  assert.deepEqual([r.harrisBenedict, r.mifflinStJeor, r.cunningham, r.oxford], [null, null, null, null]);
});

test('non-numeric input throws', () => {
  assert.throws(() => bmr({ ...man, weightKg: 'abc' }), TypeError);
  assert.throws(() => bmr({ ...man, sex: 'x' }), TypeError);
});
