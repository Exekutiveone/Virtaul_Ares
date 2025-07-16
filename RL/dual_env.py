"""Environment wrapper that mirrors actions to the server visualization.

This class combines the headless training environment accessed via
:class:`RemoteEnv` with the interactive server based environment
(:class:`ServerEnv`). All state and reward calculations come from the
training environment while the same actions are forwarded to the server
for visualisation.
"""

from remote_env import RemoteEnv
from environment import ServerEnv
from config import BASE_URL


class DualEnv:
    """Run actions on both the training and server environments."""

    def __init__(self, train_url: str = "http://127.0.0.1:6000", base_url: str = BASE_URL):
        self.train_env = RemoteEnv(train_url)
        self.display_env = ServerEnv(base_url)
        self.done = False
        self.map_name = "unknown"

    def reset(self):
        state = self.train_env.reset()
        try:
            self.display_env.reset()
        except Exception:
            pass
        self.done = self.train_env.done
        self.map_switched = getattr(self.train_env, "map_switched", False)
        self.crashed = getattr(self.train_env, "crashed", False)
        self.coverage_done = getattr(self.train_env, "coverage_done", False)
        self.stalled = getattr(self.train_env, "stalled", False)
        self.battery = getattr(self.train_env, "battery", 1.0)
        return state

    def send_action(self, idx):
        try:
            self.display_env.send_action(idx)
        except Exception:
            pass
        self.train_env.send_action(idx)
        self.done = self.train_env.done
        self.map_switched = getattr(self.train_env, "map_switched", False)
        self.crashed = getattr(self.train_env, "crashed", False)
        self.coverage_done = getattr(self.train_env, "coverage_done", False)
        self.stalled = getattr(self.train_env, "stalled", False)
        self.battery = getattr(self.train_env, "battery", 1.0)

    def get_state(self):
        return self.train_env.get_state()

    def compute_reward(self, s, s2):
        return self.train_env.compute_reward(s, s2)

    def get_map_name(self):
        """Return the name of the current map if available."""
        try:
            if getattr(self, "map_switched", False) or self.map_name == "unknown":
                self.map_name = self.train_env.get_map_name()
        except Exception:
            pass
        return self.map_name
