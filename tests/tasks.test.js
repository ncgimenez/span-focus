const test = require('node:test');
const assert = require('node:assert');
const SpanCore = require('../js/core.js');

test('Tasks Synchronization & Normalization Contract', async (t) => {
  await t.test('cross-app task equivalence', () => {
    // When a task is created in Focus, it is normalized to work in Plan
    const focusTask = {
      id: 'focus_1',
      title: 'Acheter des légumes #home',
      category: 'Home',
      estimate: 1,
      isFavorite: true,
      completed: false,
      scheduledDate: '2026-10-28',
      scheduledTime: '17:30'
    };
    const normalized = SpanCore.normalizeTask(focusTask);

    // Plan can read its properties natively without any translation
    assert.strictEqual(normalized.context, 'life');
    assert.strictEqual(normalized.duration, 30);
    assert.strictEqual(normalized.important, true);
    assert.strictEqual(normalized.date, '2026-10-28');
    assert.strictEqual(normalized.time, '17:30');
    assert.strictEqual(normalized.type, 'task');

    // And Focus still reads its original properties natively
    assert.strictEqual(normalized.category, 'Home');
    assert.strictEqual(normalized.estimate, 1);
    assert.strictEqual(normalized.isFavorite, true);
    assert.strictEqual(normalized.scheduledDate, '2026-10-28');
    assert.strictEqual(normalized.scheduledTime, '17:30');
  });

  await t.test('event detection equivalence', () => {
    const eventTask = {
      id: 'ev_1',
      title: 'Dentiste',
      type: 'event',
      duration: 45
    };
    const norm = SpanCore.normalizeTask(eventTask);
    assert.strictEqual(norm.isEvent, true);
    assert.strictEqual(norm.type, 'event');
    assert.strictEqual(norm.duration, 45);
    assert.strictEqual(norm.estimate, 2); // 45m rounds to 2 pomodoro blocks
  });
});
