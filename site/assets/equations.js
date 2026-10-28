import { bmr } from './equations.mjs';

const section = document.getElementById('metodo');
const form = section.querySelector('.eq-form');
const outputs = section.querySelectorAll('output[data-eq]');
const { needsFat, adultsOnly, empty, lang } = section.dataset;
const format = new Intl.NumberFormat(lang === 'es' ? 'es-CO' : 'en-US');

function render() {
  const data = Object.fromEntries(new FormData(form));
  let result = null;
  try { if (form.checkValidity()) result = bmr(data); } catch { /* an empty or partial field: show the prompt */ }
  const adult = Number(data.ageYears) >= 18;
  for (const out of outputs) {
    const value = result?.[out.dataset.eq];
    out.textContent = value != null ? format.format(value)
      : !result ? (Number(data.ageYears) > 0 && !adult ? adultsOnly : empty)
      : !adult ? adultsOnly
      : needsFat;
    out.classList.toggle('eq-missing', value == null);
  }
}

form.hidden = false;
section.querySelector('.eq-results').hidden = false;
section.querySelector('.formulas').remove();
form.addEventListener('input', render);
render();
