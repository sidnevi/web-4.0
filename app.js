const EXPRESSIVE_DURATION = 500;
const EXPRESSIVE_EASING = 'cubic-bezier(0.35, 1.3, 0.25, 1)';
const COUNTER_DURATION = 220;
const COUNTER_EASING = 'cubic-bezier(.2, .8, .2, 1)';
const MAX_VISIBLE_NOTIFICATIONS = 6;
const MIN_PANEL_HEIGHT = 640;
const MAX_PANEL_HEIGHT = 1040;

const COPY_TOAST_TEXT = 'Параметры скопированы';
const COPY_TOAST_ERROR = 'Не удалось скопировать';

const tabs = Array.from(document.querySelectorAll('.tab'));
const views = Array.from(document.querySelectorAll('.view'));
const panelView = document.querySelector('#panel-view');
const sidepanel = document.querySelector('.sidepanel');
const events = document.querySelector('.sidepanel .events');

const restartButton = document.querySelector('#restart-button');
const addNotificationButton = document.querySelector('#add-notification-button');
const ptrButton = document.querySelector('#ptr-button');
const resizeHandle = document.querySelector('#resize-handle');
const panelHeightControl = document.querySelector('#panel-height-control');
const panelHeightValue = document.querySelector('#panel-height-value');
const visibleCountValue = document.querySelector('#visible-count-value');
const copyToast = document.querySelector('#copy-toast');
const limitToast = document.querySelector('#limit-toast');

const copyResetTimers = new WeakMap();
const counterVersions = new WeakMap();

let copyToastTimer;
let limitToastTimer;
let incomingIndex = 0;

const incomingNotifications = [
  {
    caption: 'Арест от ФССП',
    title: 'На 1000 ₽',
    avatarClass: 'negative',
    icon: 'assets/avatar-fssp.svg',
    protectedType: 'alert'
  },
  {
    caption: 'Обновление документов',
    title: 'Загрузите их заново — нашли ошибки',
    avatarClass: 'negative-strong',
    icon: 'assets/avatar-docs-error.svg',
    protectedType: 'alert',
    wrap: true
  },
  {
    caption: 'Бухгалтерия',
    title: 'Бухгалтер свяжется с вами в течении 1 рабочего дня',
    avatarClass: 'positive',
    icon: 'assets/avatar-accounting.svg',
    wrap: true
  },
  {
    caption: 'Долями',
    title: 'Подключаем',
    progress: 'assets/progress-dolyami.svg'
  },
  {
    caption: 'Штраф за пропуск платежа',
    title: 'Списано 3 500 ₽. Погасите просроченную задолженность',
    avatarClass: 'negative',
    icon: 'assets/avatar-penalty.svg',
    protectedType: 'alert',
    wrap: true
  },
  {
    caption: 'Овердрафт',
    title: 'Лимит овердрафта обнулен. Погасите задолженность 58',
    avatarClass: 'negative',
    icon: 'assets/avatar-overdraft.svg',
    protectedType: 'alert',
    wrap: true
  }
];

function panelViewIsHidden() {
  return panelView?.hidden;
}

function getVisibleCards() {
  return Array.from(document.querySelectorAll(
    '.sidepanel .events .notification-card:not(.is-hidden):not(.is-overflow)'
  ));
}

function getOverflowCards() {
  return Array.from(document.querySelectorAll(
    '.sidepanel .events .notification-card.is-overflow:not(.is-hidden)'
  ));
}

function getMotionElements(stage, excludedCard = null) {
  const selector = stage.classList.contains('sidepanel')
    ? '.notification-card:not(.is-hidden):not(.is-overflow), .all-notifications, .docs-card'
    : '.notification-card:not(.is-hidden):not(.is-overflow)';

  return Array.from(stage.querySelectorAll(selector))
    .filter((element) => element !== excludedCard);
}

function captureRects(elements) {
  return new Map(elements.map((element) => [element, element.getBoundingClientRect()]));
}

