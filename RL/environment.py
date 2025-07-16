import time
import requests
from utils import ACTIONS

# Reward calculation constants
STEP_PENALTY = -0.1          # small penalty each action
STALL_PENALTY = -20          # heavy punishment for getting stuck
ZERO_SPEED_PENALTY = -1      # discourage standing still
COLLISION_DIST = 5           # distance considered a collision
NEAR_DIST = 20               # threshold for being too close
COLLISION_PENALTY = -20
NEAR_PENALTY = -5
GOAL_REWARD = 150
WAYPOINT_REWARD = 15
# Battery drain per rpm-second (reduced for longer runtime)
BATTERY_RATE = 0.000005
BATTERY_PENALTY = -50         # punishment when battery depleted before goal

class ServerEnv:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.done = False
        self.night_mode = False
        self.map_switched = False
        self.waypoint_hit = False
        self.stalled = False
        self.crashed = False
        self.coverage_done = False
        self.last_move_time = time.time()
        self.battery = 1.0
        self.last_state_time = time.time()
        self.map_name = "unknown"

    def reset(self):
        """Restart the simulator and return the initial state."""
        self.done = False
        self.night_mode = False
        self.map_switched = False
        self.waypoint_hit = False
        self.stalled = False
        self.crashed = False
        self.coverage_done = False
        self.last_move_time = time.time()
        self.battery = 1.0
        self.last_state_time = time.time()
        # Update the current map name before restarting
        self._update_map_name()
        try:
            # Trigger a restart of the simulator which resets the car to the
            # starting position. The front-end listens for this control command
            # and reloads the current scenario.
            requests.post(
                f"{self.base_url}/api/control",
                json={"action": "restart"},
                timeout=5,
            )
            # clear any previous goal/waypoint flags
            requests.get(f"{self.base_url}/api/goal", timeout=5)
            requests.get(f"{self.base_url}/api/waypoint", timeout=5)
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
        now = time.time()
        dt = now - self.last_state_time
        self.last_state_time = now
        self.battery = max(0.0, self.battery - rpm * dt * BATTERY_RATE)
        if self.battery <= 0:
            self.done = True
        if speed > 0:
            self.last_move_time = time.time()
        elif time.time() - self.last_move_time > 10:
            try:
                requests.post(f"{self.base_url}/api/control", json={"action": "restart"}, timeout=5)
            except Exception:
                pass
            self.stalled = True
            self.done = True
            return [front, left, right, 0, gyro, rpm, 0.0, self.battery]
        try:
            slam_res = requests.get(f"{self.base_url}/api/slam-map", timeout=5)
            cells = slam_res.json().get("cells", [])
            non_obstacle = [val for row in cells for val in row if val != 2]
            total = len(non_obstacle)
            known = sum(1 for val in non_obstacle if val != 0)
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
        try:
            wp_res = requests.get(f"{self.base_url}/api/waypoint", timeout=5)
            if wp_res.json().get("reached"):
                self.waypoint_hit = True
        except Exception:
            pass
        # Mark the episode as finished if the target was reached or a crash
        # occurred. As we do not get explicit signals from the simulator we use
        # simple heuristics based on the sensor values.
        if front <= 1:
            self.crashed = True
            self.done = True
        if coverage >= 0.95:
            self.coverage_done = True
            self.done = True
        return [front, left, right, speed, gyro, rpm, coverage, self.battery]

    def _update_map_name(self):
        """Retrieve the name of the currently loaded map from the server."""
        try:
            res = requests.get(f"{self.base_url}/api/maps", timeout=5)
            maps = res.json()
            if maps:
                self.map_name = maps[-1].get("name", self.map_name)
        except Exception:
            pass

    def get_map_name(self):
        """Return the most recently reported map name."""
        if self.map_switched or self.map_name == "unknown":
            self._update_map_name()
        return self.map_name

    def send_action(self, idx):
        """Send a driving and camera command for the chosen action index."""
        self.map_switched = False
        self.waypoint_hit = False
        drive, angle = ACTIONS[idx]

        # First send the driving command
        try:
            requests.post(
                f"{self.base_url}/api/control",
                json={"action": drive},
                timeout=5,
            )
        except Exception:
            pass

        # Then adjust the camera orientation
        try:
            requests.post(
                f"{self.base_url}/api/control",
                json={"action": "camera2", "value": int(angle)},
                timeout=5,
            )
        except Exception:
            pass

        self.done = False

    def compute_reward(self, s, s2):
        if self.stalled:
            self.stalled = False
            self.done = True
            return STALL_PENALTY

        cov_gain = s2[6] - s[6]
        reward = STEP_PENALTY + cov_gain * 5

        # Penalize standing still
        if s2[3] == 0:
            reward += ZERO_SPEED_PENALTY

        # Distances to obstacles
        min_dist = min(s2[0], s2[1], s2[2])
        if min_dist < COLLISION_DIST:
            reward += COLLISION_PENALTY
        elif min_dist < NEAR_DIST:
            reward += NEAR_PENALTY
        else:
            reward += s[0] - s2[0]

        if self.map_switched:
            reward += GOAL_REWARD
            self.map_switched = False

        if self.waypoint_hit:
            reward += WAYPOINT_REWARD
            self.waypoint_hit = False

        if s2[6] >= 0.5 and not self.night_mode:
            self.night_mode = True

        if s2[7] <= 0 and not self.map_switched:
            reward += BATTERY_PENALTY

        return reward