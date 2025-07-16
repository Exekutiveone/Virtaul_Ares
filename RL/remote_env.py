import os
import requests

class RemoteEnv:
    """Client for the HTTP test environment in ``TE/TE.py``."""

    def __init__(self, base_url="http://127.0.0.1:6000", maps=None):
        self.base_url = base_url.rstrip("/")
        self.state = None
        self.done = False
        self._last_reward = 0.0
        self.maps = maps or ["Level1.csv", "Level2.csv", "Level3.csv", "Level4.csv"]
        self.map_index = 0
        self.map_name = os.path.splitext(os.path.basename(self.maps[self.map_index]))[0]
        self.map_switched = False
        self.crashed = False
        self.battery = 1.0
        self.coverage_done = False
        self.stalled = False
        self.coverage = 0.0

    def reset(self):
        if (self.map_switched or self.coverage_done) and self.maps:
            self.map_index = (self.map_index + 1) % len(self.maps)
            try:
                requests.post(
                    f"{self.base_url}/load_map",
                    json={"file": self.maps[self.map_index]},
                    timeout=5,
                )
            except Exception:
                pass
            self.map_name = os.path.splitext(os.path.basename(self.maps[self.map_index]))[0]
        res = requests.post(f"{self.base_url}/reset")
        data = res.json()
        self.state = data["state"]
        self.done = data.get("done", False)
        self._last_reward = data.get("reward", 0.0)
        self.map_switched = data.get("goal_reached", False)
        self.crashed = data.get("crashed", False)
        self.battery = data.get("battery", 1.0)
        self.coverage = data.get("coverage", 0.0)
        self.coverage_done = data.get("coverage_done", False)
        self.stalled = data.get("stalled", False)
        self.map_name = data.get("map_name", self.map_name)
        return self.state

    def send_action(self, idx):
        res = requests.post(f"{self.base_url}/step", json={"action": int(idx)})
        data = res.json()
        self.state = data["state"]
        self.done = data.get("done", False)
        self._last_reward = data.get("reward", 0.0)
        self.map_switched = data.get("goal_reached", False)
        self.crashed = data.get("crashed", False)
        self.battery = data.get("battery", self.battery)
        self.coverage = data.get("coverage", self.coverage)
        self.coverage_done = data.get("coverage_done", False)
        self.stalled = data.get("stalled", False)
        self.map_name = data.get("map_name", self.map_name)

    def get_state(self):
        return self.state

    def compute_reward(self, _s, _s2):
        return self._last_reward

    def get_map_name(self):
        return self.map_name