function playFlip(elements, firstRects) {
  elements.forEach((element) => {
    const first = firstRects.get(element);
    if (!first || element.classList.contains('is-overflow')) return;

    const last = element.getBoundingClientRect();
    const deltaX = first.left - last.left;
    const deltaY = first.top - last.top;

    if (Math.abs(deltaX) < .5 && Math.abs(deltaY) < .5) return;

    element.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: 'translate(0, 0)' }
      ],
      {
        duration: EXPRESSIVE_DURATION,
        easing: EXPRESSIVE_EASING,
        fill: 'both'
      }
    );
  });
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function showCopyToast(text = COPY_TOAST_TEXT) {
  copyToast.textContent = text;
  copyToast.classList.add('is-visible');

  clearTimeout(copyToastTimer);
  copyToastTimer = setTimeout(() => {
    copyToast.classList.remove('is-visible');
    copyToast.textContent = COPY_TOAST_TEXT;
  }, 1400);
}

function showLimitToast() {
  limitToast.classList.add('is-visible');

  clearTimeout(limitToastTimer);
  limitToastTimer = setTimeout(() => {
    limitToast.classList.remove('is-visible');
  }, 3000);
}

function notificationPriority(card) {
  if (card.dataset.protected === 'alert') return 0;
  if (card.dataset.protected === 'action') return 1;
  return 2;
}

function sortNotificationsByPriority() {
  if (!events) return;

  const allNotificationsButton = events.querySelector('.all-notifications');

  Array.from(events.querySelectorAll('.notification-card'))
    .map((card, index) => ({ card, index, priority: notificationPriority(card) }))
    .sort((a, b) => (a.priority - b.priority) || (a.index - b.index))
    .forEach(({ card }) => {
      if (allNotificationsButton) {
        events.insertBefore(card, allNotificationsButton);
      } else {
        events.appendChild(card);
      }
    });
}

function animateOverflowEnter(card) {
  card.animate(
    [
      { opacity: 0, transform: 'translateY(-4px) scale(.86)' },
      { opacity: 1, transform: 'translateY(0) scale(1)' }
    ],
    {
      duration: EXPRESSIVE_DURATION,
      easing: EXPRESSIVE_EASING,
      fill: 'both'
    }
  );
}

function createCounterDigit(value, keyframes) {
  const digit = document.createElement('span');
  digit.className = 'count-badge-value';
  digit.textContent = String(value);

  return { digit, animation: () => digit.animate(keyframes, {
    duration: COUNTER_DURATION,
    easing: COUNTER_EASING,
    fill: 'forwards'
  }) };
}

function updateOverflowCounter() {
  const badge = document.querySelector('.count-badge');
  if (!badge) return;

  const nextCount = getOverflowCards().length;
  const previousCount = Number(badge.dataset.count || 0);

  badge.setAttribute('aria-label', `Скрыто по высоте: ${nextCount}`);

  if (nextCount === previousCount) return;

  const version = (counterVersions.get(badge) || 0) + 1;
  counterVersions.set(badge, version);

  badge.querySelectorAll('.count-badge-value').forEach((value) => {
    value.getAnimations().forEach((animation) => animation.cancel());
  });

  badge.replaceChildren();
  badge.dataset.count = String(nextCount);

  if (nextCount === 0) {
    badge.classList.add('is-empty');
    return;
  }

  badge.classList.remove('is-empty');

  const direction = nextCount > previousCount ? 1 : -1;

  if (previousCount > 0) {
    const outgoing = createCounterDigit(previousCount, [
      { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0px)' },
      {
        opacity: 0,
        transform: `translateY(${-direction * 55}%) scale(.92)`,
        filter: 'blur(2px)'
      }
    ]);

    badge.appendChild(outgoing.digit);
    outgoing.animation();
  }

  const incoming = createCounterDigit(nextCount, [
    {
      opacity: 0,
      transform: `translateY(${previousCount > 0 ? direction * 55 : 24}%) scale(.92)`,
      filter: 'blur(2px)'
    },
    { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'blur(0px)' }
  ]);

  badge.appendChild(incoming.digit);

  incoming.animation().finished
    .catch(() => {})
    .finally(() => {
      if (counterVersions.get(badge) !== version) return;

      badge.replaceChildren(incoming.digit);
      incoming.digit.getAnimations().forEach((animation) => animation.cancel());
    });
}

