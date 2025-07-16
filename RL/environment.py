import time
import requests
from utils import ACTIONS

class ServerEnv:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.done = False
        self.night_mode = False
        self.map_switched = False
        self.stalled = False
        self.last_move_time = time.time()

    def reset(self):
        """Restart the simulator and return the initial state."""
        self.done = False
        self.night_mode = False
        self.map_switched = False
        self.stalled = False
        self.last_move_time = time.time()
        try:
            # Trigger a restart of the simulator which resets the car to the
            # starting position. The front-end listens for this control command
            # and reloads the current scenario.
            requests.post(
                f"{self.base_url}/api/control",
                json={"action": "restart"},
                timeout=5,
            )
            # clear any previous goal flags
            requests.get(f"{self.base_url}/api/goal", timeout=5)
        except Exception:
            # If the restart request fails we still continue with a clean state
            pass
        # Give the client a moment to process the restart before requesting the
        # first observation.
        time.sleep(0.1)
        return self.get_state()

    def get_state(self):
        try:
            res = requests.get(f"{self.base_url}/api/car", timeout=5)
            data = res.json()
        except Exception:
            data = {}
        dist = data.get("distances", {})
        front = dist.get("front", 0)
        left = dist.get("left", 0)
        right = dist.get("right", 0)
        speed = data.get("speed", 0)
        gyro = data.get("gyro", 0)
        rpm = data.get("rpm", 0)
        if speed > 0:
            self.last_move_time = time.time()
        elif time.time() - self.last_move_time > 10:
            try:
                requests.post(f"{self.base_url}/api/control", json={"action": "restart"}, timeout=5)
            except Exception:
                pass
            self.stalled = True
            self.done = True
            return [front, left, right, 0, gyro, rpm, 0.0]
        try:
            slam_res = requests.get(f"{self.base_url}/api/slam-map", timeout=5)
            cells = slam_res.json().get("cells", [])
            total = sum(len(row) for row in cells)
            known = sum(1 for row in cells for val in row if val != 0)
            coverage = known / total if total else 0.0
        except Exception:
            coverage = 0.0
        try:
            goal_res = requests.get(f"{self.base_url}/api/goal", timeout=5)
            if goal_res.json().get("reached"):
                self.map_switched = True
                self.done = True
        except Exception:
            pass
        # Mark the episode as finished if the target was reached or a crash
        # occurred. As we do not get explicit signals from the simulator we use
        # simple heuristics based on the sensor values.
        if front <= 1:
            self.done = True
        if coverage >= 0.95:
            self.done = True
        return [front, left, right, speed, gyro, rpm, coverage]

    def send_action(self, idx):
        self.map_switched = False
        action = ACTIONS[idx]
        try:
            requests.post(f"{self.base_url}/api/control", json={"action": action}, timeout=5)
        except Exception:
            pass
        self.done = False

    def compute_reward(self, s, s2):
        if self.stalled:
            self.stalled = False
            self.done = True
            return -10
        cov_gain = s2[6] - s[6]
        reward = -5 if s2[0] < 20 else s[0] - s2[0]
        reward += cov_gain * 5
        if self.map_switched:
            reward += 100
            self.map_switched = False
        if s2[6] >= 0.5 and not self.night_mode:
            self.night_mode = True
        return reward
