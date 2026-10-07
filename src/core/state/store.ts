/**
 * Поточний стан гри для сцен: завантажується з localStorage один раз, зберігається через persist().
 */
import { loadGame, newGame, saveGame, type KeyValueStorage, type SaveData } from './GameState';

/** localStorage може бути недоступний (приватний режим, вимкнені cookies) — тоді працюємо в пам'яті. */
function safeStorage(): KeyValueStorage {
  const memory = new Map<string, string>();
  const fallback: KeyValueStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  };
  try {
    const ls = window.localStorage;
    const probe = '__dodep_probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return fallback;
  }
}

const storage = safeStorage();
let current: SaveData | null = null;

export function gameState(): SaveData {
  if (!current) current = loadGame(storage);
  return current;
}

export function persist(): void {
  if (current) saveGame(storage, current);
}

export function resetGame(): SaveData {
  current = newGame();
  persist();
  return current;
}
