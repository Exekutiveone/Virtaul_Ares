const tblBody = document.querySelector('#stepsTbl tbody');
const addBtn = document.getElementById('addStep');
const addCondBtn = document.getElementById('addCond');
const addLoopBtn = document.getElementById('addLoop');
const saveBtn = document.getElementById('saveSeq');

let draggedRow = null;

tblBody.addEventListener('dragstart', (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  draggedRow = tr;
  e.dataTransfer.effectAllowed = 'move';
});

tblBody.addEventListener('dragover', (e) => {
  e.preventDefault();
  const tr = e.target.closest('tr');
  if (!draggedRow || !tr || draggedRow === tr) return;
  const rect = tr.getBoundingClientRect();
  const next = e.clientY - rect.top > rect.height / 2;
  tblBody.insertBefore(draggedRow, next ? tr.nextSibling : tr);
});

tblBody.addEventListener('drop', (e) => {
  e.preventDefault();
  draggedRow = null;
});

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

function updateInput(tr) {
  const act = tr.querySelector('.action').value;
  const inp = tr.querySelector('.val');
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

function addRow(action = 'forward', value = 1) {
  const tr = document.createElement('tr');
  tr.draggable = true;
  const select = createSelect(action);
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'val';
  input.step = '0.1';
  input.value = value;
  const del = document.createElement('button');
  del.textContent = 'x';
  del.className = 'del';
  const td1 = document.createElement('td');
  const td2 = document.createElement('td');
  const td3 = document.createElement('td');
  td1.appendChild(select);
  td2.appendChild(input);
  td3.appendChild(del);
  tr.appendChild(td1);
  tr.appendChild(td2);
  tr.appendChild(td3);
  tblBody.appendChild(tr);
  select.addEventListener('change', () => updateInput(tr));
  del.addEventListener('click', () => tr.remove());
  updateInput(tr);
}

function addCondRow() {
  const tr = document.createElement('tr');
  tr.draggable = true;
  tr.className = 'condRow';
  const td1 = document.createElement('td');
  const td2 = document.createElement('td');
  const td3 = document.createElement('td');

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
  td1.append('Wenn ', sensorSel, opSel, valInput, ' cm');

  const thenAct = createSelect('stop');
  thenAct.classList.add('thenAct');
  const thenDur = document.createElement('input');
  thenDur.type = 'number';
  thenDur.className = 'thenDur';
  thenDur.step = '0.1';
  thenDur.value = 0;

  const elseAct = createSelect('forward');
  elseAct.classList.add('elseAct');
  const elseDur = document.createElement('input');
  elseDur.type = 'number';
  elseDur.className = 'elseDur';
  elseDur.step = '0.1';
  elseDur.value = 1;

  td2.append('dann ', thenAct, thenDur, ' sonst ', elseAct, elseDur);

  const del = document.createElement('button');
  del.textContent = 'x';
  del.className = 'del';
  td3.appendChild(del);

  tr.appendChild(td1);
  tr.appendChild(td2);
  tr.appendChild(td3);
  tblBody.appendChild(tr);

  del.addEventListener('click', () => tr.remove());
}

function addLoopRow() {
  const tr = document.createElement('tr');
  tr.draggable = true;
  tr.className = 'loopRow';
  const td1 = document.createElement('td');
  const td2 = document.createElement('td');
  const td3 = document.createElement('td');

  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = '1';
  countInput.className = 'loopCount';
  countInput.value = 2;
  td1.append('for ', countInput, 'x');

  const select = createSelect('forward');
  const dur = document.createElement('input');
  dur.type = 'number';
  dur.className = 'val';
  dur.step = '0.1';
  dur.value = 1;
  td2.append(select, dur);

  const del = document.createElement('button');
  del.textContent = 'x';
  del.className = 'del';
  td3.appendChild(del);

  tr.appendChild(td1);
  tr.appendChild(td2);
  tr.appendChild(td3);
  tblBody.appendChild(tr);

  del.addEventListener('click', () => tr.remove());
}

addBtn.addEventListener('click', () => addRow());
addCondBtn.addEventListener('click', () => addCondRow());
if (addLoopBtn) addLoopBtn.addEventListener('click', () => addLoopRow());
addRow();

saveBtn.addEventListener('click', async () => {
  const name = document.getElementById('seqName').value.trim();
  const format = document.getElementById('seqFormat').value;
  if (!name) {
    alert('Name fehlt');
    return;
  }
  const steps = [];
  tblBody.querySelectorAll('tr').forEach((tr) => {
    if (tr.classList.contains('condRow')) {
      const sensor = tr.querySelector('.sensor').value;
      const op = tr.querySelector('.op').value;
      const val = parseFloat(tr.querySelector('.condVal').value);
      const a1 = tr.querySelector('.thenAct').value;
      const d1 = parseFloat(tr.querySelector('.thenDur').value);
      const a2 = tr.querySelector('.elseAct').value;
      const d2 = parseFloat(tr.querySelector('.elseDur').value);
      const line = `if ${sensor} ${op} ${val} then ${a1} ${d1} else ${a2} ${d2}`;
      steps.push({ line });
    } else if (tr.classList.contains('loopRow')) {
      const count = parseInt(tr.querySelector('.loopCount').value);
      const action = tr.querySelector('.action').value;
      const val = parseFloat(tr.querySelector('.val').value);
      if (action && !isNaN(val) && count > 0)
        steps.push({ action, duration: val, repeat: count });
    } else {
      const action = tr.querySelector('.action').value;
      const inp = tr.querySelector('.val');
      let val = 0;
      if (!inp.disabled) val = parseFloat(inp.value);
      if (action && !isNaN(val)) steps.push({ action, duration: val });
    }
  });
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
    tblBody.innerHTML = '';
    addRow();
  } else {
    alert('Fehler beim Speichern');
  }
});
