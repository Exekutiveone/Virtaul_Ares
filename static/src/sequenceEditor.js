const rootList = document.querySelector('#steps');
const addBtn = document.getElementById('addStep');
const addCondBtn = document.getElementById('addCond');
const addLoopBtn = document.getElementById('addLoop');
const addWhileBtn = document.getElementById('addWhile');
const addCallBtn = document.getElementById('addCall');
const saveBtn = document.getElementById('saveSeq');

let sequenceList = [];

async function loadSequenceList() {
  const res = await fetch('/api/sequences');
  if (res.ok) {
    sequenceList = await res.json();
  }
}

let draggedElem = null;

function initDrag(container) {
  container.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li.step');
    if (!li) return;
    draggedElem = li;
    e.dataTransfer.effectAllowed = 'move';
  });

  container.addEventListener('dragover', (e) => {
    if (!draggedElem) return;
    const li = e.target.closest('li.step');
    const list = e.target.closest('ul.steps');
    if (!list) return;
    e.preventDefault();
    if (!li || li === draggedElem || li.parentElement !== list) {
      if (list !== draggedElem && !draggedElem.contains(list))
        list.appendChild(draggedElem);
      return;
    }
    const rect = li.getBoundingClientRect();
    const next = e.clientY - rect.top > rect.height / 2;
    list.insertBefore(draggedElem, next ? li.nextSibling : li);
  });

  container.addEventListener('drop', (e) => {
    if (!draggedElem) return;
    const list = e.target.closest('ul.steps');
    if (list) e.preventDefault();
    draggedElem = null;
  });
}

function createSelect(action) {
  const sel = document.createElement('select');
  sel.className = 'action';
  sel.innerHTML = `
    <option value="forward">Vorwärts</option>
    <option value="backward">Rückwärts</option>
    <option value="stop">Stopp</option>
    <option value="left">Links drehen</option>
    <option value="right">Rechts drehen</option>`;
  sel.value = action;
  return sel;
}

function updateInput(li) {
  const act = li.querySelector('.action').value;
  const inp = li.querySelector('.val');
  if (act === 'left' || act === 'right') {
    inp.placeholder = 'Winkel (°)';
    inp.disabled = false;
  } else if (act === 'stop') {
    inp.placeholder = '';
    inp.value = '';
    inp.disabled = true;
  } else {
    inp.placeholder = 'Dauer (s)';
    inp.disabled = false;
  }
}

function createActionNode(action = 'forward', value = 1) {
  const li = document.createElement('li');
  li.className = 'step action';
  li.draggable = true;
  const sel = createSelect(action);
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'val';
  input.step = '0.1';
  input.value = value;
  const del = document.createElement('button');
  del.textContent = 'x';
  del.className = 'del';
  li.append(sel, input, del);
  sel.addEventListener('change', () => updateInput(li));
  del.addEventListener('click', () => li.remove());
  updateInput(li);
  return li;
}

function createIfNode() {
  const li = document.createElement('li');
  li.className = 'step if';
  li.draggable = true;
  const header = document.createElement('div');
  const sensorSel = document.createElement('select');
  sensorSel.className = 'sensor';
  sensorSel.innerHTML = `
    <option value="front">Front</option>
    <option value="left">Links</option>
    <option value="right">Rechts</option>
    <option value="back">Hinten</option>`;
  const opSel = document.createElement('select');
  opSel.className = 'op';
  opSel.innerHTML = `
    <option value="<">&lt;</option>
    <option value="<=">&lt;=</option>
    <option value=">">&gt;</option>
    <option value=">=">&gt;=</option>`;
  const valInput = document.createElement('input');
  valInput.type = 'number';
  valInput.className = 'condVal';
  valInput.step = '0.1';
  valInput.value = 30;
  const del = document.createElement('button');
  del.textContent = 'x';
  del.className = 'del';
  header.append('Wenn ', sensorSel, opSel, valInput, ' cm ', del);
  li.appendChild(header);

  const thenDiv = document.createElement('div');
  thenDiv.textContent = 'dann:';
  const thenList = document.createElement('ul');
  thenList.className = 'steps then nested';
  thenDiv.appendChild(thenList);
  li.appendChild(thenDiv);

  const elseDiv = document.createElement('div');
  elseDiv.textContent = 'sonst:';
  const elseList = document.createElement('ul');
  elseList.className = 'steps else nested';
  elseDiv.appendChild(elseList);
  li.appendChild(elseDiv);

  initDrag(thenList);
  initDrag(elseList);
  del.addEventListener('click', () => li.remove());
  return li;
}

