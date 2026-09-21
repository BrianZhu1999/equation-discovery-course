const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const deployed = fs.existsSync(path.join(__dirname, '../public-runtime.js'));
const {createStore} = require(deployed ? '../public-runtime.js' : '../web/public-runtime.js');
const source = deployed ? '../data/course.json' : '../content/lessons.json';
const data = JSON.parse(fs.readFileSync(path.join(__dirname, source), 'utf8'));
const course = deployed ? data : {lessons: data};
function setup() {
  const memory = new Map();
  const storage = {getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v)};
  const options = {storage, loadCourse: () => course, now: () => new Date(2026, 8, 21, 12)};
  return {memory, storage, store: createStore(options), fresh: () => createStore(options)};
}
const key = course.lessons[0].key;
test('fresh records are empty; saved notes and answers survive reload', async () => {
  const {store, fresh} = setup();
  assert.equal(Object.keys((await store.api('/api/state')).study.papers).length, 0);
  await store.api('/api/study', {key, notes: '<script>literal note</script>', answers: ['answer'], reading_done: true, score: 2});
  const r = (await fresh().api('/api/state')).study.papers[key];
  assert.equal(r.notes, '<script>literal note</script>');
  assert.deepEqual(r.answers, ['answer']);
  assert.equal(r.next_review, '2026-09-22');
});
test('blank answer cannot receive mastery; failed save leaves committed data intact', async () => {
  const {store} = setup();
  await store.api('/api/study', {key, notes: 'retain me'});
  await assert.rejects(store.api('/api/study', {key, notes: 'bad overwrite', answers: [], score: 2}));
  assert.equal((await store.api('/api/state')).study.papers[key].notes, 'retain me');
});
test('partial settings preserve previous values and reject out-of-range settings', async () => {
  const {store} = setup();
  await store.api('/api/settings', {settings: {hours_per_day: 4, active_day: 4}});
  await store.api('/api/settings', {settings: {active_day: 7}});
  await assert.rejects(store.api('/api/settings', {settings: {active_day: 31}}));
  await assert.rejects(store.api('/api/settings', {settings: {start_date: '2026-02-30'}}));
  const s = (await store.api('/api/state')).study.settings;
  assert.equal(s.active_day, 7); assert.equal(s.hours_per_day, 4);
});
test('backup roundtrip; duplicate or foreign records reject without overwriting', async () => {
  const {store} = setup();
  await store.api('/api/study', {key, notes: 'study note', answers: ['a']});
  const backup = await store.exportBackup();
  const target = setup().store;
  await target.importBackup(backup);
  assert.deepEqual(await target.api('/api/state'), await store.api('/api/state'));
  const duplicate = structuredClone(backup); duplicate.progress.push(duplicate.progress[0]);
  await assert.rejects(target.importBackup(duplicate));
  const foreign = structuredClone(backup); foreign.study.papers.__foreign = {};
  await assert.rejects(target.importBackup(foreign));
  assert.equal((await target.api('/api/state')).study.papers[key].notes, 'study note');
});
test('T2 requires evidence; independent implementation cannot complete author-code paper', async () => {
  const {store} = setup();
  const author = course.lessons.find(p => ['public_verified', 'author_link'].includes(p.code_audit?.verified_status));
  await assert.rejects(store.api('/api/progress', {key: author.key, updates: {code_tier: 'T2', reproduction_kind: 'author_code'}}));
  const updates = {code_tier: 'T2', reproduction_kind: 'independent', status: 'complete', reading_done: 'yes', formula_done: 'yes', commit: 'abc', command: 'python main.py', result: 'result', log_path: 'my-output.txt', environment: 'py', target_reference: 'Fig 1', expected_result: 'value', tolerance: '1%', controlled_change: 'noise', failure_boundary: 'missing term'};
  await assert.rejects(store.api('/api/progress', {key: author.key, updates}));
  updates.reproduction_kind = 'author_code';
  await store.api('/api/progress', {key: author.key, updates});
  assert.equal((await store.api('/api/state')).progress.find(p => p.key === author.key).code_tier, 'T2');
});
test('storage errors do not report success or erase existing data', async () => {
  const {store, storage} = setup();
  await store.api('/api/study', {key, notes: 'original'});
  storage.setItem = () => {throw Error('quota');};
  await assert.rejects(store.api('/api/study', {key, notes: 'new'}));
  assert.equal((await store.api('/api/state')).study.papers[key].notes, 'original');
});
