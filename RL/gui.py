import argparse
import csv
import os
import tkinter as tk
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

DEFAULT_LOG = os.path.join(os.path.dirname(__file__), "rl_log.csv")

class RLTracker(tk.Tk):
    def __init__(self, log_path: str):
        super().__init__()
        self.title("RL Training Tracker")
        self.fig, self.ax = plt.subplots(figsize=(5, 4))
        self.canvas = FigureCanvasTkAgg(self.fig, master=self)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=1)
        self.anim = FuncAnimation(self.fig, self.update_plot, interval=1000)
        self.log_path = log_path

    def read_log(self):
        episodes = {}
        with open(self.log_path, newline="") as f:
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

def main() -> None:
    parser = argparse.ArgumentParser(description="Visualise RL training progress")
    parser.add_argument(
        "--log", default=DEFAULT_LOG, help="path to the training log CSV"
    )
    args = parser.parse_args()

    RLTracker(args.log).mainloop()


if __name__ == "__main__":
    main()