function createLoopNode() {
  const li = document.createElement('li');
  li.className = 'step loop';
  li.draggable = true;
  const header = document.createElement('div');
  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = '1';
  countInput.className = 'loopCount';
  countInput.value = 2;
  const del = document.createElement('button');
  del.textContent = 'x';
  del.className = 'del';
  header.append('for ', countInput, 'x ', del);
  li.appendChild(header);
  const inner = document.createElement('ul');
  inner.className = 'steps nested';
  li.appendChild(inner);
  initDrag(inner);
  del.addEventListener('click', () => li.remove());
  return li;
}

function createWhileNode() {
  const li = document.createElement('li');
  li.className = 'step while';
  li.draggable = true;
  const header = document.createElement('div');
  const sensorSel = document.createElement('select');
  sensorSel.className = 'sensor';
  sensorSel.innerHTML = `
    <option value="front">Front</option>
    <option value="left">Links</option>
    <option value="right">Rechts</option>
    <option value="back">Hinten</option>`;
  const opSel = document.createElement('select');
  opSel.className = 'op';
  opSel.innerHTML = `
    <option value="<">&lt;</option>
    <option value="<=">&lt;=</option>
    <option value=">">&gt;</option>
    <option value=">=">&gt;=</option>`;
  const valInput = document.createElement('input');
  valInput.type = 'number';
  valInput.className = 'condVal';
  valInput.step = '0.1';
  valInput.value = 30;
  const del = document.createElement('button');
  del.textContent = 'x';
  del.className = 'del';
  header.append('while ', sensorSel, opSel, valInput, ' cm ', del);
  li.appendChild(header);
  const inner = document.createElement('ul');
  inner.className = 'steps nested';
  li.appendChild(inner);
  initDrag(inner);
  del.addEventListener('click', () => li.remove());
  return li;
}

function createCallNode() {
  const li = document.createElement('li');
  li.className = 'step call';
  li.draggable = true;
  const sel = document.createElement('select');
  sel.className = 'seqSelect';
  sequenceList.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.file;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });
  const del = document.createElement('button');
  del.textContent = 'x';
  del.className = 'del';
  li.append('Ablauf ', sel, del);
  del.addEventListener('click', () => li.remove());
  return li;
}

function collectSteps(list) {
  const steps = [];
  list.querySelectorAll(':scope > li.step').forEach((li) => {
    if (li.classList.contains('action')) {
      const action = li.querySelector('.action').value;
      const inp = li.querySelector('.val');
      let val = 0;
      if (!inp.disabled) val = parseFloat(inp.value);
      steps.push({ action, duration: val });
    } else if (li.classList.contains('if')) {
      const sensor = li.querySelector('.sensor').value;
      const op = li.querySelector('.op').value;
      const val = parseFloat(li.querySelector('.condVal').value);
      const thenSteps = collectSteps(li.querySelector('ul.then'));
      const elseSteps = collectSteps(li.querySelector('ul.else'));
      steps.push({ if: { sensor, op, value: val, then: thenSteps, else: elseSteps } });
    } else if (li.classList.contains('loop')) {
      const count = parseInt(li.querySelector('.loopCount').value);
      const inner = collectSteps(li.querySelector('ul.steps'));
      steps.push({ loop: { repeat: count, steps: inner } });
    } else if (li.classList.contains('while')) {
      const sensor = li.querySelector('.sensor').value;
      const op = li.querySelector('.op').value;
      const val = parseFloat(li.querySelector('.condVal').value);
      const inner = collectSteps(li.querySelector('ul.steps'));
      steps.push({ while: { sensor, op, value: val, steps: inner } });
    } else if (li.classList.contains('call')) {
      const file = li.querySelector('.seqSelect').value;
      steps.push({ call: file });
    }
  });
  return steps;
}

addBtn.addEventListener('click', () => rootList.appendChild(createActionNode()));
addCondBtn.addEventListener('click', () => rootList.appendChild(createIfNode()));
if (addLoopBtn) addLoopBtn.addEventListener('click', () => rootList.appendChild(createLoopNode()));
if (addWhileBtn) addWhileBtn.addEventListener('click', () => rootList.appendChild(createWhileNode()));
if (addCallBtn) addCallBtn.addEventListener('click', () => {
  if (sequenceList.length === 0) {
    alert('Keine gespeicherten Abläufe');
    return;
  }
  rootList.appendChild(createCallNode());
});

loadSequenceList();
initDrag(rootList);
rootList.appendChild(createActionNode());

saveBtn.addEventListener('click', async () => {
  const name = document.getElementById('seqName').value.trim();
  const format = document.getElementById('seqFormat').value;
  if (!name) {
    alert('Name fehlt');
    return;
  }
  const steps = collectSteps(rootList);
  if (!steps.length) {
    alert('Keine Schritte');
    return;
  }
  const res = await fetch('/api/sequences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, format, steps }),
  });
  if (res.ok) {
    alert('Gespeichert');
    rootList.innerHTML = '';
    rootList.appendChild(createActionNode());
  } else {
    alert('Fehler beim Speichern');
  }
});
