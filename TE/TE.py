"""Headless simulation environment mimicking the JS car logic.

This module provides a small physics simulator that mirrors the behaviour
of the browser based version contained in ``VE``. The code follows a
classical object oriented design using a few helper classes to represent
map objects and the car.
"""

from __future__ import annotations

from dataclasses import dataclass
from abc import ABC, abstractmethod
import math
import time
from typing import List, Tuple, Optional


# === Base Interface ========================================================
class Environment(ABC):
    @abstractmethod
    def reset(self) -> List[float]:
        pass

    @abstractmethod
    def send_action(self, action_index: int) -> None:
        pass

    @abstractmethod
    def get_state(self) -> List[float]:
        pass

    @abstractmethod
    def compute_reward(self, prev_state: List[float], new_state: List[float]) -> float:
        pass


# === Map Objects ===========================================================
@dataclass
class Obstacle:
    x: float
    y: float
    size: float

    def intersects_rect(self, x: float, y: float, w: float, h: float) -> bool:
        return not (
            x + w < self.x
            or x > self.x + self.size
            or y + h < self.y
            or y > self.y + self.size
        )


@dataclass
class Target:
    x: float
    y: float
    size: float

    def intersects_rect(self, x: float, y: float, w: float, h: float) -> bool:
        return not (
            x + w < self.x
            or x > self.x + self.size
            or y + h < self.y
            or y > self.y + self.size
        )


@dataclass
class Waypoint:
    x: float
    y: float
    size: float
    active: bool = True

    def intersects_rect(self, x: float, y: float, w: float, h: float) -> bool:
        if not self.active:
            return False
        return not (
            x + w < self.x
            or x > self.x + self.size
            or y + h < self.y
            or y > self.y + self.size
        )


class GameMap:
    """Simple map consisting of obstacles, waypoints and a target."""

    def __init__(self, cols: int, rows: int, cell_size: float = 40, margin: float = 0) -> None:
        self.cols = cols
        self.rows = rows
        self.cell_size = cell_size
        self.margin = margin
        self.obstacles: List[Obstacle] = []
        self.waypoints: List[Waypoint] = []
        self.target: Optional[Target] = None
        self.startX = 0.0
        self.startY = 0.0

    @property
    def width(self) -> float:
        return self.cols * self.cell_size

    @property
    def height(self) -> float:
        return self.rows * self.cell_size

    # ------------------------------------------------------------------
    @staticmethod
    def from_csv(path: str) -> "GameMap":
        """Load map information from a CSV file."""
        with open(path, "r", encoding="utf-8") as fh:
            lines = [ln.strip() for ln in fh.readlines() if ln.strip()]
        cols, rows, cell, margin = map(float, lines[0].split(","))
        gm = GameMap(int(cols), int(rows), cell, margin)
        for ln in lines[1:]:
            parts = ln.split(",")
            kind = parts[0]
            if kind == "start" and len(parts) >= 3:
                gm.startX = float(parts[1])
                gm.startY = float(parts[2])
            elif kind == "target" and len(parts) >= 3:
                size = float(parts[3]) if len(parts) > 3 else 10
                gm.target = Target(float(parts[1]), float(parts[2]), size)
            elif kind == "waypoint" and len(parts) >= 4:
                gm.waypoints.append(Waypoint(float(parts[1]), float(parts[2]), float(parts[3])))
            elif kind == "obstacle" and len(parts) >= 4:
                gm.obstacles.append(Obstacle(float(parts[1]), float(parts[2]), float(parts[3])))
        return gm

    # ------------------------------------------------------------------
    def in_bounds(self, x: float, y: float, w: float = 0, h: float = 0) -> bool:
        return (
            x >= self.margin
            and y >= self.margin
            and x + w <= self.width - self.margin
            and y + h <= self.height - self.margin
        )


