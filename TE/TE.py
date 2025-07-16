from abc import ABC, abstractmethod
import math
import time


# === Base Interface ===
class Environment(ABC):
    @abstractmethod
    def reset(self):
        pass

    @abstractmethod
    def send_action(self, action_index):
        pass

    @abstractmethod
    def get_state(self):
        pass

    @abstractmethod
    def compute_reward(self, prev_state, new_state):
        pass


# === Action Definitions ===
ACTIONS = ["forward", "left", "right", "backward", "stop"]


# === SimEnv Implementation ===
class SimEnv(Environment):
    def __init__(self):
        self.width = 800
        self.height = 600
        self.car_width = 40
        self.car_length = 60
        self.goal = (700, 500, 50, 50)  # x, y, w, h
        self.obstacles = [
            (300, 200, 100, 100),
            (500, 100, 50, 300)
        ]
        self.reset()

    def reset(self):
        self.pos_x = 100.0
        self.pos_y = 100.0
        self.rotation = math.pi
        self.speed = 0.0
        self.rpm = 0.0
        self.battery = 1.0
        self.gyro = 180

        self.acceleration = 0.0
        self.steering_angle = 0.0

        self.crashed = False
        self.goal_reached = False
        self.done = False

        self.last_time = time.time()

        return self.get_state()

    def send_action(self, action_index):
        action = ACTIONS[action_index]
        self._update_action(action)
        self._simulate_step()

    def get_state(self):
        return [
            self._simulate_sensor_front(),
            self._simulate_sensor_left(),
            self._simulate_sensor_right(),
            abs(self.speed) * 60,
            self.gyro,
            abs(self.rpm),
            0.0,  # placeholder for coverage
            self.battery
        ]

    def compute_reward(self, prev_state, new_state):
        if self.done and self.goal_reached:
            return 100
        if self.crashed:
            return -10
        return -0.1  # small time penalty

    def _update_action(self, action):
        if action == "forward":
            self.acceleration = 0.2
        elif action == "backward":
            self.acceleration = -0.2
        else:
            self.acceleration = 0.0

        if action == "left":
            self.steering_angle = max(self.steering_angle - 0.015, -math.radians(60))
        elif action == "right":
            self.steering_angle = min(self.steering_angle + 0.015, math.radians(60))
        else:
            self.steering_angle *= 0.9  # auto-centering

    def _simulate_step(self):
        now = time.time()
        dt = now - self.last_time
        self.last_time = now

        self.speed += self.acceleration
        self.speed *= 0.98
        self.speed = max(min(self.speed, 5.0), -5.0)

        rot_change = (self.speed / 50.0) * math.tan(self.steering_angle)
        self.rotation += rot_change

        nx = self.pos_x + math.cos(self.rotation + math.pi) * self.speed
        ny = self.pos_y + math.sin(self.rotation + math.pi) * self.speed

        if self._in_bounds(nx, ny) and not self._collides(nx, ny):
            self.pos_x = nx
            self.pos_y = ny
            self.crashed = False
        else:
            self.crashed = True
            self.speed = 0.0
            self.acceleration = 0.0

        if self._reached_goal():
            self.goal_reached = True
            self.done = True

        self.rpm = abs((self.speed / 5.0) * 100.0)
        self.battery = max(0.0, self.battery - self.rpm * dt * 0.000005)
        self.gyro = int((math.degrees(self.rotation) + 360) % 360)

        if self.battery <= 0:
            self.done = True

    def _in_bounds(self, x, y):
        return 0 <= x <= self.width and 0 <= y <= self.height

    def _collides(self, x, y):
        car_box = (x - self.car_width / 2, y - self.car_length / 2, self.car_width, self.car_length)
        for ox, oy, ow, oh in self.obstacles:
            if self._intersects(car_box, (ox, oy, ow, oh)):
                return True
        return False

    def _reached_goal(self):
        car_box = (self.pos_x - self.car_width / 2, self.pos_y - self.car_length / 2, self.car_width, self.car_length)
        return self._intersects(car_box, self.goal)

    def _intersects(self, a, b):
        ax, ay, aw, ah = a
        bx, by, bw, bh = b
        return not (ax + aw < bx or ax > bx + bw or ay + ah < by or ay > by + bh)

    def _simulate_sensor_front(self):
        return 50.0

    def _simulate_sensor_left(self):
        return 50.0

    def _simulate_sensor_right(self):
        return 50.0


# === Testscript ===
if __name__ == "__main__":
    env = SimEnv()
    print("Initial:", env.get_state())
    for i in range(10):
        env.send_action(0)  # forward
        print(f"Step {i+1}:", env.get_state())
