import requests

class RemoteEnv:
    """Client for the HTTP test environment in ``TE/TE.py``."""

    def __init__(self, base_url="http://127.0.0.1:6000"):
        self.base_url = base_url.rstrip("/")
        self.state = None
        self.done = False
        self._last_reward = 0.0

    def reset(self):
        res = requests.post(f"{self.base_url}/reset")
        data = res.json()
        self.state = data["state"]
        self.done = data.get("done", False)
        self._last_reward = data.get("reward", 0.0)
        return self.state

    def send_action(self, idx):
        res = requests.post(f"{self.base_url}/step", json={"action": int(idx)})
        data = res.json()
        self.state = data["state"]
        self.done = data.get("done", False)
        self._last_reward = data.get("reward", 0.0)

    def get_state(self):
        return self.state

    def compute_reward(self, _s, _s2):
        return self._last_reward