# === Car ===================================================================
class Car:
    """Replicates the car behaviour of the JS simulator."""

    BATTERY_RATE = 0.000005

    def __init__(self, game_map: GameMap, hitbox_width: float = 40, hitbox_height: float = 60) -> None:
        self.map = game_map
        self.hitbox_width = hitbox_width
        self.hitbox_height = hitbox_height
        self.wheel_base = 50
        self.max_speed = 5.0
        self.accel_rate = 0.2
        self.decel_rate = 0.05
        self.max_rpm = 5000
        self.max_steering = math.radians(60)
        self.steer_rate = 0.015
        self.reset()

    # ------------------------------------------------------------------
    def reset(self) -> None:
        self.pos_x = self.map.startX
        self.pos_y = self.map.startY
        self.velocity = 0.0
        self.acceleration = 0.0
        self.rotation = math.pi
        self.steering_angle = 0.0
        self.rpm = 0.0
        self.speed = 0.0
        self.gyro = 180.0
        self.battery = 1.0
        self.crashed = False
        self.last_update = time.time()

    # ------------------------------------------------------------------
    def _bounding_box(self, x: float, y: float, rotation: Optional[float] = None) -> Tuple[float, float, float, float]:
        if rotation is None:
            rotation = self.rotation
        cx = x + self.hitbox_width / 2
        cy = y + self.hitbox_height / 2
        corners = [
            (-self.hitbox_width / 2, -self.hitbox_height / 2),
            (self.hitbox_width / 2, -self.hitbox_height / 2),
            (self.hitbox_width / 2, self.hitbox_height / 2),
            (-self.hitbox_width / 2, self.hitbox_height / 2),
        ]
        rot = []
        cos = math.cos(rotation)
        sin = math.sin(rotation)
        for dx, dy in corners:
            rx = dx * cos - dy * sin
            ry = dx * sin + dy * cos
            rot.append((cx + rx, cy + ry))
        xs = [p[0] for p in rot]
        ys = [p[1] for p in rot]
        return min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)

    # ------------------------------------------------------------------
    def _collides(self, bbox: Tuple[float, float, float, float]) -> bool:
        for o in self.map.obstacles:
            if o.intersects_rect(*bbox):
                return True
        return False

    # ------------------------------------------------------------------
    def _ray_rect_intersection(self, fx: float, fy: float, angle: float, rect: Tuple[float, float, float, float]) -> float:
        rx, ry, rw, rh = rect
        cos = math.cos(angle)
        sin = math.sin(angle)
        min_t = float("inf")
        if abs(cos) > 1e-6:
            for rx_edge in (rx, rx + rw):
                t = (rx_edge - fx) / cos
                if t >= 0:
                    y = fy + t * sin
                    if ry <= y <= ry + rh:
                        min_t = min(min_t, t)
        if abs(sin) > 1e-6:
            for ry_edge in (ry, ry + rh):
                t = (ry_edge - fy) / sin
                if t >= 0:
                    x = fx + t * cos
                    if rx <= x <= rx + rw:
                        min_t = min(min_t, t)
        return min_t

    # ------------------------------------------------------------------
    def _cast_distance(self, angle: float, length: float = 150.0) -> float:
        fx = self.pos_x + self.hitbox_width / 2
        fy = self.pos_y + self.hitbox_height / 2
        best = length
        objs: List[Tuple[float, float, float, float]] = [
            (o.x, o.y, o.size, o.size) for o in self.map.obstacles
        ]
        if self.map.target:
            objs.append((self.map.target.x, self.map.target.y, self.map.target.size, self.map.target.size))
        for rect in objs:
            dist = self._ray_rect_intersection(fx, fy, angle, rect)
            if dist < best:
                best = dist
        return best

    # ------------------------------------------------------------------
    def update(self, action: str) -> None:
        now = time.time()
        dt = now - self.last_update
        self.last_update = now

        # Acceleration handling
        if action == "forward":
            self.acceleration = self.accel_rate
        elif action == "backward":
            self.acceleration = -self.accel_rate
        else:
            if self.velocity > 0:
                self.acceleration = -self.decel_rate
            elif self.velocity < 0:
                self.acceleration = self.decel_rate
            else:
                self.acceleration = 0.0

        # Steering
        if action == "left":
            self.steering_angle = max(
                -self.max_steering, self.steering_angle - self.steer_rate
            )
        elif action == "right":
            self.steering_angle = min(
                self.max_steering, self.steering_angle + self.steer_rate
            )
        else:
            if self.steering_angle > 0:
                self.steering_angle = max(0.0, self.steering_angle - self.steer_rate)
            elif self.steering_angle < 0:
                self.steering_angle = min(0.0, self.steering_angle + self.steer_rate)

        # Velocity and rotation
        self.velocity += self.acceleration
        self.velocity = max(-self.max_speed, min(self.max_speed, self.velocity))
        if abs(self.velocity) < 0.01 and action not in ("forward", "backward"):
            self.velocity = 0.0
        rot_change = (
            (self.velocity / self.wheel_base) * math.tan(self.steering_angle)
            if self.velocity != 0
            else 0.0
        )
        new_rot = self.rotation + rot_change
        front_rot = self.rotation + math.pi
        nx = self.pos_x + math.cos(front_rot) * self.velocity
        ny = self.pos_y + math.sin(front_rot) * self.velocity
        bbox = self._bounding_box(nx, ny, new_rot)

        if self.map.in_bounds(*bbox) and not self._collides(bbox):
            self.pos_x = nx
            self.pos_y = ny
            self.rotation = new_rot
            self.crashed = False
        else:
            self.velocity = 0.0
            self.acceleration = 0.0
            self.crashed = True

        # Telemetry
        self.speed = abs(self.velocity * 60)
        self.rpm = abs((self.velocity / self.max_speed) * self.max_rpm)
        self.gyro = (math.degrees(self.rotation) % 360 + 360) % 360
        self.battery = max(0.0, self.battery - self.rpm * dt * self.BATTERY_RATE)

    # ------------------------------------------------------------------
    def distances(self) -> Tuple[float, float, float, float]:
        front = self._cast_distance(self.rotation + math.pi)
        left = self._cast_distance(self.rotation + math.pi / 2)
        right = self._cast_distance(self.rotation - math.pi / 2)
        rear = self._cast_distance(self.rotation)
        return front, left, right, rear


