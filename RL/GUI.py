import csv
import os
from flask import Flask, jsonify, render_template_string
from config import MAX_STEPS

app = Flask(__name__)
LOG_PATH = os.path.join(os.path.dirname(__file__), 'rl_log.csv')
MAP_NAME = os.environ.get('RL_MAP_NAME', 'unknown')

HTML = """
<!doctype html>
<html lang='en'>
<head>
  <meta charset='utf-8'>
  <title>RL Training Data</title>
  <style>
    body {background:#111;color:#eee;font-family:Arial,sans-serif;margin:0;padding:20px;}
    #progress {margin-bottom:20px;}
    #progress progress {width:100%;}
    .chart-container {margin-bottom: 30px;}
  </style>
  <script src='https://cdn.jsdelivr.net/npm/chart.js'></script>
</head>
<body>
  <h1>RL Training Data</h1>
  <div id='progress'>
    <div id='mapName'></div>
    <progress id='stepProgress' value='0' max='100'></progress>
    <div id='stepText'></div>
  </div>
  <div class='chart-container'>
    <h2>Reward per Episode</h2>
    <canvas id='rewardChart' width='800' height='300' style='background:#222;'></canvas>
  </div>
  <div class='chart-container'>
    <h2>Epsilon per Episode</h2>
    <canvas id='epsilonChart' width='800' height='300' style='background:#222;'></canvas>
  </div>
<script>
let rewardChart, epsilonChart;
async function loadData() {
  const res = await fetch('/api/log');
  const data = await res.json();
  document.getElementById('mapName').textContent = 'Map: ' + data.map;
  document.getElementById('stepText').textContent = `Episode ${data.current_episode} - Schritt ${data.current_step}`;
  const progress = document.getElementById('stepProgress');
  progress.max = data.max_steps;
  progress.value = data.current_step;
  const labels = data.episodes.map(e => e.episode);
  const rewards = data.episodes.map(e => e.reward);
  const eps = data.episodes.map(e => e.epsilon);
  // Reward Chart
  if (!rewardChart) {
    const ctx = document.getElementById('rewardChart').getContext('2d');
    rewardChart = new Chart(ctx, {
      type:'line',
      data:{
        labels:labels,
        datasets:[{label:'Reward',borderColor:'rgb(75,192,192)',data:rewards,fill:false}]
      },
      options:{
        scales:{
          x: {title: {display: true, text: 'Episode'}},
          y: {title: {display: true, text: 'Reward'}}
        }
      }
    });
  } else {
    rewardChart.data.labels = labels;
    rewardChart.data.datasets[0].data = rewards;
    rewardChart.update();
  }
  // Epsilon Chart
  if (!epsilonChart) {
    const ctx2 = document.getElementById('epsilonChart').getContext('2d');
    epsilonChart = new Chart(ctx2, {
      type:'line',
      data:{
        labels:labels,
        datasets:[{label:'Epsilon',borderColor:'rgb(255,99,132)',data:eps,fill:false}]
      },
      options:{
        scales:{
          x: {title: {display: true, text: 'Episode'}},
          y: {title: {display: true, text: 'Epsilon'}, min: 0, max: 1}
        }
      }
    });
  } else {
    epsilonChart.data.labels = labels;
    epsilonChart.data.datasets[0].data = eps;
    epsilonChart.update();
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
        return entries, [], 0, 0
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
    current_ep = entries[-1]['episode'] if entries else 0
    current_step = entries[-1]['step'] if entries else 0
    ep_list = [{'episode': ep, 'reward': vals['reward'], 'epsilon': vals['epsilon']} for ep, vals in sorted(episodes.items())]
    return entries, ep_list, current_ep, current_step

@app.route('/')
def index():
    return render_template_string(HTML)

@app.route('/api/log')
def api_log():
    _entries, ep_list, cur_ep, cur_step = parse_log()
    return jsonify({'episodes': ep_list,
                    'current_episode': cur_ep,
                    'current_step': cur_step,
                    'max_steps': MAX_STEPS,
                    'map': MAP_NAME})

if __name__ == '__main__':
    app.run(port=7000, debug=True)
