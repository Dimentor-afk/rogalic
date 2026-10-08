/**
 * Компоненти поведінки ворогів — переюзабельні модулі, з яких збирається архетип:
 *   meleeBrain   — патруль, переслідування, телеграф → удар (fast, heavy, splitter, thief);
 *   rangedBrain  — тримає дистанцію, стріляє снарядами (ranged; літаючий або наземний);
 *   thief        — при влучанні краде фішки забігу і тікає; вбили — фішки повертаються;
 *   splitOnDeath — при смерті ділиться на N менших копій.
 * Різниця між «швидким слабким» і «повільним важким» — лише в числах конфігу
 * (довжина телеграфу, шкода, швидкість) і в «гіпер-броні» важких (див. Enemy.takeHit).
 */
import type { EnemyDef } from '../../config/enemies';
import type { Enemy, EnemyComponent, EnemyWorld } from './Enemy';
import { chips } from '../../config/texts';

export function buildComponents(def: EnemyDef): EnemyComponent[] {
  switch (def.archetype) {
    case 'fast':
    case 'heavy':
      return [meleeBrain()];
    case 'splitter':
      return [meleeBrain(), splitOnDeath(def)];
    case 'thief':
      return [meleeBrain(), thief(def)];
    case 'ranged':
      return [rangedBrain()];
  }
}

// ---------------- спільні допоміжні ----------------

/** Помічає гравця, якщо він ближче за aggroRange і є пряма видимість; губить, якщо дуже далеко. */
function perceive(e: Enemy, w: EnemyWorld): void {
  const p = w.player;
  if (!p.alive) {
    e.aggro = false;
    return;
  }
  const dx = p.body.center.x - e.body.center.x;
  const dy = p.body.center.y - e.body.center.y;
  const dist = Math.hypot(dx, dy);
  if (!e.aggro) {
    if (dist <= e.def.aggroRange && w.canSee(e.body.center.x, e.body.y + 4, p.body.center.x, p.body.center.y)) e.aggro = true;
  } else if (dist > e.def.aggroRange * 1.8) {
    e.aggro = false;
  }
}

/** Чи можна йти в бік dir: попереду є підлога і немає стіни. */
function canWalk(e: Enemy, w: EnemyWorld, dir: 1 | -1): boolean {
  const b = e.body;
  const frontX = dir > 0 ? b.right + 2 : b.x - 2;
  return w.isFloorAt(frontX, b.bottom + 2) && !w.isSolidAt(frontX, b.bottom - 6);
}

function onGround(e: Enemy): boolean {
  return e.body.blocked.down;
}

/** Повільний патруль: ходить туди-сюди, розвертається на краях, іноді зупиняється. */
function patrol(e: Enemy, w: EnemyWorld, dtMs: number): void {
  const m = e.memory;
  m.patrolMs = (m.patrolMs ?? 1500) - dtMs;
  if (m.patrolMs <= 0) {
    m.patrolMs = 900 + Math.random() * 1600;
    m.patrolPause = Math.random() < 0.35 ? 1 : 0;
    if (Math.random() < 0.4) e.face(e.facing > 0 ? -1 : 1);
  }
  if (!onGround(e)) return;
  if (m.patrolPause || e.def.speed === 0) {
    e.body.setVelocityX(0);
    e.playIdle();
    return;
  }
  if (!canWalk(e, w, e.facing)) e.face(e.facing > 0 ? -1 : 1);
  e.body.setVelocityX(e.facing * e.def.speed * 0.4);
  e.playAnim('walk');
}

// ---------------- ближній бій ----------------

