const tblBody = document.querySelector('#stepsTbl tbody');
const addBtn = document.getElementById('addStep');
const saveBtn = document.getElementById('saveSeq');

function addRow(action = '', duration = 1) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input value="${action}"></td>
    <td><input type="number" value="${duration}" min="0.1" step="0.1"></td>
    <td><button class="del">x</button></td>`;
  tr.querySelector('.del').addEventListener('click', () => tr.remove());
  tblBody.appendChild(tr);
}

addBtn.addEventListener('click', () => addRow());
addRow();

saveBtn.addEventListener('click', async () => {
  const name = document.getElementById('seqName').value.trim();
  const format = document.getElementById('seqFormat').value;
  if (!name) { alert('Name fehlt'); return; }
  const steps = [];
  tblBody.querySelectorAll('tr').forEach(tr => {
    const action = tr.children[0].firstElementChild.value.trim();
    const dur = parseFloat(tr.children[1].firstElementChild.value);
    if (action && !isNaN(dur)) steps.push({action,duration:dur});
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
