import os
import numpy as np
import random
from collections import deque
import tensorflow as tf
from utils import STATE_SIZE, ACTION_SIZE

class DQNAgent:
    def __init__(self, model_path=None):
        self.memory = deque(maxlen=2000)
        self.gamma = 0.95
        self.epsilon = 1.0
        self.epsilon_min = 0.01
        self.epsilon_decay = 0.995
        self.model = None
        if model_path and os.path.exists(model_path):
            try:
                self.model = tf.keras.models.load_model(model_path)
            except Exception:
                self.model = self._build_model()
        else:
            self.model = self._build_model()
        self.model_path = model_path

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
            s = np.asarray(s)
            s2 = np.asarray(s2)
            target = r if done else r + self.gamma * np.max(
                self.model.predict(s2[np.newaxis], verbose=0)[0]
            )
            q = self.model.predict(s[np.newaxis], verbose=0)
            q[0][a] = target
            self.model.fit(s[np.newaxis], q, epochs=1, verbose=0)
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

    def save(self, path=None):
        """Persist the current model to disk."""
        if path is None:
            path = self.model_path
        if path:
            self.model.save(path)

    def load(self, path=None):
        """Load model weights from disk."""
        if path is None:
            path = self.model_path
        if path and os.path.exists(path):
            self.model = tf.keras.models.load_model(path)
            self.model_path = path
