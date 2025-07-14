import numpy as np
import tensorflow as tf
from collections import deque
import random
import time
import csv
from datetime import datetime
import requests

ACTIONS = ["forward", "left", "right", "backward", "stop"]
STATE_SIZE = 7
ACTION_SIZE = len(ACTIONS)

class ServerEnv:
    def __init__(self, base_url="http://127.0.0.1:5000"):
        self.base_url = base_url.rstrip("/")
        self.done = False
        self.night_mode = False
        self.map_switched = False
        self.stalled = False
        self.last_move_time = time.time()

    def reset(self):
        self.done = False
        self.night_mode = False
        self.map_switched = False
        self.stalled = False
        self.last_move_time = time.time()
        return self.get_state()

    def get_state(self):
        try:
            res = requests.get(f"{self.base_url}/api/car", timeout=5)
            data = res.json()
        except Exception:
            data = {}
        dist = data.get("distances", {})
        dist_front = dist.get("front", 0)
        dist_left = dist.get("left", 0)
        dist_right = dist.get("right", 0)
        speed = data.get("speed", 0)
        gyro = data.get("gyro", 0)
        rpm = data.get("rpm", 0)
        # Stall detection
        if speed > 0:
            self.last_move_time = time.time()
        elif time.time() - self.last_move_time > 10:
            try:
                requests.post(
                    f"{self.base_url}/api/control",
                    json={"action": "restart"},
                    timeout=5,
                )
            except Exception:
                pass
            self.stalled = True
            speed = 0
            coverage = 0.0
            return [dist_front, dist_left, dist_right, speed, gyro, rpm, coverage]
        try:
            slam_res = requests.get(f"{self.base_url}/api/slam-map", timeout=5)
            slam = slam_res.json()
            cells = slam.get("cells", [])
            total = sum(len(row) for row in cells)
            known = sum(1 for row in cells for val in row if val != 0)
            coverage = known / total if total else 0.0
        except Exception:
            coverage = 0.0
        return [
            dist_front,
            dist_left,
            dist_right,
            speed,
            gyro,
            rpm,
            coverage,
        ]

    def send_action(self, action_index):
        action = ACTIONS[action_index]
        self.map_switched = False
        try:
            requests.post(
                f"{self.base_url}/api/control",
                json={"action": action},
                timeout=5,
            )
        except Exception:
            pass
        self.done = False

    def compute_reward(self, state, next_state):
        if self.stalled:
            self.stalled = False
            return -10
        coverage_gain = next_state[6] - state[6]
        if next_state[0] < 20:
            reward = -5
        else:
            reward = state[0] - next_state[0]
        reward += coverage_gain * 5
        if self.map_switched:
            reward += 20
            self.map_switched = False
        if next_state[6] >= 0.5 and not self.night_mode:
            self.night_mode = True
            print("Night mode activated (ServerEnv)")
        return reward

class DQNAgent:
    def __init__(self):
        self.memory = deque(maxlen=2000)
        self.gamma = 0.95
        self.epsilon = 1.0
        self.epsilon_min = 0.01
        self.epsilon_decay = 0.995
        self.model = self._build_model()

    def _build_model(self):
        model = tf.keras.models.Sequential([
            tf.keras.layers.Dense(24, input_dim=STATE_SIZE, activation='relu'),
            tf.keras.layers.Dense(24, activation='relu'),
            tf.keras.layers.Dense(ACTION_SIZE, activation='linear')
        ])
        model.compile(loss='mse', optimizer=tf.keras.optimizers.Adam(learning_rate=0.001))
        return model

    def act(self, state):
        allowed_actions = list(range(ACTION_SIZE))
        if np.random.rand() <= self.epsilon:
            return random.choice(allowed_actions)
        q_values = self.model.predict(np.array([state]), verbose=0)[0]
        return int(np.argmax(q_values))

    def remember(self, s, a, r, s_, done):
        self.memory.append((s, a, r, s_, done))

    def replay(self, batch_size=32):
        minibatch = random.sample(self.memory, min(len(self.memory), batch_size))
        for s, a, r, s_, done in minibatch:
            target = r
            if not done:
                target += self.gamma * np.amax(self.model.predict(np.array([s_]), verbose=0)[0])
            q_values = self.model.predict(np.array([s]), verbose=0)
            q_values[0][a] = target
            self.model.fit(np.array([s]), q_values, epochs=1, verbose=0)
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

logfile = open("rl_log.csv", mode="w", newline='')
logger = csv.writer(logfile)
logger.writerow(["episode", "step", "timestamp", "action", "state", "reward", "done", "epsilon"])

env = ServerEnv("http://127.0.0.1:5000")
agent = DQNAgent()

for episode in range(1000):
    env.reset()
    state = env.get_state()
    total_reward = 0
    for step in range(100):
        action = agent.act(state)
        env.send_action(action)
        next_state = env.get_state()
        reward = env.compute_reward(state, next_state)
        done = env.done
        agent.remember(state, action, reward, next_state, done)
        logger.writerow([
            episode,
            step,
            datetime.now().isoformat(),
            ACTIONS[action],
            state,
            reward,
            done,
            round(agent.epsilon, 5)
        ])
        state = next_state
        total_reward += reward
        if done:
            break
    print(f"Episode {episode} Reward: {total_reward}")
    agent.replay()

logfile.close()
