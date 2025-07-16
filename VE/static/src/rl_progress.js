const ctx = document.getElementById('rlChart').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Reward',
        borderColor: 'rgb(75, 192, 192)',
        fill: false,
        data: [],
      },
      {
        label: 'Epsilon',
        borderColor: 'rgb(255, 99, 132)',
        fill: false,
        data: [],
        yAxisID: 'epsilonAxis',
      },
    ],
  },
  options: {
    scales: {
      epsilonAxis: {
        type: 'linear',
        position: 'right',
        min: 0,
        max: 1,
      },
    },
  },
});

async function refresh() {
  const res = await fetch('/api/rl-log');
  if (!res.ok) return;
  const data = await res.json();
  chart.data.labels = data.map((d) => d.episode);
  chart.data.datasets[0].data = data.map((d) => d.reward);
  chart.data.datasets[1].data = data.map((d) => d.epsilon);
  chart.update();
}

setInterval(refresh, 1000);
refresh();
