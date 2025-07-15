import csv
from datetime import datetime

class Logger:
    def __init__(self, path):
        self.file = open(path, 'w', newline='')
        self.writer = csv.writer(self.file)
        self.writer.writerow(["episode", "step", "timestamp", "action", "state", "reward", "done", "epsilon"])

    def log(self, ep, st, act, state, rew, done, eps):
        self.writer.writerow([ep, st, datetime.now().isoformat(), act, state, rew, done, round(eps, 5)])

    def close(self):
        self.file.close()
