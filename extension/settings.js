const defaults = Object.freeze({ enabled: true, minutes: 10 });
const allowedMinutes = [1, 5, 10, 15, 20, 30];

function normalizeSettings(value) {
  return {
    enabled: value.enabled !== false,
    minutes: allowedMinutes.includes(value.minutes) ? value.minutes : defaults.minutes
  };
}
