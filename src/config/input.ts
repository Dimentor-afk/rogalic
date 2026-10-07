/**
 * Розкладка керування. Клавіші — імена з Phaser.Input.Keyboard.KeyCodes,
 * кнопки геймпада — індекси стандартної розкладки (Xbox: 0=A, 1=B, 2=X, 3=Y, 4=LB, 5=RB, 6=LT, 7=RT, 12-15 = D-pad).
 */
export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'attack' | 'roll' | 'block' | 'heal' | 'interact';

export interface Binding {
  keys: string[];
  pad: number[];
}

export const INPUT_BINDINGS: Record<Action, Binding> = {
  left: { keys: ['LEFT', 'A'], pad: [14] },
  right: { keys: ['RIGHT', 'D'], pad: [15] },
  up: { keys: ['UP', 'W'], pad: [12] },
  down: { keys: ['DOWN', 'S'], pad: [13] },
  jump: { keys: ['SPACE', 'Z'], pad: [0] },
  attack: { keys: ['J', 'X'], pad: [2, 7] },
  roll: { keys: ['L', 'SHIFT', 'C'], pad: [1] },
  block: { keys: ['K', 'V'], pad: [4, 6] },
  heal: { keys: ['Q', 'B'], pad: [3] },
  interact: { keys: ['E', 'UP', 'W'], pad: [5] },
};

/** Мертва зона лівого стіка: відхилення менше за це ігнорується. */
export const STICK_DEADZONE = 0.35;
