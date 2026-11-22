const defaultTimeZone = "Europe/Zurich";
const orders = {
  day_month_year: ["day", "month", "year"],
  month_day_year: ["month", "day", "year"],
  year_month_day: ["year", "month", "day"],
  iso_8601: ["year", "month", "day"],
};

export function createDisplayDateFormatter(preferences) {
  const { timeZone: preferredZone, dateFormat } = preferences ?? {};
  let timeZone = defaultTimeZone;
  if (preferredZone) {
    try {
      timeZone = new Intl.DateTimeFormat("fr-CH", { timeZone: preferredZone }).resolvedOptions().timeZone;
    } catch {
      // A browser may not support a zone saved on another device.
    }
  }
  const order = Object.hasOwn(orders, dateFormat) ? orders[dateFormat] : null;
  const separator = dateFormat === "iso_8601" ? "-" : "/";
  const shortDate = new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short", timeZone });
  const longDate = new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short", year: "numeric", timeZone });
  const numericDate = order && new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone,
  });
  const clock = new Intl.DateTimeFormat("fr-CH", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone,
  });

  return (value, { date = true, time = false, year = false, zone = false } = {}) => {
    const timestamp = typeof value === "number" ? value : Date.parse(value);
    if (!Number.isFinite(timestamp) || Math.abs(timestamp) > 8_640_000_000_000_000) return "";
    const labels = [];
    if (date && order) {
      const parts = Object.fromEntries(numericDate.formatToParts(timestamp).map(({ type, value }) => [type, value]));
      labels.push(order.map((part) => parts[part]).join(separator));
    } else if (date) {
      labels.push((year ? longDate : shortDate).format(timestamp));
    }
    if (time) labels.push(clock.format(timestamp));
    const formatted = labels.join(" · ");
    return formatted && zone ? `${formatted} (${timeZone})` : formatted;
  };
}

// Fractional odds express the profit per unit staked. A short denominator
// keeps the display readable and the exact decimal remains on the ticket.
function fractionalOdds(profit) {
  if (profit === 0) return "0/1";
  let closest;
  let error = Infinity;
  for (let denominator = 1; denominator <= 100; denominator += 1) {
    const numerator = Math.round(profit * denominator);
    if (!Number.isSafeInteger(numerator) || numerator < 1) continue;
    const difference = Math.abs(numerator / denominator - profit);
    if (difference + 1e-10 < error) {
      closest = `${numerator}/${denominator}`;
      error = difference;
    }
  }
  return closest ? (error < 1e-10 ? closest : `≈ ${closest}`) : null;
}

export function formatPreferredOdds(value, oddsFormat) {
  if (!Number.isFinite(value) || value < 1) return null;
  const profit = value - 1;
  if (oddsFormat === "fractional") return fractionalOdds(profit);
  if (oddsFormat !== "american" || profit === 0) return null;

  const positive = value >= 2;
  const quantity = positive ? profit * 100 : 100 / profit;
  const rounded = Math.round(quantity + Number.EPSILON * quantity);
  if (!Number.isSafeInteger(rounded)) return null;
  const odds = (positive ? "+" : "-") + rounded;
  return Math.abs(quantity - rounded) < 1e-8 ? odds : `≈ ${odds}`;
}