export function meleeBrain(): EnemyComponent {
  return {
    update(e, w, dtMs) {
      const p = w.player;
      const a = e.def.attack;
      perceive(e, w);
      switch (e.state) {
        case 'idle':
          patrol(e, w, dtMs);
          if (e.aggro) e.enter('chase');
          break;
        case 'chase': {
          if (!e.aggro) {
            e.enter('idle');
            break;
          }
          if (!onGround(e)) break; // у повітрі (відкинули) — не керуємо
          const dx = p.body.center.x - e.body.center.x;
          const dy = p.body.bottom - e.body.bottom;
          const dir: 1 | -1 = dx >= 0 ? 1 : -1;
          e.face(dir);
          const inRange = Math.abs(dx) <= a.triggerRange + e.body.width / 2 && Math.abs(dy) < 40;
          if (inRange && w.now() >= e.cooldownUntil) {
            e.beginWindup();
            break;
          }
          if (!inRange && canWalk(e, w, dir)) {
            e.body.setVelocityX(dir * e.def.speed);
            e.playAnim('walk');
          } else {
            e.body.setVelocityX(0);
            e.playIdle();
          }
          break;
        }
        case 'windup':
          e.body.setVelocityX(0);
          if (e.stateMs >= a.windupMs) e.enter('active');
          break;
        case 'active':
          // ривок уперед — для ворогів без анімації атаки це і є «удар»
          e.body.setVelocityX(canWalk(e, w, e.facing) ? e.facing * a.lungeSpeed : 0);
          if (!e.attackLanded) {
            const outcome = w.hitPlayer(e, e.attackRect(), a.damage, true);
            if (outcome) {
              e.attackLanded = true;
              e.notifyAttackLanded(outcome);
            }
          }
          if (e.state === 'active' && e.stateMs >= a.activeMs) {
            e.body.setVelocityX(0);
            e.enter('recovery');
          }
          break;
        case 'recovery':
          e.body.setVelocityX(0);
          if (!e.anims.isPlaying) e.playIdle();
          if (e.stateMs >= a.recoveryMs) {
            e.cooldownUntil = w.now() + a.cooldownMs;
            e.enter('chase');
          }
          break;
      }
    },
  };
}

// ---------------- дальній бій ----------------

export function rangedBrain(): EnemyComponent {
  return {
    update(e, w, dtMs) {
      const p = w.player;
      const a = e.def.attack;
      const r = e.def.ranged!;
      const flying = !!e.def.flying;
      perceive(e, w);
      const m = e.memory;
      m.t = (m.t ?? Math.random() * 1000) + dtMs;

      const dx = p.body.center.x - e.body.center.x;
      const dir: 1 | -1 = dx >= 0 ? 1 : -1;

      switch (e.state) {
        case 'idle':
          if (flying) e.body.setVelocity(0, Math.sin(m.t / 300) * 12);
          else patrol(e, w, dtMs);
          e.playIdle();
          if (e.aggro) e.enter('chase');
          break;
        case 'chase': {
          if (!e.aggro) {
            e.enter('idle');
            break;
          }
          e.face(dir);
          // тримаємо дистанцію: стоїмо з того боку, де вже є, на preferredDistance від гравця
          const side = e.body.center.x >= p.body.center.x ? 1 : -1;
          const tx = p.body.center.x + side * r.preferredDistance;
          if (flying) {
            const ty = p.body.center.y - 44 + Math.sin(m.t / 280) * 8;
            const vx = Math.max(-1, Math.min(1, (tx - e.body.center.x) / 40)) * e.def.speed;
            const vy = Math.max(-1, Math.min(1, (ty - e.body.center.y) / 30)) * e.def.speed;
            e.body.setVelocity(vx, vy);
          } else if (onGround(e)) {
            const want: 1 | -1 = tx > e.body.center.x ? 1 : -1;
            if (Math.abs(tx - e.body.center.x) > 12 && canWalk(e, w, want)) e.body.setVelocityX(want * e.def.speed);
            else e.body.setVelocityX(0);
          }
          e.playAnim('walk');
          const dist = Math.hypot(dx, p.body.center.y - e.body.center.y);
          const sees = w.canSee(e.body.center.x, e.body.center.y, p.body.center.x, p.body.center.y);
          if (dist <= r.fireRange && sees && w.now() >= e.cooldownUntil) e.beginWindup();
          break;
        }
        case 'windup':
          e.body.setVelocity(0, flying ? Math.sin(m.t / 200) * 6 : e.body.velocity.y);
          if (e.stateMs >= a.windupMs) {
            // стріляємо в ту точку, де гравець зараз
            const sx = e.body.center.x + e.facing * 10;
            const sy = e.body.center.y;
            const tx = p.body.center.x - sx;
            const ty = p.body.center.y - sy;
            const len = Math.hypot(tx, ty) || 1;
            w.spawnEnemyProjectile(e, sx, sy, (tx / len) * r.projectile.speed, (ty / len) * r.projectile.speed);
            e.enter('recovery');
          }
          break;
        case 'active':
          e.enter('recovery');
          break;
        case 'recovery':
          if (flying) e.body.setVelocity(e.body.velocity.x * 0.9, e.body.velocity.y * 0.9);
          else e.body.setVelocityX(0);
          if (!e.anims.isPlaying) e.playIdle();
          if (e.stateMs >= a.recoveryMs) {
            e.cooldownUntil = w.now() + a.cooldownMs;
            e.enter('chase');
          }
          break;
      }
    },
  };
}

