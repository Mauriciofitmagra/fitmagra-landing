if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches && 'IntersectionObserver' in window) {
  const elements = document.querySelectorAll('main h1, main h2, main h3, main p, main figure, main form, main table, main li, main video, main .back-home, footer .footer-grid > *');
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.remove('slide-waiting');
        observer.unobserve(entry.target);
      }
    }
  });
  for (const element of elements) {
    if (element.parentElement.closest('figure, li, form')) continue;
    element.classList.add('slide-managed');
    const rect = element.getBoundingClientRect();
    if (rect.top >= window.innerHeight || rect.bottom <= 0) element.classList.add('slide-waiting');
    observer.observe(element);
  }
}
