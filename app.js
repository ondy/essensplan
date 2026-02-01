const DAYS_LABELS = {
  '-2': 'Vorgestern',
  '-1': 'Gestern',
  0: 'Heute',
  1: 'Morgen',
  2: 'Übermorgen',
};

const meals = ['Frühstück', 'Mittagessen', 'Abendessen'];

const dayContainer = document.getElementById('days');
const prevButton = document.getElementById('prev-days');
const todayButton = document.getElementById('today-days');
const nextButton = document.getElementById('next-days');
const hasIndexedDb = typeof indexedDB !== 'undefined';

const weekdayFormatter = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
});

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('essensplan', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('meals')) {
        db.createObjectStore('meals');
      }
      if (!db.objectStoreNames.contains('suggestions')) {
        db.createObjectStore('suggestions');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const dbPromise = hasIndexedDb ? openDatabase() : null;
let suggestionsCache = [];

async function loadSuggestions() {
  await refreshSuggestionsFromMeals();
}

async function getMealEntry(key) {
  if (!dbPromise) {
    return '';
  }
  const db = await dbPromise;
  const transaction = db.transaction('meals', 'readonly');
  const store = transaction.objectStore('meals');
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || '');
    request.onerror = () => reject(request.error);
  });
}

async function setMealEntry(key, value) {
  if (!dbPromise) {
    return;
  }
  const db = await dbPromise;
  const transaction = db.transaction('meals', 'readwrite');
  const store = transaction.objectStore('meals');
  if (value) {
    store.put(value, key);
  } else {
    store.delete(key);
  }
}

async function refreshSuggestionsFromMeals() {
  if (!dbPromise) {
    return;
  }
  const db = await dbPromise;
  const transaction = db.transaction(['meals', 'suggestions'], 'readwrite');
  const mealStore = transaction.objectStore('meals');
  const suggestionStore = transaction.objectStore('suggestions');

  const meals = await new Promise((resolve, reject) => {
    const request = mealStore.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });

  const counts = meals.reduce((acc, entry) => {
    const value = String(entry || '').trim();
    if (!value) {
      return acc;
    }
    const key = value.toLowerCase();
    acc[key] = acc[key]
      ? { value: acc[key].value, count: acc[key].count + 1 }
      : { value, count: 1 };
    return acc;
  }, {});

  const suggestions = Object.values(counts).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.value.localeCompare(b.value, 'de', { sensitivity: 'base' });
  });

  await new Promise((resolve, reject) => {
    const clearRequest = suggestionStore.clear();
    clearRequest.onsuccess = () => resolve();
    clearRequest.onerror = () => reject(clearRequest.error);
  });

  suggestions.forEach((item) => {
    suggestionStore.put(item, item.value.toLowerCase());
  });

  suggestionsCache = suggestions;
}

function getBestSuggestion(query) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  return (
    suggestionsCache.find((item) =>
      item.value.toLowerCase().startsWith(trimmed)
    ) || null
  );
}

function renderSuggestionHighlight(value, query) {
  const container = document.createElement('span');
  const lowerValue = value.toLowerCase();
  const lowerQuery = query.trim().toLowerCase();
  const matchIndex = lowerQuery ? lowerValue.indexOf(lowerQuery) : -1;

  if (matchIndex === -1) {
    container.textContent = value;
    return container;
  }

  const before = document.createTextNode(value.slice(0, matchIndex));
  const match = document.createElement('mark');
  match.textContent = value.slice(matchIndex, matchIndex + lowerQuery.length);
  const after = document.createTextNode(
    value.slice(matchIndex + lowerQuery.length)
  );

  container.append(before, match, after);
  return container;
}

function formatDate(date, includeYear) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  if (includeYear) {
    return `${day}.${month}.${date.getFullYear()}`;
  }
  return `${day}.${month}`;
}

