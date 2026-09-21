let C;
let S;
let view = 'today';
let selected = null;
let dirty = false;
let detailRevision = 0;
let savingCount = 0;
let actionChain = Promise.resolve();
const catalogFilters = {search:'', topic:'', 'filter-status':''};

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const pretty = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const statusNames = {
  not_started: '未开始', reading: '阅读中', in_progress: '进行中',
  blocked: '有阻塞', complete: '完成'
};
const codeNames = {
  public_verified: '仓库可访问', author_link: '作者链接', candidate: '候选待确认',
  unavailable: '公开材料受限', unverified: '尚未定位', not_audited: '待核查'
};
const kindNames = {
  author_code: '作者代码复现', independent: '独立实现', theory: '理论 / 综述'
};
const proofFields = [
  ['commit', '源码 commit / 归档版本'],
  ['environment', '实际运行环境及依赖版本'],
  ['target_reference', '原文目标图、表、公式或指标'],
  ['expected_result', '预先登记的预期结果'],
  ['tolerance', '预先登记的容差与比较规则'],
  ['command', '实际运行命令'],
  ['log_path', '本地日志或报告路径'],
  ['result', '实际结果'],
  ['controlled_change', '单因素改动'],
  ['failure_boundary', '适用条件与失败边界'],
  ['availability', '代码查找、访问证据或理论路径依据']
];

async function api(url, data) {
  return window.PublicCourse.api(url, data);
}


function msg(text, error = false) {
  $('#message').textContent = text;
  $('#message').className = error ? 'error' : '';
}

function record(p) {
  return S.study.papers[p.key] || {};
}

function progress(p) {
  return S.progress.find(item => item.key === p.key) || {};
}

function paper(key) {
  return C.lessons.find(item => item.key === key);
}

function trueValue(value) {
  return value === true || ['1', 'true', 'yes', 'done', '是', '完成'].includes(String(value).toLowerCase());
}

function learnedFlag(p, name) {
  const study = record(p);
  return trueValue(owns(study, name) ? study[name] : progress(p)[name]);
}

function hasAuthorCode(p) {
  return ['public_verified', 'author_link'].includes(p.code_audit?.verified_status);
}

