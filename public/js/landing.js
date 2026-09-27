(() => {
  const story = document.querySelector('.story');
  if (!story) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const chapters = [...document.querySelectorAll('.chapter')];
  const screens = [...document.querySelectorAll('.demo-screen')];
  const marks = [...document.querySelectorAll('.story-progress span')];
  const reveals = [...document.querySelectorAll('[data-reveal]')];
  let frame = 0;
  let active = -1;
  let observer;
  const clamp = n => Math.max(0, Math.min(1, n));
  function render() {
    frame = 0;
    if (reduced.matches) return;
    const rect = story.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    const progress = clamp(-rect.top / Math.max(1, story.offsetHeight - innerHeight));
    const index = Math.min(2, Math.floor(progress * 3));
    if (active !== index) {
      active = index;
      chapters.forEach((el, i) => { el.classList.toggle('is-current', i === index); el.setAttribute('aria-hidden', String(i !== index)); });
      screens.forEach((el, i) => el.classList.toggle('is-current', i === index));
      marks.forEach((el, i) => el.classList.toggle('active', i === index));
    }
    story.style.setProperty('--phone-rotation', (-5 + progress * 10).toFixed(2) + 'deg');
    story.style.setProperty('--phone-y', (-Math.sin(progress * Math.PI) * 16).toFixed(2) + 'px');
    story.style.setProperty('--phone-scale', (1 + Math.sin(progress * Math.PI) * .035).toFixed(3));
    story.style.setProperty('--note-y', (progress * -25).toFixed(2) + 'px');
  }
  function schedule() { if (!frame && !reduced.matches) frame = requestAnimationFrame(render); }
  function configure() {
    document.documentElement.classList.toggle('motion-enabled', !reduced.matches);
    observer?.disconnect();
    active = -1;
    if (reduced.matches) {
      chapters.forEach(el => el.removeAttribute('aria-hidden'));
      reveals.forEach(el => el.classList.add('is-visible'));
    } else {
      observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
      }), { threshold: .12 });
      reveals.forEach(el => observer.observe(el));
      schedule();
    }
  }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  reduced.addEventListener('change', configure);
  configure();
  // GIS may finish loading after the local auth controller has initialized.
  document.querySelector('script[src*="accounts.google.com/gsi/client"]')?.addEventListener('load', () => {
    const button = document.getElementById('googleSignInButton');
    if (!button || button.childElementCount || !window.handleGoogleLoginResponse) return;
    google.accounts.id.initialize({ client_id: '186015897078-3qtjge4dbi3e6sjvp4e4lbulolipioug.apps.googleusercontent.com', callback: window.handleGoogleLoginResponse });
    google.accounts.id.renderButton(button, { theme: 'outline', size: 'large', width: Math.min(340, button.parentElement.clientWidth) });
    if (button.childElementCount) document.getElementById('googleFallbackContainer')?.classList.add('hidden');
  });
})();
