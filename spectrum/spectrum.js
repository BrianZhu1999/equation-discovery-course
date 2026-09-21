/* 方程发现谱图：独立于课程主页的可读三维 atlas。 */
(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const els = {
    canvas: $('#spectrum-canvas'), stage: $('#map-stage'), labels: $('#label-layer'), stages: $('#stage-layer'),
    loading: $('#loading'), legend: $('#legend'), status: $('#map-status'), detail: $('#detail-panel'),
    search: $('#search'), range: $('#year-range'), rangeValue: $('#year-value'), classic: $('#classic-only'),
    edges: $('#show-edges'), branchFilters: $('#branch-filters'), reset: $('#reset-view'), mode: $('#mode-toggle'),
    fallback: $('#fallback-board'), fallbackContent: $('#fallback-content'), count: $('#count-label')
  };

  const COLORS = {
    sparse_library: 0x4fd7e6, symbolic_search: 0xffad68, neural_hybrid: 0xb294ff,
    geometry_conservation: 0x75ddae, stochastic_memory: 0x80b6ff, coarse_graining: 0xff8795,
    bridge: 0xd1bbff, validation: 0xa6d9a6, stage: 0xd5e8ed
  };
  const COLOR_CSS = { sparse_library: '#50d7e6', symbolic_search: '#ffad68', neural_hybrid: '#b294ff', geometry_conservation: '#75ddae', stochastic_memory: '#80b6ff', coarse_graining: '#ff8795', bridge: '#d1bbff', validation: '#a6d9a6' };
  const FAMILY_LABELS = { sparse_library: '稀疏库与回归', symbolic_search: '符号搜索', neural_hybrid: '神经—代理混合', geometry_conservation: '几何与守恒', stochastic_memory: '随机与记忆', coarse_graining: '粗粒化与闭合' };

  function familyRecord(id) { return state && state.data && (state.data.families || []).find(f => f.id === id); }
  function familyHex(id) { const f = familyRecord(id); return (f && f.color) || COLOR_CSS[id] || '#d5e8ed'; }
  function familyInt(id) { return parseInt(familyHex(id).replace('#', ''), 16) || 0xd5e8ed; }

  /* 小型无依赖轨道控制器：避免把关键交互绑定到 OrbitControls 的外部版本。 */
  class BasicOrbitControls {
    constructor(camera, dom) {
      this.camera = camera; this.dom = dom; this.target = new THREE.Vector3(); this.radius = 23; this.theta = 0; this.phi = Math.PI / 2; this.dragging = false; this.lastX = 0; this.lastY = 0;
      dom.addEventListener('pointerdown', e => { this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY; dom.setPointerCapture?.(e.pointerId); });
      dom.addEventListener('pointermove', e => { if (!this.dragging) return; const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY; this.lastX = e.clientX; this.lastY = e.clientY; this.theta -= dx * .008; this.phi = Math.max(.22, Math.min(Math.PI - .22, this.phi + dy * .008)); });
      dom.addEventListener('pointerup', e => { this.dragging = false; dom.releasePointerCapture?.(e.pointerId); });
      dom.addEventListener('pointercancel', () => { this.dragging = false; });
      dom.addEventListener('wheel', e => { e.preventDefault(); this.radius = Math.max(7, Math.min(45, this.radius * Math.exp(e.deltaY * .0008))); }, { passive: false });
      this.update();
    }
    update() { const s = Math.sin(this.phi); this.camera.position.set(this.target.x + this.radius * s * Math.sin(this.theta), this.target.y + this.radius * Math.cos(this.phi), this.target.z + this.radius * s * Math.cos(this.theta)); this.camera.lookAt(this.target); }
  }

  const fallbackData = {
    metadata: { title: '方程发现方法谱图', subtitle: '由数据走向可验证规律', version: 'fallback' },
    families: Object.entries(FAMILY_LABELS).map(([id, label]) => ({ id, label })),
    stages: [
      { id: 'observe', label: '观测与表示', description: '轨迹、场、粒子或延迟坐标' },
      { id: 'differentiate', label: '导数与弱化', description: '微分、测试函数、神经代理' },
      { id: 'library', label: '候选表达空间', description: '候选库、表达式树或物理量' },
      { id: 'search', label: '结构搜索', description: '稀疏回归、枚举、遗传或贝叶斯' },
      { id: 'validate', label: '约束与验证', description: '稳定性、泛化、实验与闭合' }
    ],
    nodes: [
      { id: 'f-sparse', type: 'family', label: '稀疏恢复', family: 'sparse_library', x: 2, y: 2, z: 0, importance: 'anchor' },
      { id: 'f-symbolic', type: 'family', label: '符号搜索', family: 'symbolic_search', x: 2, y: -2, z: 0, importance: 'anchor' },
      { id: 'f-geometry', type: 'family', label: '几何与守恒', family: 'geometry_conservation', x: 2, y: 0, z: 1, importance: 'anchor' },
      { id: 'f-stochastic', type: 'family', label: '随机与记忆', family: 'stochastic_memory', x: 3, y: -1, z: 1, importance: 'anchor' },
      { id: 'p10', type: 'paper', corpus_index: 10, key: 'bruntonDiscoveringGoverningEquations2016', label: 'SINDy', title: 'Discovering governing equations from data by sparse identification of nonlinear dynamical systems', year: 2016, family: 'sparse_library', stage: 'search', x: 3, y: 2, z: 0, importance: 'anchor', method: 'STLSQ；候选函数库；稀疏系数', doi: '10.1073/pnas.1517384113' },
      { id: 'p04', type: 'paper', corpus_index: 4, key: 'rudyDatadrivenDiscoveryPartial2017', label: 'PDE-FIND', title: 'Data-driven discovery of partial differential equations', year: 2017, family: 'sparse_library', stage: 'library', x: 2.3, y: 2, z: 0, importance: 'anchor', method: '空间导数候选库；稀疏回归', doi: '10.1126/sciadv.1602614' },
      { id: 'p16', type: 'paper', corpus_index: 16, key: 'messengerWeakSindyPartial2021', label: 'Weak SINDy', title: 'Weak SINDy for partial differential equation discovery', year: 2021, family: 'sparse_library', stage: 'differentiate', x: 1.2, y: 2, z: 1, importance: 'anchor', method: '局部测试函数；积分分部；弱形式' },
      { id: 'p02', type: 'paper', corpus_index: 2, key: 'ruanDiscoveringPhysicalLaws2025', label: '并行符号枚举', title: 'Discovering physical laws with parallel symbolic enumeration', year: 2025, family: 'symbolic_search', stage: 'search', x: 3.2, y: -2, z: 2, importance: 'anchor', method: '并行表达式枚举；复杂度控制' },
      { id: 'p03', type: 'paper', corpus_index: 3, key: 'udrescuAIFeynmanPhysicsInspired2020', label: 'AI Feynman', title: 'AI Feynman: A physics-inspired method for symbolic regression', year: 2020, family: 'symbolic_search', stage: 'library', x: 2.3, y: -2, z: 1, importance: 'anchor', method: '对称性、可分离性与递归搜索' },
      { id: 'p26', type: 'paper', corpus_index: 26, key: 'luDiscoveringConservationLaws2023', label: '守恒律与流形', title: 'Discovering conservation laws using optimal transport and manifold learning', year: 2023, family: 'geometry_conservation', stage: 'validate', x: 4.2, y: 0, z: 2, importance: 'anchor', method: '最优输运；流形学习；守恒量' },
      { id: 'p12', type: 'paper', corpus_index: 12, key: 'raissiHiddenPhysicsModels2018', label: 'Hidden Physics Models', title: 'Hidden physics models: Machine learning of nonlinear partial differential equations', year: 2018, family: 'neural_hybrid', stage: 'differentiate', x: 1.4, y: 1, z: 0, importance: 'anchor', method: '高斯过程核；参数反演' },
      { id: 'p14', type: 'paper', corpus_index: 14, key: 'bothDeepMoDDeepLearning2021', label: 'DeepMoD', title: 'DeepMoD: Deep learning for model discovery in noisy data', year: 2021, family: 'neural_hybrid', stage: 'search', x: 3, y: 1, z: 1, importance: 'anchor', method: '神经代理；自动微分；稀疏选择' },
      { id: 'p57', type: 'paper', corpus_index: 57, key: 'boninsegnaSparseLearningStochastic2018', label: '随机 SINDy', title: 'Sparse learning of stochastic dynamical equations', year: 2018, family: 'stochastic_memory', stage: 'validate', x: 4, y: -1, z: 0, importance: 'anchor', method: '漂移—扩散分解；随机项辨识' },
      { id: 'p51', type: 'paper', corpus_index: 51, key: 'supekarLearningHydrodynamicEquations2023', label: '主动物质水动力', title: 'Learning hydrodynamic equations for active matter from particle simulations and experiments', year: 2023, family: 'coarse_graining', stage: 'validate', x: 4.2, y: -2, z: 1, importance: 'anchor', method: '粒子到场；粗粒化方程；实验验证' }
    ],
    edges: [{ source: 'p04', target: 'p10', type: 'pipeline' }, { source: 'p10', target: 'p16', type: 'bridge' }, { source: 'p03', target: 'p02', type: 'pipeline' }, { source: 'p10', target: 'p14', type: 'bridge' }, { source: 'p26', target: 'p51', type: 'evidence' }]
  };

  const state = { data: null, nodes: [], edges: [], activeFamily: 'all', query: '', year: 2007, classic: false, showEdges: true, mode: '3d', selected: null, scene: null, camera: null, renderer: null, controls: null, lite: false, liteCtx: null, liteView: { theta: -.22, phi: -.2, zoom: 1 }, liteProjected: new Map(), objectById: new Map(), positions: new Map(), edgeObjects: [], raycaster: null, pointer: null, animation: null };

  function normalize(raw) {
    const input = raw && (raw.nodes || raw.papers) ? raw : fallbackData;
    /* 新数据构建器使用 meta/stages/families/papers/bridges/edges；把它展开成
       前端统一的 nodes/edges，保留每篇论文的真实课程字段。 */
    const familyList = input.families || [];
    const stageList = input.stages || [];
    const stageMap = new Map(stageList.map((s, i) => [s.id, { ...s, index: i, x: Number.isFinite(s.x) ? s.x : i }]));
    const familyMap = new Map(familyList.map((f, i) => [f.id, { ...f, index: i, y: Number.isFinite(f.y) ? f.y : i }]));
    let sourceNodes = input.nodes;
    if (!sourceNodes && Array.isArray(input.papers)) {
      sourceNodes = [];
      /* 阶段—家族节点让 pipeline 边有可点击、可见的承载点。 */
      familyList.forEach((f, fi) => {
        sourceNodes.push({ id: `family:${f.id}`, type: 'family', family: f.id, label: f.label, x: 2.5, y: f.y ?? fi, z: -1.8, importance: 'anchor', description: f.summary });
        stageList.forEach((s, si) => sourceNodes.push({ id: `stage:${f.id}:${s.id}`, type: 'stage', family: f.id, stage: s.id, label: `${f.short || f.label} · ${s.short || s.label}`, x: Number.isFinite(s.x) ? s.x : si, y: f.y ?? fi, z: -1.4, importance: 'support', description: s.question }));
      });
      input.papers.forEach(p => sourceNodes.push({ ...p, id: p.id || `P${String(p.corpus_index).padStart(2, '0')}`, type: 'paper', label: `P${String(p.corpus_index).padStart(2, '0')}`, stage: p.stage, family: p.family, x: stageMap.get(p.stage)?.x ?? 0, y: familyMap.get(p.family)?.y ?? 0, z: Number(p.year) || 0, importance: Number(p.importance) >= 3 ? 'anchor' : 'support', description: p.focus, card_path: p.card_url, source_url: p.source_url }));
      (input.bridges || []).forEach((b, bi) => sourceNodes.push({ id: `bridge:${b.id}`, type: 'bridge', family: 'bridge', label: b.label, x: 2.5, y: (bi - 1) * .75, z: 2.1, importance: 'anchor', description: b.summary, bridge: b }));
    }
    const allNodes = (sourceNodes || []).map((n, i) => {
      const stage = stageMap.get(n.stage) || stageMap.get(n.stage_id);
      const family = n.family || n.branch || (n.type === 'bridge' ? 'bridge' : 'sparse_library');
      const stageIndex = Number.isFinite(n.stageIndex) ? n.stageIndex : (stage ? stage.index : (Number.isFinite(n.x) ? n.x : 0));
      const year = Number(n.year) || 0;
      const corpus = n.corpus_index || n.corpusIndex || n.corpusId;
      const id = String(n.id || n.key || `node-${i}`);
      const importance = typeof n.importance === 'number' ? (n.importance >= 3 ? 'anchor' : 'support') : (n.importance || 'support');
      return { ...n, id, family, familyLabel: (familyMap.get(family) || {}).label || FAMILY_LABELS[family] || '桥接方法', stage: n.stage || n.stage_id || (stage && stage.id), stageLabel: (stage && stage.label) || n.stageLabel || '', stageIndex, year, corpus_index: corpus, label: n.label || n.shortTitle || (corpus ? `P${String(corpus).padStart(2, '0')}` : id), title: n.title || n.label || id, type: n.type || 'paper', importance, method: n.method || n.focus || '', description: n.description || n.focus || '', limitations: n.limitations || '', tags: n.tags || [], _schema: Boolean(input.papers) };
    });
    const byId = new Set(allNodes.map(n => n.id));
    const edges = (input.edges || []).filter(e => byId.has(String(e.source)) && byId.has(String(e.target))).map(e => ({ ...e, type: e.type || e.kind || 'pipeline', source: String(e.source), target: String(e.target) }));
    (input.bridges || []).forEach(b => {
      const bridgeId = `bridge:${b.id}`;
      const papers = (b.paper_ids || []).map(id => `P${String(id).padStart(2, '0')}`).filter(id => byId.has(id));
      papers.slice(0, 8).forEach(paperId => edges.push({ source: bridgeId, target: paperId, type: 'bridge-association', label: b.label }));
    });
    return { ...input, stages: input.stages || [], families: input.families || [], nodes: allNodes, edges };
  }

  function isVisible(n) {
    const text = [n.title, n.label, n.key, n.method, n.description, n.topic, n.familyLabel, String(n.corpus_index || '')].join(' ').toLowerCase();
    return (state.activeFamily === 'all' || n.family === state.activeFamily || (state.activeFamily === 'bridge' && ['bridge', 'validation'].includes(n.type))) && (!state.query || text.includes(state.query.toLowerCase())) && (!n.year || n.year >= state.year) && (!state.classic || n.importance === 'anchor' || n.importance === 'classic' || n.type === 'family' || n.type === 'stage');
  }

  function positionFor(n) {
    if (Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)) {
      if (n._schema) return new THREE.Vector3((n.x - 2.5) * 3.35, (n.y - 2.5) * 1.75, n.type === 'paper' ? (n.z - 2016) * .19 : (n.z - 1) * 2.4);
      return new THREE.Vector3((n.x - 2.5) * 4.2, n.y * 2.2, (n.z - 1) * 2.4);
    }
    const stage = Number.isFinite(n.stageIndex) ? n.stageIndex : 0;
    const lane = Object.keys(FAMILY_LABELS).indexOf(n.family);
    return new THREE.Vector3((stage - 2) * 4.1, (lane - 2.5) * 1.35, ((n.year || 2016) - 2016) * .28);
  }

  function materialFor(family, opacity = 1) {
    const color = familyInt(family);
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .34, roughness: .44, metalness: .24, transparent: opacity < 1, opacity });
  }

  function makeTextSprite(text, color) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.font = '600 28px Arial, Microsoft YaHei'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = '#04101b'; ctx.shadowBlur = 12; ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })); sprite.scale.set(4.3, 1.08, 1); return sprite;
  }

  function addGridAndStages() {
    const group = new THREE.Group(); group.name = 'structure'; state.scene.add(group);
    const grid = new THREE.GridHelper(48, 24, 0x234051, 0x163042); grid.rotation.x = Math.PI / 2; grid.position.z = -3.4; grid.material.transparent = true; grid.material.opacity = .27; group.add(grid);
    const stages = state.data.stages || [];
    stages.forEach((s, i) => {
      const x = (i - (stages.length - 1) / 2) * 4.1;
      const lineMat = new THREE.LineBasicMaterial({ color: 0x356176, transparent: true, opacity: .32 });
      const points = [new THREE.Vector3(x, -8, -3), new THREE.Vector3(x, 8, -3)]; const geo = new THREE.BufferGeometry().setFromPoints(points); group.add(new THREE.Line(geo, lineMat));
      const sprite = makeTextSprite(s.label || s.id, 'rgba(176,215,228,.72)'); sprite.position.set(x, 8.25, -3); sprite.scale.set(4.8, .58, 1); group.add(sprite);
      const overlay = document.createElement('span'); overlay.className = 'stage-label'; overlay.dataset.stage = s.id; overlay.textContent = `${String(i + 1).padStart(2, '0')} · ${s.label || s.id}`; els.stages.appendChild(overlay);
    });
  }

  function addNode(n) {
    const p = positionFor(n); state.positions.set(n.id, p);
    let geometry; let size; let opacity = 1;
    if (n.type === 'family') { geometry = new THREE.IcosahedronGeometry(.48, 1); size = 1; }
    else if (n.type === 'stage') { geometry = new THREE.BoxGeometry(.35, .35, .35); size = 1; opacity = .8; }
    else if (n.type === 'validation') { geometry = new THREE.OctahedronGeometry(.24, 0); size = .9; }
    else if (n.type === 'bridge') { geometry = new THREE.TorusGeometry(.2, .075, 8, 18); size = 1; }
    else { geometry = new THREE.SphereGeometry(n.importance === 'anchor' || n.importance === 'classic' ? .27 : .17, 16, 12); size = n.importance === 'anchor' || n.importance === 'classic' ? 1.3 : 1; }
    const mesh = new THREE.Mesh(geometry, materialFor(n.family, opacity)); mesh.position.copy(p); mesh.userData.node = n; mesh.userData.baseScale = size; mesh.scale.setScalar(size); state.scene.add(mesh); state.objectById.set(n.id, mesh);
    if (n.importance === 'anchor' || n.type === 'family') { const halo = new THREE.Mesh(new THREE.SphereGeometry(.42 * size, 16, 12), new THREE.MeshBasicMaterial({ color: familyInt(n.family), transparent: true, opacity: .075, depthWrite: false })); halo.position.copy(p); halo.userData.node = n; halo.userData.halo = true; state.scene.add(halo); }
  }

  function addEdges() {
    if (state.lite) { drawLite(); return; }
    state.edgeObjects.forEach(obj => state.scene.remove(obj)); state.edgeObjects = [];
    if (!state.showEdges) return;
    state.data.edges.forEach(e => {
      const a = state.positions.get(e.source), b = state.positions.get(e.target); if (!a || !b) return;
      const pts = [a, b]; const geo = new THREE.BufferGeometry().setFromPoints(pts); const bridge = String(e.type || '').includes('bridge') || String(e.type || '').includes('association'); const evidence = String(e.type || '').includes('evidence'); const color = bridge ? 0xb294ff : evidence ? 0x75ddae : 0x53879b; const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: bridge ? .55 : .32 }); const line = new THREE.Line(geo, mat); line.userData.edge = e; state.scene.add(line); state.edgeObjects.push(line);
    });
  }

  function litePosition(n) {
    const stage = Number.isFinite(n.stageIndex) ? n.stageIndex : 0;
    const family = (state.data.families || []).find(f => f.id === n.family);
    const lane = Number.isFinite(family && family.y) ? family.y : Math.max(0, Object.keys(FAMILY_LABELS).indexOf(n.family));
    const z = n.type === 'paper' ? ((n.year || 2016) - 2016) * .34 : (n.type === 'bridge' ? 4.6 : -3.2);
    return { x: (stage - ((state.data.stages || []).length - 1) / 2) * 4.15, y: (lane - 2.5) * 1.45, z };
  }

  function liteProject(p, width, height) {
    const v = state.liteView;
    const cy = Math.cos(v.theta), sy = Math.sin(v.theta);
    const x1 = p.x * cy - p.z * sy, z1 = p.x * sy + p.z * cy;
    const cp = Math.cos(v.phi), sp = Math.sin(v.phi);
    const y1 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp;
    const depth = Math.max(.38, 1 + z2 / 42);
    const scale = Math.min(width, height) * .053 * v.zoom / depth;
    return { x: width / 2 + x1 * scale, y: height / 2 - y1 * scale, z: z2, depth, scale };
  }

  function drawLite() {
    if (!state.liteCtx) return;
    const canvas = els.canvas, ctx = state.liteCtx, width = els.stage.clientWidth, height = els.stage.clientHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(3, 13, 23, .32)'; ctx.fillRect(0, 0, width, height);
    const project = id => state.liteProjected.get(id);
    // faint spatial grid gives the projected map a stable frame of reference
    ctx.save(); ctx.strokeStyle = 'rgba(104, 166, 184, .13)'; ctx.lineWidth = 1;
    for (let i = -7; i <= 7; i++) { const a = liteProject({ x: i * 3.2, y: -5.1, z: -3.4 }, width, height); const b = liteProject({ x: i * 3.2, y: 5.1, z: -3.4 }, width, height); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    for (let i = -4; i <= 4; i++) { const a = liteProject({ x: -13, y: i * 1.35, z: -3.4 }, width, height); const b = liteProject({ x: 13, y: i * 1.35, z: -3.4 }, width, height); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.restore();
    state.liteProjected.clear();
    const visibleNodes = state.data.nodes.filter(isVisible).map(n => ({ n, p: litePosition(n) })).sort((a, b) => a.p.z - b.p.z);
    visibleNodes.forEach(({ n, p }) => state.liteProjected.set(n.id, { ...liteProject(p, width, height), node: n }));
    if (state.showEdges) {
      state.data.edges.forEach(e => { const a = project(e.source), b = project(e.target); if (!a || !b) return; ctx.save(); ctx.strokeStyle = e.type === 'learning-bridge' || e.type === 'bridge' ? 'rgba(188, 145, 255, .66)' : e.type === 'evidence' ? 'rgba(117, 221, 174, .64)' : 'rgba(89, 151, 173, .34)'; ctx.lineWidth = e.type === 'pipeline' ? 1.1 : 1.7; ctx.setLineDash(e.type === 'paper-placement' ? [2, 4] : []); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore(); });
    }
    visibleNodes.forEach(({ n }) => { const q = project(n.id); if (!q) return; const base = n.type === 'family' ? 8 : n.type === 'bridge' ? 6 : n.importance === 'anchor' ? 5.5 : n.type === 'stage' ? 3 : 3.2; const r = Math.max(2, base * Math.sqrt(q.depth) * state.liteView.zoom); const color = familyHex(n.family); ctx.save(); ctx.globalAlpha = n.type === 'stage' ? .56 : .96; ctx.shadowColor = color; ctx.shadowBlur = n.importance === 'anchor' || n.type === 'family' ? 15 : 7; ctx.fillStyle = color; ctx.strokeStyle = state.selected && state.selected.id === n.id ? '#ffffff' : color; ctx.lineWidth = state.selected && state.selected.id === n.id ? 2.6 : 1; if (n.type === 'stage') { ctx.fillRect(q.x - r / 2, q.y - r / 2, r, r); } else if (n.type === 'bridge') { ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(q.x, q.y, r * .42, 0, Math.PI * 2); ctx.stroke(); } else { ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } ctx.restore(); });
    updateLabels();
  }

  function createLiteScene(message) {
    state.lite = true; state.liteCtx = els.canvas.getContext('2d'); els.canvas.hidden = false; els.labels.hidden = false; els.stages.hidden = false; els.fallback.hidden = true; els.loading.classList.add('done'); els.canvas.style.cursor = 'grab'; state.data.nodes.forEach(n => state.positions.set(n.id, litePosition(n))); resize(); state.data.nodes.forEach(n => state.objectById.set(n.id, { userData: { node: n, baseScale: 1 }, material: { emissiveIntensity: .34 } })); drawLite(); els.status.textContent = message || '本地透视渲染 · 拖动旋转 · 滚轮缩放 · 点击节点查看'; els.canvas.addEventListener('pointerdown', onPointerDown); els.canvas.addEventListener('pointermove', onPointerMove); els.canvas.addEventListener('pointerup', onPointerUp); els.canvas.addEventListener('wheel', onLiteWheel, { passive: false }); window.addEventListener('resize', resize); state.animation = requestAnimationFrame(animate);
  }

  function onLiteWheel(e) { e.preventDefault(); state.liteView.zoom = Math.max(.55, Math.min(2.1, state.liteView.zoom * Math.exp(-e.deltaY * .0008))); drawLite(); }

  function createScene() {
    if (!window.THREE) { createLiteScene('本地透视渲染（未依赖外部 WebGL 库） · 拖动旋转 · 滚轮缩放 · 点击节点查看'); return; }
    state.pointer = new THREE.Vector2();
    const width = els.stage.clientWidth, height = els.stage.clientHeight;
    state.scene = new THREE.Scene(); state.scene.fog = new THREE.FogExp2(0x071421, .014); state.camera = new THREE.PerspectiveCamera(43, width / height, .1, 300); state.camera.position.set(0, 0, 23);
    state.renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, alpha: true }); state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); state.renderer.setSize(width, height, false); state.renderer.outputColorSpace = THREE.SRGBColorSpace; state.renderer.toneMapping = THREE.ACESFilmicToneMapping; state.renderer.toneMappingExposure = 1.08;
    state.scene.add(new THREE.AmbientLight(0xa3d3e5, 1.7)); const key = new THREE.DirectionalLight(0x99ebff, 2.2); key.position.set(4, 8, 12); state.scene.add(key); const fill = new THREE.PointLight(0x5b80ff, 14, 45); fill.position.set(-7, -3, 10); state.scene.add(fill);
    state.controls = new BasicOrbitControls(state.camera, state.renderer.domElement); state.controls.target.set(0, 0, 0);
    state.raycaster = new THREE.Raycaster(); addGridAndStages(); state.data.nodes.forEach(addNode); addEdges(); updateVisibility(); resize(); els.loading.classList.add('done');
    els.canvas.addEventListener('pointerdown', onPointerDown); els.canvas.addEventListener('pointermove', onPointerMove); els.canvas.addEventListener('pointerup', onPointerUp); window.addEventListener('resize', resize);
    state.animation = requestAnimationFrame(animate);
  }
  let downPoint = null;
  function onPointerDown(e) { downPoint = { x: e.clientX, y: e.clientY, theta: state.liteView.theta, phi: state.liteView.phi }; }
  function onPointerMove(e) { if (!downPoint || !state.lite) return; const dx = e.clientX - downPoint.x, dy = e.clientY - downPoint.y; state.liteView.theta = downPoint.theta - dx * .008; state.liteView.phi = Math.max(-.8, Math.min(.8, downPoint.phi + dy * .006)); drawLite(); }
  function onPointerUp(e) { if (!downPoint) return; const moved = Math.hypot(e.clientX - downPoint.x, e.clientY - downPoint.y); if (moved > 7) { downPoint = null; return; } downPoint = null; const rect = els.canvas.getBoundingClientRect(); if (state.lite) { const x = (e.clientX - rect.left) * els.canvas.width / rect.width, y = (e.clientY - rect.top) * els.canvas.height / rect.height; let best = null, distance = 30; state.liteProjected.forEach(q => { const d = Math.hypot(q.x - x, q.y - y); if (d < distance) { distance = d; best = q.node; } }); if (best) selectNode(best); return; } const rect2 = els.canvas.getBoundingClientRect(); state.pointer.x = ((e.clientX - rect2.left) / rect2.width) * 2 - 1; state.pointer.y = -((e.clientY - rect2.top) / rect2.height) * 2 + 1; state.raycaster.setFromCamera(state.pointer, state.camera); const hits = state.raycaster.intersectObjects(Array.from(state.objectById.values()), false); if (hits.length) selectNode(hits[0].object.userData.node); }
  function resize() { const width = els.stage.clientWidth, height = els.stage.clientHeight; if (state.lite) { els.canvas.width = Math.max(1, Math.floor(width)); els.canvas.height = Math.max(1, Math.floor(height)); els.canvas.style.width = `${width}px`; els.canvas.style.height = `${height}px`; state.liteCtx?.setTransform(1, 0, 0, 1, 0, 0); drawLite(); return; } if (!state.renderer || !state.camera) return; state.camera.aspect = width / height; state.camera.updateProjectionMatrix(); state.renderer.setSize(width, height, false); }
  function animate() { state.animation = requestAnimationFrame(animate); if (state.lite) { drawLite(); return; } if (state.controls) state.controls.update(); updateLabels(); state.renderer.render(state.scene, state.camera); }

  function updateLabels() {
    if (state.lite) { state.data.nodes.forEach(n => { const q = state.liteProjected.get(n.id); const label = document.querySelector(`[data-node-label="${CSS.escape(n.id)}"]`); if (!label) return; if (!q) { label.style.opacity = '0'; return; } label.style.left = `${q.x}px`; label.style.top = `${q.y}px`; label.style.opacity = isVisible(n) && q.z < 25 ? (n.type === 'paper' ? '.86' : '1') : '0'; label.classList.toggle('selected', state.selected && state.selected.id === n.id); }); return; }
    if (!state.camera || !state.renderer) return; const rect = els.stage.getBoundingClientRect(); const width = els.stage.clientWidth, height = els.stage.clientHeight;
    state.data.nodes.forEach(n => {
      const p = state.positions.get(n.id); if (!p) return; const vector = p.clone().project(state.camera); const x = (vector.x * .5 + .5) * width; const y = (-vector.y * .5 + .5) * height; const label = document.querySelector(`[data-node-label="${CSS.escape(n.id)}"]`); if (!label) return; const visible = vector.z < 1 && isVisible(n); label.style.left = `${x}px`; label.style.top = `${y}px`; label.style.opacity = visible ? (n.type === 'paper' ? '.86' : '1') : '0'; label.classList.toggle('selected', state.selected && state.selected.id === n.id); label.classList.toggle('dimmed', !isVisible(n));
    });
    (state.data.stages || []).forEach((s, i) => { const p = new THREE.Vector3((i - ((state.data.stages || []).length - 1) / 2) * 4.1, 8.25, -3); const v = p.project(state.camera); const label = els.stages.querySelector(`[data-stage="${CSS.escape(s.id)}"]`); if (label) { label.style.left = `${(v.x * .5 + .5) * width}px`; label.style.top = `${(-v.y * .5 + .5) * height}px`; label.style.opacity = v.z < 1 ? '.75' : '0'; } });
  }

  function buildOverlayLabels() { els.labels.replaceChildren(); state.data.nodes.forEach(n => { if (n.type === 'stage') return; const label = document.createElement('span'); label.className = `node-label ${n.type === 'paper' ? 'paper-label' : ''}`; label.dataset.nodeLabel = n.id; label.textContent = n.label; els.labels.appendChild(label); }); }

  function updateVisibility() {
    if (!state.scene && !state.lite) return; let visibleCount = 0;
    if (state.lite) { const visibleIds = new Set(state.data.nodes.filter(isVisible).map(n => n.id)); visibleCount = visibleIds.size; const visibleEdges = state.showEdges ? state.data.edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target)).length : 0; els.status.textContent = `${visibleCount} 个节点可见 · ${visibleEdges} 条关系`; els.count.textContent = `${visibleCount} / ${state.data.nodes.length} 个节点 · ${visibleEdges} 条可见关系（共 ${state.data.edges.length} 条整理性关系）`; drawLite(); renderFallback(); return; }
    state.data.nodes.forEach(n => { const object = state.objectById.get(n.id); if (!object) return; const visible = isVisible(n); object.visible = visible; if (visible) visibleCount += 1; });
    state.edgeObjects.forEach(line => { const e = line.userData.edge; const a = state.data.nodes.find(n => n.id === e.source), b = state.data.nodes.find(n => n.id === e.target); line.visible = state.showEdges && !!a && !!b && isVisible(a) && isVisible(b); });
    els.status.textContent = `${visibleCount} 个节点可见 · ${state.showEdges ? state.edgeObjects.filter(e => e.visible).length : 0} 条关系`;
    els.count.textContent = `${visibleCount} / ${state.data.nodes.length} 个节点 · ${state.data.edges.length} 条整理性关系`;
    renderFallback();
  }

  function renderLegend() { els.legend.replaceChildren(); const families = state.data.families && state.data.families.length ? state.data.families : Object.entries(FAMILY_LABELS).map(([id, label]) => ({ id, label })); families.forEach(f => { const item = document.createElement('span'); item.className = 'legend-item'; const dot = document.createElement('i'); dot.className = 'legend-dot'; dot.style.color = familyHex(f.id); dot.style.background = familyHex(f.id); item.append(dot, document.createTextNode(f.label || FAMILY_LABELS[f.id] || f.id)); els.legend.appendChild(item); }); }
  function renderFilters() { els.branchFilters.replaceChildren(); const families = [{ id: 'all', label: '全部' }, ...(state.data.families || []).filter(f => FAMILY_LABELS[f.id] || f.label).map(f => ({ id: f.id, label: f.label || FAMILY_LABELS[f.id] })), { id: 'bridge', label: '桥接 / 验证' }]; const seen = new Set(); families.forEach(f => { if (seen.has(f.id)) return; seen.add(f.id); const b = document.createElement('button'); b.className = `chip ${state.activeFamily === f.id ? 'active' : ''}`; b.type = 'button'; b.textContent = f.label; b.dataset.family = f.id; b.addEventListener('click', () => { state.activeFamily = f.id; renderFilters(); updateVisibility(); }); els.branchFilters.appendChild(b); }); }

  function detailHTML(n) {
    const corpus = n.corpus_index ? `P${String(n.corpus_index).padStart(2, '0')}` : '谱图节点'; const tags = Array.isArray(n.tags) ? n.tags : (n.topic ? [n.topic] : []); const doi = n.doi ? `https://doi.org/${encodeURIComponent(n.doi)}` : ''; const card = n.key ? `../cards/${encodeURIComponent(n.key)}.html` : (n.card_path ? pathToUrl(n.card_path) : (n.card_url || '')); const source = n.source_url ? pathToUrl(n.source_url) : '';
    const authors = (n.authors || []).join(' · ') || '作者信息未记录';
    const journal = n.journal || '期刊信息未记录';
    return `<div class="detail-content"><div class="detail-kicker"><span>${escapeHTML(corpus)} · ${escapeHTML(n.familyLabel || '方法节点')}</span><span>${escapeHTML(String(n.year || ''))}</span></div><h2>${escapeHTML(n.title)}</h2><p class="detail-authors">${escapeHTML(authors)}</p><p class="detail-journal"><span>期刊</span><strong class="detail-journal-name">${escapeHTML(journal)}</strong></p><p class="detail-abstract">${escapeHTML(n.description || n.focus || n.method || '该节点代表方程发现流程中的一个重要方法位置。')}</p><div class="detail-section"><h3>它解决流程中的哪一步</h3><p><b>${escapeHTML(n.stageLabel || n.stage || '方法分支')}</b>${n.method ? `：${escapeHTML(n.method)}` : ''}</p></div>${tags.length ? `<div class="detail-section"><h3>标签</h3><div>${tags.map(t => `<span class="detail-tag">${escapeHTML(t)}</span>`).join('')}</div></div>` : ''}${n.limitations ? `<div class="detail-section"><h3>边界与限制</h3><p>${escapeHTML(n.limitations)}</p></div>` : ''}<div class="detail-links">${doi ? `<a class="detail-link" href="${doi}" target="_blank" rel="noreferrer">DOI ↗</a>` : ''}${card ? `<a class="detail-link" href="${card}" target="_blank" rel="noreferrer">学习卡 ↗</a>` : ''}${source ? `<a class="detail-link" href="${source}" target="_blank" rel="noreferrer">全文笔记 ↗</a>` : ''}</div><p class="detail-note">谱图中的位置与连线是课程整理，用来帮助理解方法谱系；论文事实请以原文、学习卡和 DOI 页面核对。</p></div>`;
  }
  function pathToUrl(path) { if (!path) return ''; const normalized = String(path).replace(/\\/g, '/'); if (/^https?:/i.test(normalized)) return normalized; const marker = normalized.indexOf('/course_76_papers/'); return marker >= 0 ? '../' + normalized.slice(marker + '/course_76_papers/'.length) : normalized; }
  function escapeHTML(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function selectNode(n) { state.selected = n; els.detail.innerHTML = detailHTML(n); state.objectById.forEach(obj => { if (!obj.material || obj.userData.halo) return; const selected = obj.userData.node && obj.userData.node.id === n.id; obj.material.emissiveIntensity = selected ? 1.1 : .34; obj.scale?.setScalar((obj.userData.baseScale || 1) * (selected ? 1.24 : 1)); }); }

  function renderFallback() { if (!els.fallbackContent || !state.data) return; els.fallbackContent.replaceChildren(); const visible = state.data.nodes.filter(n => isVisible(n)); const stages = state.data.stages || []; stages.forEach(s => { const col = document.createElement('div'); col.className = 'fallback-stage'; const title = document.createElement('h4'); title.textContent = s.label || s.id; col.appendChild(title); visible.filter(n => n.stage === s.id || n.stageLabel === s.label).forEach(n => { const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'paper-card'; const strong = document.createElement('strong'); strong.textContent = n.label; const meta = document.createElement('span'); meta.textContent = `${n.corpus_index ? `P${String(n.corpus_index).padStart(2, '0')} · ` : ''}${n.year || ''} · ${n.familyLabel}`; btn.append(strong, meta); btn.addEventListener('click', () => selectNode(n)); col.appendChild(btn); }); if (col.children.length > 1) els.fallbackContent.appendChild(col); }); if (!els.fallbackContent.children.length) els.fallbackContent.innerHTML = '<p class="error-card">当前筛选条件下没有节点。请放宽年份或清空搜索。</p>'; }

  function showFallback(message) { els.loading.classList.add('done'); els.canvas.hidden = true; els.labels.hidden = true; els.stages.hidden = true; els.fallback.hidden = false; els.status.textContent = message || '二维视图'; }
  function toggleMode() { state.mode = state.mode === '3d' ? '2d' : '3d'; const two = state.mode === '2d'; els.mode.textContent = two ? '返回三维视图' : '切换二维视图'; els.mode.setAttribute('aria-pressed', String(two)); els.stage.hidden = two; els.canvas.hidden = two; els.labels.hidden = two; els.stages.hidden = two; els.fallback.hidden = !two; if (!two && (state.renderer || state.lite)) resize(); }
  function resetView() { if (state.lite) { state.liteView = { theta: -.22, phi: -.2, zoom: 1 }; drawLite(); return; } if (!state.camera || !state.controls) return; state.controls.radius = 23; state.controls.theta = 0; state.controls.phi = Math.PI / 2; state.controls.target.set(0, 0, 0); state.controls.update(); }

  async function loadData() { try { const response = await fetch('./spectrum_data.json', { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return normalize(await response.json()); } catch (error) { console.warn('spectrum_data.json unavailable; using embedded fallback.', error); return normalize(fallbackData); } }

  function bindControls() { els.search.addEventListener('input', e => { state.query = e.target.value.trim(); updateVisibility(); }); els.range.addEventListener('input', e => { state.year = Number(e.target.value); els.rangeValue.value = String(state.year); els.rangeValue.textContent = String(state.year); updateVisibility(); }); els.classic.addEventListener('change', e => { state.classic = e.target.checked; updateVisibility(); }); els.edges.addEventListener('change', e => { state.showEdges = e.target.checked; addEdges(); updateVisibility(); }); els.mode.addEventListener('click', toggleMode); els.reset.addEventListener('click', resetView); }

  async function init() { bindControls(); state.data = await loadData(); state.nodes = state.data.nodes; state.edges = state.data.edges; const years = state.data.nodes.map(n => n.year).filter(Boolean); const minYear = Math.min(2007, ...(years.length ? years : [2007])); els.range.min = String(minYear); els.range.value = String(minYear); state.year = minYear; els.rangeValue.value = String(minYear); els.rangeValue.textContent = String(minYear); renderFilters(); renderLegend(); buildOverlayLabels(); renderFallback(); try { createScene(); updateVisibility(); } catch (error) { console.error(error); showFallback(`三维视图初始化失败，已切换为二维视图：${error.message}`); } if (!state.renderer && !state.lite) { els.fallback.hidden = false; } }

  init();
})();