function getDateKey(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function createMealRow(label, dateKey) {
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

  const input = document.createElement('input');
  input.className = 'meal__input';
  input.type = 'text';
  input.placeholder = `${label} hinzufügen`;
  input.hidden = true;

  const field = document.createElement('div');
  field.className = 'meal__field';

  const storageKey = `${dateKey}-${label}`;
  let isChoosingSuggestion = false;
  let activeSuggestionIndex = -1;
  let currentSuggestions = [];

  const autocomplete = document.createElement('div');
  autocomplete.className = 'meal__autocomplete';
  autocomplete.hidden = true;
  autocomplete.style.display = 'none';

  const hideAutocomplete = () => {
    autocomplete.hidden = true;
    autocomplete.style.display = 'none';
  };

  const showAutocomplete = () => {
    autocomplete.hidden = false;
    autocomplete.style.display = 'grid';
  };

  const renderAutocomplete = (query) => {
    autocomplete.innerHTML = '';
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      hideAutocomplete();
      currentSuggestions = [];
      activeSuggestionIndex = -1;
      return;
    }
    const matches = suggestionsCache.filter((item) =>
      item.value.toLowerCase().includes(trimmedQuery.toLowerCase())
    );
    if (!matches.length) {
      hideAutocomplete();
      currentSuggestions = [];
      activeSuggestionIndex = -1;
      return;
    }
    currentSuggestions = matches;
    activeSuggestionIndex = -1;
    matches.forEach((item) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'meal__suggestion';
      option.appendChild(renderSuggestionHighlight(item.value, query));
      option.addEventListener('mousedown', () => {
        isChoosingSuggestion = true;
      });
      option.addEventListener('click', () => {
        input.value = item.value;
        saveInput().catch(() => {});
        input.focus();
        autocomplete.hidden = true;
        isChoosingSuggestion = false;
      });
      autocomplete.appendChild(option);
    });
    showAutocomplete();
  };

  const revealInput = () => {
    input.hidden = false;
    input.focus();
  };

  const saveInput = async () => {
    const value = input.value.trim();
    await setMealEntry(storageKey, value);
    await refreshSuggestionsFromMeals();
  };

  button.addEventListener('click', revealInput);
  input.addEventListener('blur', () => {
    if (isChoosingSuggestion) {
      isChoosingSuggestion = false;
      input.focus();
      return;
    }
    saveInput().catch(() => {});
    hideAutocomplete();
  });
  input.addEventListener('change', saveInput);
  input.addEventListener('input', (event) => {
    const current = input.value;
    renderAutocomplete(current);
    if (!current) {
      return;
    }
    if (event && event.inputType && event.inputType.startsWith('delete')) {
      return;
    }
    const suggestion = getBestSuggestion(current);
    if (!suggestion || !suggestion.value) {
      return;
    }
    if (suggestion.value.toLowerCase() === current.toLowerCase()) {
      return;
    }
    input.value = suggestion.value;
    input.setSelectionRange(current.length, suggestion.value.length);
  });
  const highlightSuggestion = () => {
    const items = autocomplete.querySelectorAll('.meal__suggestion');
    items.forEach((item, index) => {
      if (index === activeSuggestionIndex) {
        item.classList.add('meal__suggestion--active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('meal__suggestion--active');
      }
    });
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!currentSuggestions.length) {
        return;
      }
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = activeSuggestionIndex + direction;
      const maxIndex = currentSuggestions.length - 1;
      if (nextIndex < 0) {
        activeSuggestionIndex = maxIndex;
      } else if (nextIndex > maxIndex) {
        activeSuggestionIndex = 0;
      } else {
        activeSuggestionIndex = nextIndex;
      }
      highlightSuggestion();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const selected =
        activeSuggestionIndex >= 0 ? currentSuggestions[activeSuggestionIndex] : null;
      const suggestion = selected || getBestSuggestion(input.value);
      if (suggestion && suggestion.value && input.value.trim() !== '') {
        input.value = suggestion.value;
      }
      saveInput().catch(() => {});
      input.blur();
    }
  });
  input.addEventListener('focus', () => {
    hideAutocomplete();
  });

  getMealEntry(storageKey)
    .then((value) => {
      if (value) {
        input.value = value;
        input.hidden = false;
      }
    })
    .catch(() => {});

  field.append(input, autocomplete);
  row.append(text, button, field);
  return row;
}

function isSameDay(firstDate, secondDate) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function createDayCard(date, offset, todayYear, todayDate) {
  const card = document.createElement('article');
  card.className = 'day-card';
  if (isSameDay(date, todayDate)) {
    card.classList.add('day-card--today');
  }

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

  const dateKey = getDateKey(date);
  meals.forEach((mealLabel) => {
    card.appendChild(createMealRow(mealLabel, dateKey));
  });

  return card;
}

