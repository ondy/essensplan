const DAYS_LABELS = {
  '-2': 'Vorgestern',
  '-1': 'Gestern',
  0: 'Heute',
  1: 'Morgen',
  2: 'Übermorgen',
};

const meals = ['Frühstück', 'Mittagessen', 'Abendessen'];

const dayContainer = document.getElementById('days');
const todayLabel = document.getElementById('today-label');

const weekdayFormatter = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
});

function formatDate(date, includeYear) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  if (includeYear) {
    return `${day}.${month}.${date.getFullYear()}`;
  }
  return `${day}.${month}`;
}

function createMealRow(label) {
  const row = document.createElement('div');
  row.className = 'meal';

  const text = document.createElement('span');
  text.className = 'meal__label';
  text.textContent = label;

  const button = document.createElement('button');
  button.className = 'meal__button';
  button.type = 'button';
  button.setAttribute('aria-label', `${label} hinzufügen`);
  button.textContent = '+';

  row.append(text, button);
  return row;
}

function createDayCard(date, offset, todayYear) {
  const card = document.createElement('article');
  card.className = 'day-card';

  const header = document.createElement('div');
  header.className = 'day-card__header';

  const title = document.createElement('h2');
  title.className = 'day-card__title';

  const subtitle = document.createElement('p');
  subtitle.className = 'day-card__subtitle';

  const isSpecial = Object.prototype.hasOwnProperty.call(DAYS_LABELS, offset);
  const weekday = weekdayFormatter.format(date);
  const includeYear = date.getFullYear() !== todayYear;

  if (isSpecial) {
    title.textContent = DAYS_LABELS[offset];
    subtitle.textContent = `${weekday} · ${formatDate(date, includeYear)}`;
  } else {
    title.textContent = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    subtitle.textContent = formatDate(date, includeYear);
  }

  header.append(title, subtitle);
  card.appendChild(header);

  meals.forEach((mealLabel) => {
    card.appendChild(createMealRow(mealLabel));
  });

  return card;
}

function calculateSlots() {
  const styles = getComputedStyle(document.documentElement);
  const cardWidth = parseInt(styles.getPropertyValue('--card-width'), 10);
  const cardHeight = parseInt(styles.getPropertyValue('--card-height'), 10);
  const gap = parseInt(styles.getPropertyValue('--gap'), 10);
  const width = (dayContainer && dayContainer.clientWidth) || window.innerWidth;
  const height = window.innerHeight || cardHeight;
  const headerElement = document.querySelector('.app__header');
  const headerHeight = headerElement ? headerElement.offsetHeight : 0;
  const availableHeight = Math.max(height - headerHeight - 140, cardHeight);

  const columns = Math.max(1, Math.floor((width + gap) / (cardWidth + gap)));
  const rows = Math.max(1, Math.floor((availableHeight + gap) / (cardHeight + gap)));

  return columns * rows;
}

function renderDays() {
  if (!dayContainer) {
    return;
  }
  const today = new Date();
  const todayYear = today.getFullYear();
  if (todayLabel) {
    todayLabel.textContent = weekdayFormatter.format(today);
  }

  const slots = calculateSlots();
  dayContainer.innerHTML = '';

  for (let i = 0; i < slots; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const card = createDayCard(date, i, todayYear);
    dayContainer.appendChild(card);
  }
}

let resizeTimeout;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(renderDays, 150);
});

renderDays();
