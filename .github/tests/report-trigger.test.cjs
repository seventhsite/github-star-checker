const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

// The trigger fires on the first run of a new week/month, so it holds whatever the cron
// is: an hourly schedule that drifts past 00:xx, or a sparse one that skips Mondays.
const workflow = readFileSync(join(__dirname, '../workflows/check-stars.yml'), 'utf8');
const block = workflow.match(/            \/\/ Date-based dedup:[\s\S]*?const isMonthly = .*\n/)[0].replace(/^            /gm, '');
const evaluate = new Function('now', 'data', 'manualReport', `${block}\nreturn { isWeekly, isMonthly };`);

const at = date => new Date(`${date}T15:23:00.000Z`);

// Mirrors the two assignments the workflow makes once a report is generated.
function run(date, data, manualReport = '') {
  const result = evaluate(at(date), data, manualReport);
  if (result.isWeekly) data.last_weekly_report = date;
  if (result.isMonthly) data.last_monthly_report = date;
  return result;
}

test('a fresh stars.json reports on its very first run', () => {
  const data = { last_weekly_report: null, last_monthly_report: null };
  assert.deepEqual(run('2026-09-15', data), { isWeekly: true, isMonthly: true });
});

test('the second run of the same week stays silent', () => {
  const data = { last_weekly_report: null, last_monthly_report: null };
  run('2026-09-15', data);
  assert.deepEqual(run('2026-09-18', data), { isWeekly: false, isMonthly: false });
});

test('the first run of the next week reports again, without repeating the month', () => {
  const data = { last_weekly_report: null, last_monthly_report: null };
  run('2026-09-15', data);
  assert.deepEqual(run('2026-09-22', data), { isWeekly: true, isMonthly: false });
  assert.deepEqual(run('2026-09-29', data), { isWeekly: true, isMonthly: false });
});

test('the first run of a new month reports monthly, even though it is not the 1st', () => {
  // Sep 29 and Oct 2 fall in the same week, so only the month rolls over here.
  const data = { last_weekly_report: '2026-09-29', last_monthly_report: '2026-09-15' };
  assert.deepEqual(run('2026-10-02', data), { isWeekly: false, isMonthly: true });
  assert.deepEqual(run('2026-10-06', data), { isWeekly: true, isMonthly: false });
});

test('a week that produced no report stays eligible on a later run', () => {
  const data = { last_weekly_report: '2026-09-15', last_monthly_report: '2026-09-15' };
  assert.equal(run('2026-09-25', data).isWeekly, true);
});

test('manual dispatch overrides the dedup dates', () => {
  const data = { last_weekly_report: '2026-09-15', last_monthly_report: '2026-09-15' };
  assert.deepEqual(evaluate(at('2026-09-18'), data, 'weekly'), { isWeekly: true, isMonthly: false });
  assert.deepEqual(evaluate(at('2026-09-18'), data, 'monthly'), { isWeekly: false, isMonthly: true });
});

test('a Monday run still belongs to the week it starts', () => {
  const data = { last_weekly_report: null, last_monthly_report: null };
  run('2026-09-21', data); // Monday
  assert.equal(run('2026-09-25', data).isWeekly, false); // Friday of the same week
});
