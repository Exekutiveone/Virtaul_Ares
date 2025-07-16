import csv
import tkinter as tk
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

LOG_PATH = "rl_log.csv"

class RLTracker(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("RL Training Tracker")
        self.fig, self.ax = plt.subplots(figsize=(5, 4))
        self.canvas = FigureCanvasTkAgg(self.fig, master=self)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=1)
        self.anim = FuncAnimation(self.fig, self.update_plot, interval=1000)

    def read_log(self):
        episodes = {}
        with open(LOG_PATH, newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                ep = int(row["episode"])
                reward = float(row["reward"])
                episodes.setdefault(ep, 0.0)
                episodes[ep] += reward
        eps = sorted(episodes.items())
        return [e for e, _ in eps], [r for _, r in eps]

    def update_plot(self, _):
        try:
            episodes, rewards = self.read_log()
        except FileNotFoundError:
            episodes, rewards = [], []
        self.ax.clear()
        self.ax.plot(episodes, rewards, marker='o')
        self.ax.set_xlabel('Episode')
        self.ax.set_ylabel('Total reward')
        self.ax.set_title('Training Progress')
        self.fig.tight_layout()
        self.canvas.draw()

if __name__ == "__main__":
    RLTracker().mainloop()
