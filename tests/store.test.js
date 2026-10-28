const test = require('node:test');
const assert = require('node:assert');
const SpanCore = require('../js/core.js');

test('SpanReactiveStore (span-focus)', async (t) => {
  await t.test('Store handles task lifecycle and categories', () => {
    const store = new SpanCore.SpanReactiveStore('test_focus_store');
    const t1 = store.addTask({
      title: 'Review PRs #work',
      category: 'Work',
      estimate: 1
    }, 'test');

    assert.strictEqual(store.getTasks().length, 1);
    assert.strictEqual(t1.category, 'Work');
    assert.strictEqual(t1.context, 'work');
    assert.strictEqual(t1.estimate, 1);
    assert.strictEqual(t1.duration, 30);

    store.updateTask(t1.id, { completed: true }, 'test');
    assert.strictEqual(store.getTask(t1.id).completed, true);

    store.deleteTask(t1.id, 'test');
    assert.strictEqual(store.getTasks().length, 0);
  });
});
