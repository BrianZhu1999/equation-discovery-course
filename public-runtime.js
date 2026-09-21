/* GitHub Pages storage adapter. Learning records never leave this browser. */
(function (root) {
  'use strict';
  const FIELDS = ['status', 'reading_done', 'formula_done', 'code_tier', 'commit', 'command', 'result', 'log_path', 'next_action', 'notes', 'controlled_change', 'failure_boundary', 'reproduction_kind', 'environment', 'target_reference', 'expected_result', 'tolerance', 'availability'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const yes = value => value === true || ['1', 'true', 'yes', 'done', '是', '完成'].includes(String(value).toLowerCase());
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);

  function createStore({storage, loadCourse, namespace = 'equation-discovery-course:v1', now = () => new Date()}) {
    let promise;
    const course = () => promise ||= Promise.resolve().then(loadCourse);
    const empty = c => ({study: {schema_version: 1, settings: {active_day: 1, hours_per_day: 6, start_date: localDate(now())}, papers: {}}, progress: c.lessons.map(p => ({rank: String(p.rank), key: p.key, status: 'not_started'}))});
    function settings(input) {
      if (!object(input)) throw Error('安排格式无效。');
      const {active_day: day, hours_per_day: hours, start_date: date} = input;
      if (!Number.isInteger(day) || day < 1 || day > 30 || !Number.isFinite(hours) || hours < .5 || hours > 16 || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw Error('课程日须为 1–30，每日时间为 0.5–16 小时，日期须有效。');
      return {active_day: day, hours_per_day: hours, start_date: date};
    }
    function normalize(value, c) {
      if (!object(value) || !object(value.study) || !object(value.study.papers) || !Array.isArray(value.progress)) throw Error('学习备份格式无效，原记录未改动。');
      const known = new Set(c.lessons.map(p => p.key));
      const result = empty(c);
      result.study.settings = settings(value.study.settings);
      for (const [key, r] of Object.entries(value.study.papers)) {
        if (!known.has(key) || !object(r)) throw Error('备份包含未知论文或无效学习记录。');
        const clean = {};
        for (const field of ['notes', 'next_review', 'updated_at']) {
          if (r[field] !== undefined) {
            if (typeof r[field] !== 'string') throw Error('学习记录字段应为文字。');
            clean[field] = r[field];
          }
        }
        if (r.next_review && (!/^\d{4}-\d{2}-\d{2}$/.test(r.next_review) || !Number.isFinite(Date.parse(r.next_review)))) throw Error('复习日期无效。');
        for (const field of ['reading_done', 'formula_done']) if (r[field] !== undefined) clean[field] = yes(r[field]);
        if (r.answers !== undefined) {
          if (!Array.isArray(r.answers) || r.answers.some(a => typeof a !== 'string')) throw Error('答案格式无效。');
          clean.answers = r.answers;
        }
        for (const field of ['score', 'review_count', 'mastery_streak']) if (r[field] !== undefined) {
          if (!Number.isInteger(r[field]) || r[field] < 0 || (field === 'score' && r[field] > 2)) throw Error('自评记录无效。');
          clean[field] = r[field];
        }
        if (r.proof_draft !== undefined) {
          if (!object(r.proof_draft)) throw Error('复现草稿无效。');
          clean.proof_draft = Object.fromEntries(Object.entries(r.proof_draft).filter(([k, v]) => FIELDS.includes(k) && typeof v === 'string'));
        }
        result.study.papers[key] = clean;
      }
      const seen = new Set();
      for (const row of value.progress) {
        if (!object(row) || !known.has(row.key) || seen.has(row.key)) throw Error('进度包含未知或重复论文。');
        seen.add(row.key);
        const target = result.progress.find(p => p.key === row.key);
        for (const f of FIELDS) if (row[f] !== undefined) {
          if (typeof row[f] !== 'string') throw Error('复现字段应为文字。');
          target[f] = row[f];
        }
        if (!['not_started', 'reading', 'in_progress', 'blocked', 'complete'].includes(target.status) || !['', 'T0', 'T1', 'T2', 'T3'].includes(target.code_tier || '') || !['', 'author_code', 'independent', 'theory'].includes(target.reproduction_kind || '')) throw Error('进度类型或等级无效。');
      }
      return result;
    }
    function read(c) {
      const raw = storage.getItem(namespace);
      if (!raw) return empty(c);
      try { return normalize(JSON.parse(raw), c); }
      catch { throw Error('浏览器中的记录无法读取，已保留原数据。请先导出原始记录或导入有效备份。'); }
    }
    function write(state) {
      // Keep the previous committed version; a quota error never reports success.
      const previous = storage.getItem(namespace);
      if (previous) storage.setItem(namespace + ':previous', previous);
      try { storage.setItem(namespace, JSON.stringify(state)); }
      catch { throw Error('浏览器无法保存记录，可能空间已满或禁用了存储。请导出备份。'); }
    }
    function validateProgress(p, old, updates) {
      if (!object(updates) || Object.keys(updates).some(k => !FIELDS.includes(k))) throw Error('未知进度字段。');
      const row = {...old, ...updates};
      if (!['not_started', 'reading', 'in_progress', 'blocked', 'complete'].includes(row.status) || !['', 'T0', 'T1', 'T2', 'T3'].includes(row.code_tier || '') || !['', 'author_code', 'independent', 'theory'].includes(row.reproduction_kind || '')) throw Error('状态、复现等级或类型无效。');
      const tier = row.code_tier, kind = row.reproduction_kind, complete = row.status === 'complete';
      if (kind === 'theory' && tier) throw Error('理论 / 综述记录须清空复现等级。');
      const required = tier === 'T0' ? ['commit'] : ['T1', 'T2', 'T3'].includes(tier) ? ['commit', 'command', 'result', 'log_path'] : [];
      if (['T2', 'T3'].includes(tier)) required.push('reproduction_kind', 'environment', 'target_reference', 'expected_result', 'tolerance');
      if (tier === 'T3' || complete) required.push('controlled_change', 'failure_boundary');
      if (complete) {
        if (p.evidence_status === 'metadata_only' || p.code_audit?.fulltext_available === false) throw Error('该论文仍缺核查全文，不能记为完成。');
        if (!yes(row.reading_done) || !yes(row.formula_done)) throw Error('完成前须阅读并独立推导。');
        const authorRequired = ['public_verified', 'author_link'].includes(p.code_audit?.verified_status);
        if (authorRequired && kind !== 'author_code') throw Error('已定位作者代码，独立实现不能替代作者代码复现。');
        if (!authorRequired) required.push('availability');
        if (kind === 'theory') {
          if (!(p.paper_type === 'review' || p.paper_type === 'theory' || (/\b(review|survey)\b/i.test(p.title) && p.method.startsWith('综述')))) throw Error('方法论文不能自行豁免代码目标。');
          required.push('notes');
        } else if (!['author_code', 'independent'].includes(kind) || !['T2', 'T3'].includes(tier)) throw Error('完成需 T2/T3，T1 只是最小运行。');
      }
      const missing = [...new Set(required)].filter(f => !String(row[f] || '').trim());
      if (missing.length) throw Error('请补充复现证据：' + missing.join('、'));
      return row;
    }
    return {
      async api(route, payload) {
        const c = await course();
        if (route === '/api/course') return clone(c);
        const state = read(c);
        if (route === '/api/state') return state;
        if (route === '/api/settings') state.study.settings = settings({...state.study.settings, ...payload.settings});
        else if (route === '/api/study') {
          if (!c.lessons.some(p => p.key === payload.key)) throw Error('未知论文。');
          const r = state.study.papers[payload.key] ||= {};
          for (const f of ['notes', 'answers', 'reading_done', 'formula_done', 'proof_draft']) if (payload[f] !== undefined) r[f] = payload[f];
          if (payload.score !== undefined) {
            const score = payload.score;
            if (![0, 1, 2].includes(score)) throw Error('自评只能是 0、1、2。');
            if (score > 0 && !r.answers?.some(a => String(a).trim())) throw Error('先填写回答，再记录自评。');
            const streak = score === 2 ? (r.mastery_streak || 0) + 1 : 0;
            const gap = score === 0 ? 1 : score === 1 ? 3 : [1, 3, 7, 14, 30][Math.min(streak - 1, 4)];
            const next = now(); next.setDate(next.getDate() + gap);
            Object.assign(r, {score, mastery_streak: streak, review_count: (r.review_count || 0) + 1, next_review: localDate(next)});
          }
          r.updated_at = now().toISOString();
        } else if (route === '/api/progress') {
          const p = c.lessons.find(p => p.key === payload.key);
          if (!p) throw Error('未知论文。');
          const index = state.progress.findIndex(row => row.key === p.key);
          state.progress[index] = validateProgress(p, state.progress[index], payload.updates);
        } else throw Error('未知课程操作。');
        write(normalize(state, c));
        return {saved: true};
      },
      async exportBackup() { return {format: 'equation-discovery-course', version: 1, exported_at: now().toISOString(), ...read(await course())}; },
      async importBackup(input) {
        if (input?.format !== 'equation-discovery-course' || input.version !== 1) throw Error('请选择本课程导出的 JSON 备份。');
        const value = normalize(input, await course());
        write(value);
      },
      rawBackup() { return storage.getItem(namespace) || '{}'; }
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = {createStore};
  else {
    const store = createStore({storage: root.localStorage, namespace: `equation-discovery-course:v1:${location.pathname.replace(/index\.html$/, '')}`, loadCourse: async () => {
      const r = await fetch('./data/course.json');
      if (!r.ok) throw Error('课程数据加载失败，请刷新重试。');
      return r.json();
    }});
    root.PublicCourse = {...store, download: async () => {
      let text;
      try { text = JSON.stringify(await store.exportBackup(), null, 2); }
      catch { text = store.rawBackup(); }
      const href = URL.createObjectURL(new Blob([text], {type: 'application/json;charset=utf-8'}));
      const a = document.createElement('a'); a.href = href; a.download = `course-progress-${localDate()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    }};
  }
})(typeof window === 'undefined' ? globalThis : window);
