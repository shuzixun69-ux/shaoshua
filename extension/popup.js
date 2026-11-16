const enabled = document.querySelector('#enabled');
const minutes = document.querySelector('#minutes');
const status = document.querySelector('#status');

for (const value of allowedMinutes) {
  minutes.add(new Option(value + ' 分钟', value));
}

function renderTimeline() {
  const limit = Number(minutes.value);
  const format = seconds => seconds < 60 ? seconds + ' 秒' : seconds / 60 + ' 分钟';
  document.querySelector('#first').textContent = format(limit * 12);
  document.querySelector('#second').textContent = format(limit * 30);
  document.querySelector('#third').textContent = format(limit * 60);
}

async function load() {
  const settings = normalizeSettings(await chrome.storage.local.get(defaults));
  enabled.checked = settings.enabled;
  minutes.value = settings.minutes;
  renderTimeline();
  enabled.disabled = false;
  minutes.disabled = false;
}

async function save(field, value) {
  try {
    await chrome.storage.local.set({ [field]: value });
    status.textContent = '';
  } catch {
    status.textContent = '保存失败，请重新打开面板。';
  }
}

enabled.addEventListener('change', () => save('enabled', enabled.checked));
minutes.addEventListener('change', () => {
  renderTimeline();
  save('minutes', Number(minutes.value));
});
load().catch(() => { status.textContent = '无法读取设置，请重新打开面板。'; });
