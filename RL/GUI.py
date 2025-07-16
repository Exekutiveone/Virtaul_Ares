import csv
import os
from flask import Flask, jsonify, render_template_string

app = Flask(__name__)
LOG_PATH = os.path.join(os.path.dirname(__file__), 'rl_log.csv')

HTML = """
<!doctype html>
<html lang='en'>
<head>
  <meta charset='utf-8'>
  <title>RL Training Data</title>
  <style>
    body {background:#111;color:#eee;font-family:Arial,sans-serif;margin:0;padding:20px;}
    table {border-collapse: collapse;width:100%;margin-top:20px;}
    th, td {border:1px solid #444;padding:4px;}
    tr:nth-child(even) {background:#222;}
  </style>
  <script src='https://cdn.jsdelivr.net/npm/chart.js'></script>
</head>
<body>
  <h1>RL Training Data</h1>
  <canvas id='chart' width='800' height='400' style='background:#222;'></canvas>
  <table id='log'>
    <thead>
      <tr>
        <th>Episode</th>
        <th>Step</th>
        <th>Timestamp</th>
        <th>Action</th>
        <th>State</th>
        <th>Reward</th>
        <th>Done</th>
        <th>Epsilon</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
<script>
let chart;
async function loadData() {
  const res = await fetch('/api/log');
  const data = await res.json();
  const tbody = document.querySelector('#log tbody');
  tbody.innerHTML = '';
  for (const row of data.entries) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.episode}</td>`+
                   `<td>${row.step}</td>`+
                   `<td>${row.timestamp}</td>`+
                   `<td>${row.action}</td>`+
                   `<td>${row.state}</td>`+
                   `<td>${row.reward.toFixed(3)}</td>`+
                   `<td>${row.done}</td>`+
                   `<td>${row.epsilon.toFixed(3)}</td>`;
    tbody.appendChild(tr);
  }
  const labels = data.episodes.map(e => e.episode);
  const rewards = data.episodes.map(e => e.reward);
  const eps = data.episodes.map(e => e.epsilon);
  if (!chart) {
    const ctx = document.getElementById('chart').getContext('2d');
    chart = new Chart(ctx, {
      type:'line',
      data:{labels:labels,datasets:[
        {label:'Reward',borderColor:'rgb(75,192,192)',data:rewards,fill:false},
        {label:'Epsilon',borderColor:'rgb(255,99,132)',data:eps,fill:false,yAxisID:'eps'}
      ]},
      options:{scales:{eps:{type:'linear',position:'right',min:0,max:1}}}
    });
  } else {
    chart.data.labels = labels;
    chart.data.datasets[0].data = rewards;
    chart.data.datasets[1].data = eps;
    chart.update();
  }
}
loadData();
setInterval(loadData, 5000);
</script>
</body>
</html>
"""

def parse_log():
    entries = []
    episodes = {}
    if not os.path.exists(LOG_PATH):
        return entries, []
    with open(LOG_PATH, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            entry = {
                'episode': int(row['episode']),
                'step': int(row['step']),
                'timestamp': row['timestamp'],
                'action': row['action'],
                'state': row['state'],
                'reward': float(row['reward']),
                'done': row['done'] == 'True',
                'epsilon': float(row['epsilon'])
            }
            entries.append(entry)
            ep = entry['episode']
            episodes.setdefault(ep, {'reward': 0.0, 'epsilon': entry['epsilon']})
            episodes[ep]['reward'] += entry['reward']
            episodes[ep]['epsilon'] = entry['epsilon']
    ep_list = [{'episode': ep, 'reward': vals['reward'], 'epsilon': vals['epsilon']} for ep, vals in sorted(episodes.items())]
    return entries, ep_list

@app.route('/')
def index():
    return render_template_string(HTML)

@app.route('/api/log')
def api_log():
    entries, ep_list = parse_log()
    return jsonify({'entries': entries, 'episodes': ep_list})

if __name__ == '__main__':
    app.run(port=6000, debug=True)
