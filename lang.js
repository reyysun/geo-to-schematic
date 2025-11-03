async function getSupportedLangs() {
  try {
    // Чтение index.json и получение всех доступных языков
    const response = await fetch('lang/index.json');
    const data = await response.json();
    return data.languages;
  } catch {
    return ['en'];
  }
}

async function loadLanguage(langCode) {
  console.log(langCode)
  try {
    const response = await fetch(`lang/${langCode}.json`);
    const translations = await response.json();

    // Пробегаем по всем элементам с data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[key]) {
        el.innerHTML = translations[key]; // используем innerHTML, т.к. есть <b>
      }
    });

    // Сохраняем выбор языка в localStorage
    localStorage.setItem('lang', langCode);
  } catch (err) {
    console.error(`Error loading language file: ${langCode}`, err);
  }
}

// При загрузке страницы подгружаем последний выбранный язык
window.addEventListener('DOMContentLoaded', async () => {
  const supportedLangs = await getSupportedLangs();

  // Контейнер для кнопок
  const langContainer = document.getElementById('lang-switcher');
  langContainer.innerHTML = '';

  // Динамическое создание кнопок на основе языков которые есть в supportedLangs
  supportedLangs.forEach(lang => {
    const btn = document.createElement('button');
    btn.textContent = lang.toUpperCase();
    btn.id = `lang-${lang}`;
    btn.className = 'nicebutton langbutton';
    btn.addEventListener('click', () => loadLanguage(lang));
    langContainer.appendChild(btn);
  });

  // Берем язык, сохраненный в localstorage
  let savedLang = localStorage.getItem('lang');
  if (!savedLang) {
    // если его нет, то берем язык браузера
    console.log('loading language from navigator.language')
    const browserLang = navigator.language.split('-')[0]; // "en-US" -> "en"
    savedLang = supportedLangs.includes(browserLang) ? browserLang : 'en';
  }

  // Загружаем выбранный язык
  await loadLanguage(savedLang);
});