// ---------------- злодій ----------------

export function thief(def: EnemyDef): EnemyComponent {
  const s = def.steal!;
  return {
    onAttackLanded(e, w, outcome) {
      if (outcome !== 'hit' && outcome !== 'guardBreak') return;
      const want = Math.max(s.minChips, Math.floor(w.runChips() * s.fraction));
      const got = w.stealChips(want);
      if (got <= 0) return;
      e.stolenChips += got;
      w.fx.floatText(e.x, e.y - e.displayHeight - 4, `-${chips(got)}!`, '#ff7a7a');
      w.fx.playFx('coins', e.x, e.y - 14, { scale: 0.5 });
      e.enter('flee');
    },
    update(e, w) {
      if (e.state !== 'flee') return;
      const p = w.player;
      const dir: 1 | -1 = e.body.center.x >= p.body.center.x ? 1 : -1;
      e.face(dir);
      if (onGround(e)) {
        const b = e.body;
        const frontX = dir > 0 ? b.right + 2 : b.x - 2;
        // кіт: стіна попереду — перестрибує, край — просто зістрибує вниз
        if (w.isSolidAt(frontX, b.bottom - 6)) e.body.setVelocityY(-290);
        e.body.setVelocityX(dir * s.fleeSpeed);
      }
      if (!e.playAnim('run')) e.playAnim('walk');
      // втік: довго тікає і гравець його не бачить → зникає разом із фішками
      const far = Math.abs(p.body.center.x - e.body.center.x) > 260;
      if (e.stateMs > s.escapeMs || (far && e.stateMs > 1500 && !w.canSee(e.body.center.x, e.body.center.y, p.body.center.x, p.body.center.y))) {
        w.fx.playFx('smoke', e.x, e.y - 10);
        w.fx.floatText(e.x, e.y - 24, 'втік з фішками', '#ff7a7a');
        e.stolenChips = 0;
        e.destroy();
      }
    },
    onDeath(e, w) {
      if (e.stolenChips > 0) w.returnChips(e.stolenChips, e.x, e.y - 10);
      e.stolenChips = 0;
    },
  };
}

// ---------------- поділ ----------------

export function splitOnDeath(def: EnemyDef): EnemyComponent {
  const sp = def.split!;
  return {
    onDeath(e, w) {
      for (let i = 0; i < sp.count; i++) {
        const off = (i - (sp.count - 1) / 2) * 12;
        const child = w.spawnEnemy(sp.into, e.x + off, e.y - 2, e.depthLevel);
        if (!child) continue;
        child.aggro = true;
        child.cooldownUntil = w.now() + 500;
        child.body.setVelocity(Math.sign(off || 1) * 90, -170);
      }
    },
  };
}
