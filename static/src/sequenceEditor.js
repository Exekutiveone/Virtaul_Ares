const tblBody = document.querySelector('#stepsTbl tbody');
const addBtn = document.getElementById('addStep');
const saveBtn = document.getElementById('saveSeq');

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

addBtn.addEventListener('click', () => addRow());
addRow();

saveBtn.addEventListener('click', async () => {
  const name = document.getElementById('seqName').value.trim();
  const format = document.getElementById('seqFormat').value;
  if (!name) { alert('Name fehlt'); return; }
  const steps = [];
  tblBody.querySelectorAll('tr').forEach(tr => {
    const action = tr.querySelector('.action').value;
    const inp = tr.querySelector('.val');
    let val = 0;
    if (!inp.disabled) val = parseFloat(inp.value);
    if (action && !isNaN(val)) steps.push({action,duration:val});
  });
  if (!steps.length) { alert('Keine Schritte'); return; }
  const res = await fetch('/api/sequences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({name, format, steps})
  });
  if (res.ok) {
    alert('Gespeichert');
    tblBody.innerHTML='';
    addRow();
  } else {
    alert('Fehler beim Speichern');
  }
});