function updateDemoStats() {
  if (!sidepanel) return;

  const currentHeight = Math.round(sidepanel.getBoundingClientRect().height);

  panelHeightValue.textContent = `${currentHeight} px`;
  if (panelHeightControl) panelHeightControl.value = String(currentHeight);
  visibleCountValue.textContent = `${getVisibleCards().length} / ${MAX_VISIBLE_NOTIFICATIONS}`;

  updateOverflowCounter();

  const noRoom = getVisibleCards().length >= MAX_VISIBLE_NOTIFICATIONS
    || getOverflowCards().length > 0;

  [addNotificationButton, ptrButton].forEach((button) => {
    if (!button) return;
    button.classList.toggle('is-disabled', noRoom);
    button.setAttribute('aria-disabled', String(noRoom));
  });
}

function applyNotificationLimit() {
  if (!sidepanel || panelViewIsHidden()) return;

  sortNotificationsByPriority();

  const top = sidepanel.querySelector('.sidepanel-top');
  const cards = Array.from(sidepanel.querySelectorAll('.events .notification-card'));
  const previousOverflow = new Set(cards.filter((card) => card.classList.contains('is-overflow')));

  cards.forEach((card) => card.classList.remove('is-overflow'));

  const candidates = cards.filter((card) => !card.classList.contains('is-hidden'));
  candidates.slice(MAX_VISIBLE_NOTIFICATIONS).forEach((card) => card.classList.add('is-overflow'));

  let visible = candidates.filter((card) => !card.classList.contains('is-overflow'));

  while (visible.length > 0 && top.scrollHeight > top.clientHeight + 1) {
    visible.at(-1).classList.add('is-overflow');
    visible = visible.slice(0, -1);
  }

  cards
    .filter((card) => (
      previousOverflow.has(card)
      && !card.classList.contains('is-overflow')
      && !card.classList.contains('is-hidden')
    ))
    .forEach(animateOverflowEnter);

  updateDemoStats();
}

function setPanelHeight(value) {
  if (!sidepanel) return;

  const nextHeight = Math.round(
    Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, Number(value)))
  );

  sidepanel.style.height = `${nextHeight}px`;

  if (panelHeightControl) {
    panelHeightControl.value = String(nextHeight);
  }

  if (!panelViewIsHidden()) {
    applyNotificationLimit();
  } else if (panelHeightValue) {
    panelHeightValue.textContent = `${nextHeight} px`;
  }
}

async function hideNotification(card) {
  if (
    !card
    || card.dataset.protected
    || card.classList.contains('is-hidden')
    || card.dataset.hiding === 'true'
  ) return;

  card.dataset.hiding = 'true';

  const stage = card.closest('.sidepanel') || card.closest('.notification-demo');
  const movingElements = getMotionElements(stage, card);
  const firstRects = captureRects(movingElements);
  const rect = card.getBoundingClientRect();

  const ghost = card.cloneNode(true);
  ghost.classList.add('notification-ghost');
  ghost.removeAttribute('data-hiding');
  Object.assign(ghost.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  });
  document.body.appendChild(ghost);

  card.classList.add('is-hidden');
  card.dataset.hidden = 'true';
  card.dataset.hiddenReason = 'forced';

  if (stage.classList.contains('sidepanel')) applyNotificationLimit();
  playFlip(movingElements, firstRects);

  const exitAnimation = ghost.animate(
    [
      { opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 0, transform: 'translateY(-4px) scale(.86)' }
    ],
    {
      duration: EXPRESSIVE_DURATION,
      easing: EXPRESSIVE_EASING,
      fill: 'forwards'
    }
  );

  try {
    await exitAnimation.finished;
  } catch {}

  ghost.remove();
  card.dataset.hiding = 'false';
  applyNotificationLimit();
}

