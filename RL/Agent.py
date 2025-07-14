import numpy as np
import tensorflow as tf
from collections import deque
import random
import time
import csv
from datetime import datetime
import requests

ACTIONS = ["forward", "left", "right", "backward", "stop"]
STATE_SIZE = 6
ACTION_SIZE = len(ACTIONS)


class DummyEnv:
    def __init__(self):
        self.reset()

    def reset(self):
        self.position = 0
        self.goal = 10
        self.done = False
        self.speed = 1
        self.rpm = 100
        self.gyro = 0

    def get_state(self):
        dist_front = max(self.goal - self.position, 0)
        dist_left = 1
        dist_right = 1
        return [dist_front, dist_left, dist_right, self.speed, self.gyro, self.rpm]

    def send_action(self, action_index):
        action = ACTIONS[action_index]
        if action == "forward":
            self.position += 1
        elif action == "backward":
            self.position = max(0, self.position - 1)
        elif action == "stop":
            pass
        elif action == "left":
            self.gyro -= 10
        elif action == "right":
            self.gyro += 10

        if self.position >= self.goal:
            self.done = True

    def compute_reward(self, state, next_state):
        if self.done:
            return 10
        elif next_state[0] < 1:
            return -5
        else:
            return state[0] - next_state[0]


class ServerEnv:
    """Environment that communicates with the Flask server."""

    def __init__(self, base_url="http://127.0.0.1:5000"):
        self.base_url = base_url.rstrip("/")
        self.done = False

    def reset(self):
        self.done = False
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
        return [dist_front, dist_left, dist_right, speed, gyro, rpm]

    def send_action(self, action_index):
        action = ACTIONS[action_index]
        try:
            requests.post(
                f"{self.base_url}/api/control",
                json={"action": action},
                timeout=5,
            )
        except Exception:
            pass

    def compute_reward(self, state, next_state):
        if next_state[0] < 20:
            return -5
        return state[0] - next_state[0]


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
        if np.random.rand() <= self.epsilon:
            return random.randrange(ACTION_SIZE)
        q_values = self.model.predict(np.array([state]), verbose=0)
        return np.argmax(q_values[0])

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


# Logging vorbereiten
logfile = open("rl_log.csv", mode="w", newline='')
logger = csv.writer(logfile)
logger.writerow(["episode", "step", "timestamp", "action", "state", "reward", "done", "epsilon"])

# Hauptloop
import sys

env = DummyEnv()
if "--server" in sys.argv:
    idx = sys.argv.index("--server")
    base = "http://127.0.0.1:5000"
    if idx + 1 < len(sys.argv):
        base = sys.argv[idx + 1]
    env = ServerEnv(base)

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
        # Logging
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
