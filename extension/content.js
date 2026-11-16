(() => {
  const key = 'shaoshua:session:1';
  const idleMs = 20 * 60_000;
  const douyin = location.hostname === 'www.douyin.com';
  const nextLabel = /^(下一条|下一个视频|下一个|Next video)$/i;
  let settings;
  let session = restore();
  let lastTick = performance.now();
  let dialog;
  let stage = 0;

  function fresh() {
    return { watched: 0, lastWatch: Date.now(), resumeUntil: 0 };
  }

  function restore() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key));
      if (saved && ['watched', 'lastWatch', 'resumeUntil'].every(
        field => Number.isFinite(saved[field]) && saved[field] >= 0
      )) return saved;
    } catch {
      // Playback controls also work when the site disallows session storage.
    }
    return fresh();
  }

  function save() {
    try {
      sessionStorage.setItem(key, JSON.stringify(session));
    } catch {
      // Keep the current page's session in memory.
    }
  }

  function visibleVideo(video) {
    const rect = video.getBoundingClientRect();
    const width = Math.min(innerWidth, rect.right) - Math.max(0, rect.left);
    const height = Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top);
    const style = getComputedStyle(video);
    return width >= 120 && height >= 80 && style.visibility === 'visible' && style.opacity !== '0';
  }

  function updateStage(value) {
    stage = value;
    document.documentElement.dataset.shaoshuaStage = String(stage);
    if (douyin && stage >= 2) {
      for (const button of document.querySelectorAll('button[aria-label], [role="button"][aria-label], button[title], [role="button"][title]')) {
        if (nextLabel.test((button.getAttribute('aria-label') || button.title).trim())) {
          button.setAttribute('data-shaoshua-next', '');
        } else {
          button.removeAttribute('data-shaoshua-next');
        }
      }
    }
    if (stage !== 3 && dialog?.open) dialog.close();
  }

  function showBreak() {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'shaoshua-break';
      dialog.setAttribute('aria-labelledby', 'shaoshua-break-title');
      dialog.setAttribute('aria-describedby', 'shaoshua-break-text');

      const title = document.createElement('h2');
      title.id = 'shaoshua-break-title';
      title.textContent = '先停一会儿';
      const description = document.createElement('p');
      description.id = 'shaoshua-break-text';
      const leave = document.createElement('button');
      leave.type = 'button';
      leave.autofocus = true;
      leave.textContent = '离开视频';
      leave.addEventListener('click', () => location.replace('about:blank'));
      const resume = document.createElement('button');
      resume.type = 'button';
      resume.textContent = '再看 2 分钟';
      resume.addEventListener('click', () => {
        session.resumeUntil = session.watched + 120_000;
        session.lastWatch = Date.now();
        save();
        tick();
      });

      dialog.addEventListener('cancel', event => event.preventDefault());
      dialog.append(title, description, leave, resume);
      document.body.append(dialog);
    }
    dialog.querySelector('p').textContent =
      '这一轮已经看了约 ' + Math.floor(session.watched / 60_000) + ' 分钟。';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (!dialog.open && dialog.isConnected) dialog.showModal();
  }

  function pauseVideos() {
    for (const video of document.querySelectorAll('video')) {
      if (!video.paused) video.pause();
    }
  }

  function tick() {
    const now = performance.now();
    const elapsed = Math.min(Math.max(now - lastTick, 0), 1500);
    lastTick = now;

    if (!settings?.enabled) {
      if (stage !== 0) updateStage(0);
      return;
    }
    if (Date.now() - session.lastWatch > idleMs) {
      session = fresh();
      save();
    }

    const limit = settings.minutes * 60_000;
    const nextBreak = Math.max(limit, session.resumeUntil);
    if (session.watched < nextBreak && !document.hidden) {
      const playing = Array.from(document.querySelectorAll('video')).some(video =>
        !video.paused && !video.ended && !video.seeking && video.readyState >= 3 && visibleVideo(video)
      );
      if (playing) {
        session.watched += elapsed;
        session.lastWatch = Date.now();
        save();
      }
    }

    if (session.watched >= nextBreak) {
      updateStage(3);
      pauseVideos();
      if (!document.hidden) showBreak();
    } else {
      const nextStage = session.watched >= limit * 0.5 ? 2 : Number(session.watched >= limit * 0.2);
      if (stage !== nextStage || (douyin && nextStage === 2)) updateStage(nextStage);
    }
  }

  // On Douyin, intercept the desktop player's quick-next input over the video.
  function playerUnder(x, y) {
    return Array.from(document.querySelectorAll('video')).some(video => {
      if (!visibleVideo(video)) return false;
      const rect = video.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
  }

  if (douyin) {
    window.addEventListener('wheel', event => {
      if (stage !== 2 || event.deltaY <= 0 || event.ctrlKey ||
          !playerUnder(event.clientX, event.clientY)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true, passive: false });

    window.addEventListener('keydown', event => {
      if (stage !== 2 || event.key !== 'ArrowDown' || event.altKey || event.ctrlKey ||
          event.metaKey || event.target.closest?.('input, textarea, select, button, [contenteditable], [role="slider"]')) return;
      if (!Array.from(document.querySelectorAll('video')).some(visibleVideo)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  document.addEventListener('play', event => {
    if (stage === 3 && event.target instanceof HTMLVideoElement) event.target.pause();
  }, true);

  document.addEventListener('visibilitychange', () => {
    lastTick = performance.now();
    tick();
  });
  document.addEventListener('fullscreenchange', () => {
    if (stage === 3 && !document.hidden) showBreak();
  });

  chrome.storage.local.get(defaults).then(value => {
    settings = normalizeSettings(value);
    lastTick = performance.now();
    tick();
    setInterval(tick, 1000);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const updated = { ...settings };
      for (const field of Object.keys(defaults)) {
        if (changes[field]) updated[field] = changes[field].newValue;
      }
      settings = normalizeSettings(updated);
      tick();
    });
  });
})();