# === Environment ===========================================================
ACTIONS = ["forward", "left", "right", "backward", "stop"]


class SimEnv(Environment):
    """Headless simulator built on top of :class:`Car` and :class:`GameMap`."""

    def __init__(self, map_file: str = "VE/static/maps/Level1.csv") -> None:
        self.map = GameMap.from_csv(map_file)
        self.car = Car(self.map)
        self.done = False
        self.goal_reached = False

    # ------------------------------------------------------------------
    def reset(self) -> List[float]:
        self.car.reset()
        self.done = False
        self.goal_reached = False
        return self.get_state()

    # ------------------------------------------------------------------
    def send_action(self, action_index: int) -> None:
        action = ACTIONS[action_index]
        self.car.update(action)
        self._check_goal()
        if self.car.battery <= 0:
            self.done = True

    # ------------------------------------------------------------------
    def get_state(self) -> List[float]:
        front, left, right, _rear = self.car.distances()
        return [
            front,
            left,
            right,
            self.car.speed,
            self.car.gyro,
            self.car.rpm,
            0.0,  # coverage placeholder
            self.car.battery,
        ]

    # ------------------------------------------------------------------
    def compute_reward(self, prev_state: List[float], new_state: List[float]) -> float:
        if self.done and self.goal_reached:
            return 100.0
        if self.car.crashed:
            return -10.0
        return -0.1

    # ------------------------------------------------------------------
    def _check_goal(self) -> None:
        if not self.map.target:
            return
        bbox = self.car._bounding_box(self.car.pos_x, self.car.pos_y)
        if self.map.target.intersects_rect(*bbox):
            self.goal_reached = True
            self.done = True


# === Simple manual test ====================================================
if __name__ == "__main__":
    env = SimEnv()
    print("Initial:", env.get_state())
    for i in range(10):
        env.send_action(0)  # forward
        print(f"Step {i + 1}:", env.get_state())