function createIncomingNotification(data) {
  const card = document.createElement('article');
  card.className = 'notification-card';
  card.dataset.notification = '';
  card.dataset.addedNotification = 'true';

  if (data.protectedType) {
    card.dataset.protected = data.protectedType;
  }

  const accessory = data.progress
    ? `<img class="notification-progress" src="${data.progress}" alt="" aria-hidden="true" />`
    : `<div class="notification-avatar ${data.avatarClass || ''}" aria-hidden="true">
         <img src="${data.icon}" alt="" />
       </div>`;

  const hideControl = data.protectedType
    ? ''
    : `<div class="hide-anchor">
         <button class="hide-control" type="button" aria-label="Скрыть уведомление">
           <span class="eye" aria-hidden="true"></span>
           <span class="label">Скрыть</span>
         </button>
       </div>`;

  card.innerHTML = `
    <div class="notification-header">
      <div class="notification-copy">
        <p class="notification-caption">${data.caption}</p>
        <p class="notification-title ${data.wrap ? 'wrap' : ''}">${data.title}</p>
      </div>
      ${accessory}
    </div>
    ${hideControl}
  `;

  return card;
}

function nextNotificationData() {
  const data = incomingNotifications[incomingIndex % incomingNotifications.length];
  incomingIndex += 1;
  return data;
}

async function insertIncomingNotification({ control, delay = 360 } = {}) {
  if (!control || control.classList.contains('is-loading')) return false;

  if (control.classList.contains('is-disabled')) {
    showLimitToast();
    return false;
  }

  if (!events || !sidepanel) return false;

  const originalLabel = control.textContent.trim();
  control.classList.add('is-loading');
  control.textContent = control === ptrButton ? 'Перезагружаем…' : 'Обновляем…';

  if (delay) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const movingElements = getMotionElements(sidepanel);
  const firstRects = captureRects(movingElements);
  const newCard = createIncomingNotification(nextNotificationData());

  events.insertBefore(newCard, events.querySelector('.notification-card'));
  sortNotificationsByPriority();
  applyNotificationLimit();

  const restoreControl = () => {
    control.classList.remove('is-loading');
    control.textContent = originalLabel;
  };

  if (newCard.classList.contains('is-overflow')) {
    newCard.remove();
    incomingIndex -= 1;
    applyNotificationLimit();
    restoreControl();
    showLimitToast();
    return false;
  }

  playFlip(movingElements, firstRects);

  newCard.animate(
    [
      { opacity: 0, transform: 'scale(.86)' },
      { opacity: 1, transform: 'scale(1)' }
    ],
    {
      duration: EXPRESSIVE_DURATION,
      easing: EXPRESSIVE_EASING,
      fill: 'both'
    }
  );

  restoreControl();
  applyNotificationLimit();
  return true;
}

function addIncomingNotification() {
  return insertIncomingNotification({ control: addNotificationButton, delay: 360 });
}

async function simulatePTR() {
  if (!ptrButton || ptrButton.classList.contains('is-loading')) return;

  if (ptrButton.classList.contains('is-disabled')) {
    showLimitToast();
    return;
  }

  if (!sidepanel) return;

  sidepanel.classList.add('is-ptr-refreshing');
  await new Promise((resolve) => setTimeout(resolve, 280));

  const inserted = await insertIncomingNotification({ control: ptrButton, delay: 0 });

  if (inserted) {
    await new Promise((resolve) => setTimeout(resolve, 180));
  }

  sidepanel.classList.remove('is-ptr-refreshing');
}

