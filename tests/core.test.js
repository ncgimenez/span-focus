const test = require('node:test');
const assert = require('node:assert');
const SpanCore = require('../js/core.js');

test('SpanCore Utilities (span-focus)', async (t) => {
  await t.test('date and time math roundtrip', () => {
    assert.strictEqual(SpanCore.timeToMinutes('08:15'), 495);
    assert.strictEqual(SpanCore.minutesToTime(495), '08:15');
    assert.strictEqual(SpanCore.formatHour(14), '14:00');
  });

  await t.test('normalizeTask produces seamless Focus fields', () => {
    const raw = {
      id: 'f_50',
      title: 'Workout session',
      category: 'Fun',
      estimate: 3,
      isFavorite: false,
      completed: true
    };
    const norm = SpanCore.normalizeTask(raw);
    assert.strictEqual(norm.category, 'Fun');
    assert.strictEqual(norm.context, 'fun');
    assert.strictEqual(norm.estimate, 3);
    assert.strictEqual(norm.duration, 90);
    assert.strictEqual(norm.completed, true);
    assert.strictEqual(norm.isFavorite, false);
    assert.strictEqual(norm.important, false);
  });
});