function authorT2Done(p) {
  const saved = progress(p);
  return hasAuthorCode(p) && saved.reproduction_kind === 'author_code'
    && ['T2', 'T3'].includes(saved.code_tier);
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function row(p) {
  const saved = progress(p);
  const audit = p.code_audit || {};
  return `<article class="paper">
    <div class="paper-id">P${String(p.corpus_index).padStart(2, '0')}</div>
    <div>
      <h3 class="paper-title">${esc(p.title)}</h3>
      <div class="paper-meta">${esc(p.year)} · ${esc(p.journal)} · D${p.day} · ${esc(p.topic)}</div>
      <p>${esc(p.focus)}</p>
      <span class="badge">${p.track === 'core' ? '锚点精读' : '专题学习'}</span>
      <span class="badge">${learnedFlag(p, 'reading_done') ? '已读' : statusNames[saved.status] || '未开始'}</span>
      <span class="badge ${saved.code_tier ? '' : 'warn'}">${esc(saved.code_tier || '待复现')}</span>
      <span class="badge ${hasAuthorCode(p) ? '' : 'warn'}">${codeNames[audit.verified_status] || '待核查'}</span>
    </div>
    <button data-paper="${esc(p.key)}">进入学习</button>
  </article>`;
}

function updateStats() {
  const read = C.lessons.filter(p => learnedFlag(p, 'reading_done')).length;
  const done = C.lessons.filter(authorT2Done).length;
  const authors = C.lessons.filter(hasAuthorCode);
  $('#stats').innerHTML = `
    <div><b>${read}/${C.lessons.length}</b><span>阅读完成</span></div>
    <div><b>${done}/${authors.length}</b><span>作者代码 T2（自报）</span></div>
    <div><b>30</b><span>课程日</span></div>`;
  let low = 0;
  let high = 0;
  for (const p of authors) {
    low += p.reproduction_hours_estimate[0];
    high += p.reproduction_hours_estimate[1];
  }
  const reading = C.report.reading_hours_estimate + 16;
  const hours = Number(S.study.settings.hours_per_day);
  $('#capacity').textContent = `本月预算 ${Math.round(hours * 30)} h；阅读＋复盘约 ${Math.ceil(reading)} h。已定位代码全达 T2 粗估总计 ${Math.ceil(low + reading)}–${Math.ceil(high + reading)} h（估时，非实测）。`;
}

function renderToday(day) {
  const reviewDocument = {7: 'week1', 14: 'week2', 21: 'week3', 30: 'week4'}[day.day];
  return `<div class="layout">
    <section class="panel">
      <h2>今天的交付</h2><p>${esc(day.deliverable)}</p>
      ${reviewDocument ? `<p><a href="docs/${reviewDocument}.html" target="_blank">打开复盘工作表</a></p>` : ''}
      ${day.papers.map(key => row(paper(key))).join('')}
      ${day.review_questions.map(question => `<details><summary>${esc(question.q)}</summary><p>${esc(question.a)}</p></details>`).join('')}
      <div class="actions"><button id="next-day">${day.day === 30 ? '回到第 1 天' : '下一课程日'}</button><button data-view="lab">查看复现队列</button></div>
    </section>
    <aside class="panel">
      <h3>30 天课程</h3>
      <div class="days">${C.calendar.map(item => `<button data-day="${item.day}" class="${item.day === day.day ? 'active' : ''}" title="${esc(item.title)}">${item.day}</button>`).join('')}</div>
      <h3>每天的学习循环</h3>
      <p class="muted">先用三分钟说出昨天的核心结论，再读原文、独立推导、跑代码，最后闭卷解释。</p>
      <p class="muted">先修不熟时点进论文补课。D7、14、21、30 不加入新论文。</p>
      <a href="docs/calendar.html" target="_blank">完整日历与76篇索引</a>
    </aside>
  </div>`;
}

function renderCatalog() {
  return `<div class="filters">
    <input id="search" type="search" aria-label="搜索论文" placeholder="搜索标题、作者、P编号或关键词">
    <select id="topic" aria-label="主题筛选"><option value="">全部主题</option>${[...new Set(C.lessons.map(p => p.topic))].map(topic => `<option>${esc(topic)}</option>`).join('')}</select>
    <select id="filter-status" aria-label="进度筛选">
      <option value="">全部进度</option><option value="unread">尚未读完</option>
      <option value="core">20篇锚点</option><option value="code">已定位作者代码</option>
      <option value="missing">缺少全文</option>
    </select>
  </div><div class="panel" id="results"></div>`;
}

function renderReview() {
  const today = localDate();
  const scheduled = C.lessons.filter(p => record(p).next_review);
  const due = scheduled.filter(p => record(p).next_review <= today);
  return `<section class="panel">
    <h2>到期复习 ${due.length} 篇</h2>
    <p>在论文页先填写答案，再自评。完全掌握按 1、3、7、14、30 天间隔复习；忘记则次日重来。自评不会自动将论文记为完成。</p>
    ${due.length ? due.map(row).join('') : '<p class="empty">目前没有到期复习。先完成当天论文的自测并保存自评。</p>'}
    <h3>已安排复习</h3>
    ${scheduled.map(p => `<p><button data-paper="${esc(p.key)}">P${p.corpus_index} · ${esc(record(p).next_review)}</button> ${esc(p.title)}</p>`).join('') || '<p class="muted">暂无记录。</p>'}
  </section>`;
}

function renderLab() {
  const queue = C.lessons.filter(p => !authorT2Done(p)
    && !(p.paper_type === 'review' && progress(p).status === 'complete'
      && progress(p).reproduction_kind === 'theory'));
  return `<section class="panel">
    <h2>先完成第一天的小实验</h2>
    <p>从观测轨迹计算差分导数，手写 STLSQ；比较完整候选库、漏掉 xy 项、1% 测量噪声。已有一次实跑结果，但不会计入你的进度。</p>
    <pre>git clone https://github.com/BrianZhu1999/equation-discovery-course.git
cd equation-discovery-course
python -m pip install numpy scipy
python downloads/lab_sindy.py --out labs/runs/my_run</pre>
    <a href="docs/lab.html" target="_blank">打开逐步实验指导</a>
    <p class="notice">这是独立教学实现。之后仍须用每篇论文的作者代码复现一个支持核心结论的实验；所有公开代码论文的终点均为 T2。</p>
    <details><summary>环境与验收协议</summary>
      <p>T0：锁定源码版本、数据与环境。T1：最小示例运行。T2：原文配置和预先登记指标相符。T3：一次受控改动检验边界。CPU / MATLAB / Julia / GPU 分开建环境，不共用一个环境安装全部仓库。</p>
      <a href="docs/protocol.html" target="_blank">完整协议</a>
    </details>
  </section>
  <section class="panel" style="margin-top:20px">
    <h2>复现与代码核查队列 · ${queue.length} 篇</h2>
    <p>包括尚未定位代码的条目；“没有找到”不会被当成“没有代码”。作者代码目标达到 T2 后才从队列移出。课程不替你自动运行第三方脚本。</p>
    ${queue.map(row).join('')}
  </section>`;
}

function renderGuide() {
  return `<div class="course-map">
    <section class="panel">
      <h2>如何用这门课</h2>
      <p>26 个阅读日覆盖 76 篇，4 个复盘日串联方法。20 篇锚点多花时间推导；其余论文仍有独立任务和自测，有代码就进入 T2 队列。</p>
      <p>一个月是否足够取决于投入时间、数据和老环境恢复情况。上方估时会随每天时间变化；未通过的案例继续保留，避免以“跑过”代替“复现”。</p>
      <div class="links"><a href="docs/plan.html" target="_blank">完整课程说明</a><a href="docs/primer.html" target="_blank">数学补课手册</a><a href="docs/coach.html" target="_blank">与助手对话的规则</a></div>
    </section>
    <section class="panel">
      <h2>学习材料与来源</h2>
      <p>76 篇均有学习卡与出版页面链接。课程原始材料核查中 P52 缺全文，仍保留补全任务。逐篇摘要复用原综述的原文笔记；新设计的推导和实验任务没有冒充作者已报告的结果。</p>
      <a href="docs/audit.html" target="_blank">代码核查报告</a>
      <p><a href="podcasts/">8 期论文播客脚本</a> · <a href="downloads/lab_sindy.py" download>下载 Lorenz 教学脚本</a></p><h3>保存与备份</h3><p>笔记、自测、复现草稿和进度保存在当前浏览器。右上角可导出 JSON，并在另一设备导入；没有自动云同步。清除浏览器数据前请备份。</p>
    </section>
  </div>`;
}

function render() {
  updateStats();
  document.querySelectorAll('nav button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  const day = C.calendar[Number(S.study.settings.active_day) - 1];
  $('#heading').textContent = {
    today: `第 ${day.day} 天 · ${day.title}`, catalog: '把 76 篇连成一条知识路径。',
    review: '先回忆，再打开答案。', lab: '让一篇论文变成可复核的结果。',
    guide: '一个月的课程，有清楚的终点。'
  }[view];
  $('#subheading').textContent = view === 'catalog'
    ? '每篇都有出版链接、学习卡、先修、推导任务、实验目标和边界。'
    : '学习、推导与复现分别记录。时间不足时顺延实验，不降低验收标准。';
  const renderer = {today: () => renderToday(day), catalog: renderCatalog, review: renderReview, lab: renderLab, guide: renderGuide};
  $('#view').innerHTML = renderer[view]();
  if (view === 'catalog') {
    for (const [id, value] of Object.entries(catalogFilters)) $(`#${id}`).value = value;
    filter();
  }
}

function filter() {
  const query = ($('#search').value || '').toLowerCase();
  const topic = $('#topic').value;
  const kind = $('#filter-status').value;
  const results = C.lessons.filter(p => {
    const searchable = `${p.title} ${p.authors.join(' ')} ${p.focus} p${String(p.corpus_index).padStart(2, '0')}`.toLowerCase();
    const matchesKind = !kind
      || (kind === 'unread' && !learnedFlag(p, 'reading_done'))
      || (kind === 'core' && p.track === 'core')
      || (kind === 'code' && hasAuthorCode(p))
      || (kind === 'missing' && p.evidence_status === 'metadata_only');
    return (!query || searchable.includes(query)) && (!topic || p.topic === topic) && matchesKind;
  });
  $('#results').innerHTML = `<p class="muted">找到 ${results.length} 篇</p>`
    + (results.map(row).join('') || '<p class="empty">没有匹配论文，请调整筛选。</p>');
}

function draftValue(draft, saved, key, fallback = '') {
  // An intentionally emptied field in the draft must override prior progress.
  return owns(draft, key) ? draft[key] : saved[key] ?? fallback;
}

function options(values, value, placeholder) {
  const blank = placeholder === undefined ? '' : `<option value="" ${value === '' ? 'selected' : ''}>${placeholder}</option>`;
  return blank + Object.entries(values).map(([key, label]) => `<option value="${esc(key)}" ${value === key ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

function renderPaper(key) {
  const p = paper(key);
  const study = record(p);
  const saved = progress(p);
  const audit = p.code_audit || {};
  const draft = study.proof_draft && typeof study.proof_draft === 'object' ? study.proof_draft : {};
  const value = field => draftValue(draft, saved, field);
  const questions = C.questions[key] || [];
  const notes = owns(study, 'notes') ? study.notes : saved.notes || '';
  $('#paper-tag').textContent = `P${String(p.corpus_index).padStart(2, '0')} · 第${p.day}天 · ${p.topic}`;
  $('#detail').innerHTML = `
    <h2>${esc(p.title)}</h2><p class="muted">${esc(p.citation)}</p>
    <div class="links">
      <a href="https://doi.org/${encodeURIComponent(p.doi)}" target="_blank" rel="noreferrer">出版页面</a>
      <a href="${esc(p.card_url)}" target="_blank">完整学习卡</a>
    </div>
    <h3>先修</h3><div class="actions">
      ${p.prerequisite_keys.map(prerequisite => `<button data-paper="${esc(prerequisite)}">P${paper(prerequisite).corpus_index} ${learnedFlag(paper(prerequisite), 'reading_done') ? '已读' : '待巩固'}</button>`).join('') || '从数学诊断开始；无需其他论文。'}
    </div>
    <p>${esc(p.focus)}</p>
    <div class="two"><section><h3>这次要推导</h3><p>${esc(p.derivation)}</p></section><section><h3>这次只改变一个因素</h3><p>${esc(p.perturbation)}</p></section></div>
    <details><summary>方法、假设与限制</summary><h3>方法</h3><p>${esc(p.method)}</p><h3>假设</h3><pre>${esc(p.assumptions)}</pre><h3>边界</h3><pre>${esc(p.limitations)}</pre></details>
    <h3>先写下自己的解释</h3>
    <textarea id="notes" placeholder="用自己的话解释问题、关键公式、证据和疑问…">${esc(notes)}</textarea>
    <div class="actions">
      <label><input id="reading-done" type="checkbox" ${learnedFlag(p, 'reading_done') ? 'checked' : ''}> 已完成阅读</label>
      <label><input id="formula-done" type="checkbox" ${learnedFlag(p, 'formula_done') ? 'checked' : ''}> 已独立推导</label>
    </div>
    <h3>闭卷自测</h3><p class="muted">答案先写在这里，再展开核对。自评不代表系统自动判分。</p>
    ${questions.map((question, index) => `<section class="question"><p>${index + 1}. ${esc(question.q)}</p><textarea data-answer="${index}" aria-label="第${index + 1}题答案">${esc(study.answers?.[index] ?? '')}</textarea><details><summary>展开核对要点</summary><pre>${esc(question.a)}</pre></details></section>`).join('')}
    <div class="actions"><button id="save-study" class="primary">保存笔记与答案</button><button data-score="0">忘记了 · 明天复习</button><button data-score="1">部分掌握 · 3天后</button><button data-score="2">能独立解释 · 间隔复习</button></div>
    <div id="detail-status" role="status"></div>
    <h3>作者代码与运行入口</h3><p>${esc(codeNames[audit.verified_status] || '待核查')}。可访问不代表复现通过。</p>
    <div class="links">${(audit.urls || []).map(url => `<a href="${esc(url)}" target="_blank" rel="noreferrer">${esc(url)}</a>`).join('') || '尚未定位作者代码；保留核查任务。'}</div>
    <details><summary>已核查的入口、环境和阻塞</summary><pre>${esc(pretty({entrypoints: audit.entrypoints, environment: audit.environment, blockers: audit.blockers}))}</pre></details>
    <p>${esc(p.reproduction_target)}</p>
    <details><summary>登记复现证据</summary>
      <div class="formgrid">
        <label>记录类型<select data-proof="reproduction_kind">${options(kindNames, value('reproduction_kind'), '请选择记录类型')}</select></label>
        ${proofFields.map(([field, label]) => `<label>${label}<input data-proof="${field}" value="${esc(value(field))}"></label>`).join('')}
        <label>复现等级<select id="tier">${options({T0: 'T0', T1: 'T1', T2: 'T2', T3: 'T3'}, value('code_tier'), '未登记 / 理论记录')}</select></label>
        <label>学习状态<select id="progress-status">${options(statusNames, draftValue(draft, saved, 'status', 'not_started'), '请选择学习状态')}</select></label>
      </div>
      <p class="muted">T1及以上需登记日志或结果链接；T2还需环境、原文目标、预期结果与容差。公网版只检查字段，不核验本机文件或论文结果。理论 / 综述记录使用上方当前学习笔记，复现等级留空。自报登记不等于科学复核通过。</p>
      <button id="save-proof">保存复现证据</button>
    </details>
    <h3>继续和助手一起学</h3><p class="muted">下面的按钮只复制指令，之后在当前对话粘贴发送。</p>
    <button id="copy-coach">复制本篇带学指令</button>`;
}

function collectProofDraft() {
  const draft = Object.fromEntries([...document.querySelectorAll('[data-proof]')].map(input => [input.dataset.proof, input.value]));
  draft.code_tier = $('#tier').value;
  draft.status = $('#progress-status').value;
  return draft;
}

function collectStudy(proofOverride) {
  return {
    key: selected,
    notes: $('#notes').value,
    answers: [...document.querySelectorAll('[data-answer]')].map(input => input.value),
    reading_done: $('#reading-done').checked,
    formula_done: $('#formula-done').checked,
    proof_draft: proofOverride === undefined ? collectProofDraft() : proofOverride
  };
}

async function saveStudy(score, {silent = false, proofOverride} = {}) {
  if (!selected) return;
  const data = collectStudy(proofOverride);
  const revision = detailRevision;
  if (score !== undefined) data.score = score;
  savingCount += 1;
  try {
    await api('/api/study', data);
    S = await api('/api/state');
    if (selected === data.key && detailRevision === revision) dirty = false;
    if (!silent && selected === data.key) {
      $('#detail-status').textContent = score === undefined ? '笔记、答案与复现草稿已保存到本地。' : '已保存并安排下次复习。';
    }
    render();
  } finally {
    savingCount -= 1;
  }
}

async function flushPaper() {
  // New input during a request stays dirty and is saved before navigation.
  while (selected && dirty) await saveStudy(undefined, {silent: true});
}

async function openPaper(key) {
  if (key === selected && $('#paper-dialog').open) return;
  if (!paper(key)) throw Error('找不到这篇论文。');
  await flushPaper();
  selected = key;
  detailRevision = 0;
  dirty = false;
  renderPaper(key);
  if (!$('#paper-dialog').open) $('#paper-dialog').showModal();
}

async function closePaper() {
  await flushPaper();
  $('#paper-dialog').close();
  selected = null;
  dirty = false;
}

async function saveProof() {
  const key = selected;
  const proof = collectProofDraft();
  const updates = {
    ...proof,
    reading_done: $('#reading-done').checked ? 'yes' : 'no',
    formula_done: $('#formula-done').checked ? 'yes' : 'no',
    notes: $('#notes').value
  };
  if (!updates.reproduction_kind && updates.status === 'blocked') {
    delete updates.reproduction_kind;
  } else if (!updates.reproduction_kind) {
    throw Error('请选择记录类型；仅登记阻塞时可以暂不选择。');
  }
  savingCount += 1;
  try {
    await api('/api/progress', {key, updates});
    // Do not erase proof edits made while the validated save was in flight.
    const unchanged = selected === key && JSON.stringify(collectProofDraft()) === JSON.stringify(proof);
    await saveStudy(undefined, {silent: true, proofOverride: unchanged ? {} : undefined});
    $('#detail-status').textContent = unchanged
      ? '自报复现证据已保存（未核验本机日志），草稿已清除。'
      : '提交时的复现证据已保存；之后修改的内容保留为草稿。';
  } finally {
    savingCount -= 1;
  }
}

async function saveSettings() {
  await api('/api/settings', {settings: {
    active_day: Number($('#day').value),
    hours_per_day: Number($('#hours').value),
    start_date: $('#start-date').value
  }});
  S = await api('/api/state');
  render();
  msg('安排已保存。');
}

async function handleClick(button) {
  if (button.id === 'export-progress') { await flushPaper(); return window.PublicCourse.download(); }
  if (button.id === 'import-progress') { await flushPaper(); $('#import-file').click(); return; }
  if (button.dataset.paper) return openPaper(button.dataset.paper);
  if (button.id === 'close-dialog') return closePaper();
  if (button.id === 'save-study') return saveStudy();
  if (button.dataset.score !== undefined) return saveStudy(Number(button.dataset.score));
  if (button.id === 'save-proof') return saveProof();
  if (button.dataset.view) {
    view = button.dataset.view;
    render();
  } else if (button.dataset.day) {
    await api('/api/settings', {settings: {active_day: Number(button.dataset.day)}});
    S = await api('/api/state');
    $('#day').value = S.study.settings.active_day;
    view = 'today';
    render();
  } else if (button.id === 'next-day') {
    $('#day').value = Number(S.study.settings.active_day) % 30 + 1;
    await saveSettings();
  } else if (button.id === 'save-settings') {
    await saveSettings();
  } else if (button.id === 'copy-coach') {
    const p = paper(selected);
    const prompt = `请按本站对话教练协议带我学习 P${p.corpus_index}：${p.title}。学习卡：${new URL(p.card_url, location.href).href}。先读学习卡与出版原文，向我提一个诊断问题，再根据我的回答推进推导与复现。个人笔记由我提供。不要直接替我答完，不要将示例运行算成论文复现。`;
    await navigator.clipboard.writeText(prompt);
    $('#detail-status').textContent = '带学指令已复制。';
  }
}

function enqueue(action) {
  actionChain = actionChain.then(action).catch(error => {
    if ($('#paper-dialog').open && $('#detail-status')) $('#detail-status').textContent = error.message;
    else msg(error.message, true);
  });
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button && C && S) enqueue(() => handleClick(button));
});

function handleInput(event) {
  if (selected && event.target.closest('#detail')) {
    dirty = true;
    detailRevision += 1;
  }
  if (['search', 'topic', 'filter-status'].includes(event.target.id)) {
    catalogFilters[event.target.id] = event.target.value;
    filter();
  }
}

document.addEventListener('input', handleInput);
document.addEventListener('change', handleInput);
$('#paper-dialog').addEventListener('cancel', event => {
  event.preventDefault();
  enqueue(closePaper);
});
window.addEventListener('beforeunload', event => {
  if (dirty || savingCount > 0) {
    event.preventDefault();
    event.returnValue = '';
  }
});

(async function initialize() {
  try {
    [C, S] = await Promise.all([api('/api/course'), api('/api/state')]);
    $('#day').innerHTML = C.calendar.map(day => `<option value="${day.day}">${day.day} · ${esc(day.title)}</option>`).join('');
    $('#day').value = S.study.settings.active_day;
    $('#start-date').value = S.study.settings.start_date;
    $('#hours').value = S.study.settings.hours_per_day;
    render();
  } catch (error) {
    msg('无法载入课程：' + error.message, true);
    $('#view').innerHTML = '<p>课程数据加载失败，请检查网络后刷新；已有浏览器记录不会清空。</p>';
  }
})();

$('#import-file').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;
  enqueue(async () => {
    if (file.size > 8_000_000) throw Error('备份文件过大，请选择课程导出的 JSON。');
    const input = JSON.parse(await file.text());
    if (!confirm('导入将替换当前浏览器的课程记录。当前记录会保留上一版本；建议先导出备份。确认导入？')) return;
    await window.PublicCourse.importBackup(input);
    S = await api('/api/state');
    $('#day').value = S.study.settings.active_day;
    $('#hours').value = S.study.settings.hours_per_day;
    $('#start-date').value = S.study.settings.start_date;
    render(); msg('记录已导入当前浏览器。');
  });
  event.target.value = '';
});