function resetButton(button, label) {
  if (!button) return;

  button.classList.remove('is-loading', 'is-disabled');
  button.textContent = label;
  button.setAttribute('aria-disabled', 'false');
}

function resetPrototype() {
  document.querySelectorAll('[data-added-notification]').forEach((card) => card.remove());

  document.querySelectorAll('.notification-card').forEach((card) => {
    card.classList.remove('is-hidden', 'is-overflow');
    card.dataset.hidden = 'false';
    card.dataset.hiding = 'false';
    delete card.dataset.hiddenReason;
  });

  incomingIndex = 0;

  sortNotificationsByPriority();
  setPanelHeight(MAX_PANEL_HEIGHT);

  resetButton(addNotificationButton, 'Добавить нотификацию');
  resetButton(ptrButton, 'PTR · Перезагрузить страницу');

  requestAnimationFrame(applyNotificationLimit);
}

function setupTabs() {
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;

      tabs.forEach((item) => item.setAttribute('aria-selected', String(item === tab)));

      views.forEach((view) => {
        const active = view.id === targetId;
        view.classList.toggle('is-active', active);
        view.hidden = !active;
      });

      if (targetId === 'panel-view') {
        requestAnimationFrame(applyNotificationLimit);
      }
    });
  });
}

function setupResize() {
  if (!sidepanel || !resizeHandle) return;

  let startY = 0;
  let startHeight = 0;

  const onPointerMove = (event) => {
    setPanelHeight(startHeight + (event.clientY - startY));
  };

  const endResize = () => {
    resizeHandle.classList.remove('is-resizing');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endResize);
    window.removeEventListener('pointercancel', endResize);
  };

  resizeHandle.addEventListener('pointerdown', (event) => {
    startY = event.clientY;
    startHeight = sidepanel.getBoundingClientRect().height;
    resizeHandle.classList.add('is-resizing');
    resizeHandle.setPointerCapture?.(event.pointerId);

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endResize);
    window.addEventListener('pointercancel', endResize);
  });

  resizeHandle.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();

    const direction = event.key === 'ArrowDown' ? 1 : -1;
    setPanelHeight(sidepanel.getBoundingClientRect().height + direction * 20);
  });
}

function setupCopyParams() {
  document.addEventListener('click', async (event) => {
    const copyButton = event.target.closest('.copy-params');
    if (!copyButton) return;

    try {
      await copyText(copyButton.dataset.copy || '');

      copyButton.classList.add('is-copied');
      clearTimeout(copyResetTimers.get(copyButton));
      copyResetTimers.set(copyButton, setTimeout(
        () => copyButton.classList.remove('is-copied'),
        1200
      ));

      showCopyToast();
    } catch {
      showCopyToast(COPY_TOAST_ERROR);
    }
  });
}

function setupHideControls() {
  document.addEventListener('click', (event) => {
    const hideButton = event.target.closest('.hide-control');
    if (!hideButton) return;

    event.preventDefault();
    event.stopPropagation();
    hideNotification(hideButton.closest('.notification-card'));
  });
}

function setupPanelHeightControl() {
  panelHeightControl?.addEventListener('input', (event) => {
    setPanelHeight(event.target.value);
  });
}

function observePanelResize() {
  if (!('ResizeObserver' in window) || !sidepanel) return;

  const observer = new ResizeObserver(() => {
    if (!panelViewIsHidden()) applyNotificationLimit();
  });

  observer.observe(sidepanel);
}

setupTabs();
setupCopyParams();
setupHideControls();
setupPanelHeightControl();
setupResize();
observePanelResize();

addNotificationButton?.addEventListener('click', addIncomingNotification);
ptrButton?.addEventListener('click', simulatePTR);
restartButton?.addEventListener('click', resetPrototype);

requestAnimationFrame(() => {
  sortNotificationsByPriority();
  setPanelHeight(MAX_PANEL_HEIGHT);
  applyNotificationLimit();
});