function calculateSlots() {
  if (window.innerWidth && window.innerWidth <= 640) {
    return 1;
  }
  const styles = getComputedStyle(document.documentElement);
  const cardWidth = parseInt(styles.getPropertyValue('--card-width'), 10) || 280;
  const cardHeight = parseInt(styles.getPropertyValue('--card-height'), 10) || 260;
  const gap = parseInt(styles.getPropertyValue('--gap'), 10) || 20;
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

  const slots = calculateSlots();
  dayContainer.innerHTML = '';

  for (let i = 0; i < slots; i += 1) {
    const date = new Date(today);
    const offsetFromToday = i + startOffset;
    date.setDate(today.getDate() + offsetFromToday);
    const card = createDayCard(date, offsetFromToday, todayYear, today);
    dayContainer.appendChild(card);
  }
}

let startOffset = 0;
let resizeTimeout;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(renderDays, 150);
});

if (prevButton) {
  prevButton.addEventListener('click', () => {
    startOffset -= calculateSlots();
    renderDays();
  });
}

if (todayButton) {
  todayButton.addEventListener('click', () => {
    startOffset = 0;
    renderDays();
  });
}

if (nextButton) {
  nextButton.addEventListener('click', () => {
    startOffset += calculateSlots();
    renderDays();
  });
}

if (dayContainer) {
  let touchStartX = 0;
  let touchEndX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  let lastSwipeTime = 0;
  let dragOffsetX = 0;
  let isDragging = false;
  let isAnimatingSwipe = false;
  let swipeDirection = 0;

  dayContainer.addEventListener(
    'touchstart',
    (event) => {
      if (isAnimatingSwipe) {
        return;
      }
      if (event.touches.length > 1) {
        return;
      }
      touchStartX = event.changedTouches[0].screenX;
      touchStartY = event.changedTouches[0].screenY;
      isSwiping = true;
      isDragging = true;
      dragOffsetX = 0;
      dayContainer.style.transition = 'none';
    },
    { passive: true }
  );

  dayContainer.addEventListener(
    'touchmove',
    (event) => {
      if (!isSwiping) {
        return;
      }
      touchEndX = event.changedTouches[0].screenX;
      const currentY = event.changedTouches[0].screenY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = currentY - touchStartY;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        dragOffsetX = deltaX;
        dayContainer.style.transform = `translateX(${deltaX}px)`;
      }
    },
    { passive: true }
  );

  dayContainer.addEventListener(
    'touchend',
    (event) => {
      if (!isSwiping) {
        return;
      }
      const now = Date.now();
      if (now - lastSwipeTime < 250) {
        dayContainer.style.transition = 'transform 0.2s ease';
        dayContainer.style.transform = 'translateX(0px)';
        isSwiping = false;
        isDragging = false;
        return;
      }
      touchEndX = event.changedTouches[0].screenX;
      const touchEndY = event.changedTouches[0].screenY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      const threshold = 50;
      if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY)) {
        dayContainer.style.transition = 'transform 0.2s ease';
        dayContainer.style.transform = 'translateX(0px)';
        isSwiping = false;
        isDragging = false;
        return;
      }
      swipeDirection = deltaX > 0 ? 1 : -1;
      const containerWidth = dayContainer.clientWidth || window.innerWidth;
      isAnimatingSwipe = true;
      dayContainer.style.transition = 'transform 0.25s ease';
      dayContainer.style.transform = `translateX(${swipeDirection * containerWidth}px)`;
      const onTransitionEnd = () => {
        dayContainer.removeEventListener('transitionend', onTransitionEnd);
        if (swipeDirection > 0) {
          startOffset -= calculateSlots();
        } else {
          startOffset += calculateSlots();
        }
        renderDays();
        dayContainer.style.transition = 'none';
        dayContainer.style.transform = `translateX(${swipeDirection * -containerWidth}px)`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            dayContainer.style.transition = 'transform 0.25s ease';
            dayContainer.style.transform = 'translateX(0px)';
            isAnimatingSwipe = false;
          });
        });
      };
      dayContainer.addEventListener('transitionend', onTransitionEnd);
      lastSwipeTime = now;
      isSwiping = false;
      isDragging = false;
    },
    { passive: true }
  );
}

renderDays();

loadSuggestions().catch(() => {});
