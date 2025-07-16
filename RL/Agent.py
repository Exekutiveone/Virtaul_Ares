import numpy as np
import random
from collections import deque
import tensorflow as tf
import os
from utils import STATE_SIZE, ACTION_SIZE

class DQNAgent:
    def __init__(self, weights_path="dqn_model.h5"):
        self.memory = deque(maxlen=2000)
        self.weights_path = weights_path
        self.gamma = 0.95
        self.epsilon = 1.0
        self.epsilon_min = 0.01
        self.epsilon_decay = 0.995
        self.model = self._build_model()
        if os.path.exists(self.weights_path):
            try:
                self.model = tf.keras.models.load_model(self.weights_path)
            except Exception:
                self.model.load_weights(self.weights_path)

    def _build_model(self):
        m = tf.keras.models.Sequential([
            tf.keras.layers.Dense(24, input_dim=STATE_SIZE, activation='relu'),
            tf.keras.layers.Dense(24, activation='relu'),
            tf.keras.layers.Dense(ACTION_SIZE, activation='linear')
        ])
        m.compile(loss='mse', optimizer=tf.keras.optimizers.Adam(0.001))
        return m

    def act(self, state):
        if np.random.rand() <= self.epsilon:
            return random.randrange(ACTION_SIZE)
        q = self.model.predict(state[np.newaxis], verbose=0)[0]
        return int(np.argmax(q))

    def remember(self, s, a, r, s2, done):
        self.memory.append((s, a, r, s2, done))

    def replay(self, batch=32):
        samples = random.sample(self.memory, min(len(self.memory), batch))
        for s, a, r, s2, done in samples:
            target = r if done else r + self.gamma * np.max(self.model.predict(s2[np.newaxis], verbose=0)[0])
            q = self.model.predict(s[np.newaxis], verbose=0)
            q[0][a] = target
            self.model.fit(s[np.newaxis], q, epochs=1, verbose=0)
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

    def save(self):
        self.model.save(self.weights_path)
