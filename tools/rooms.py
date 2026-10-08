# Шаблони кімнат підземелля (30×17) → src/levels/rooms.json.
# Запуск з кореня репозиторію:  python3 -I tools/rooms.py src/levels/rooms.json
# Скрипт друкує кожну кімнату ASCII-картинкою; прохідність перевіряють тести: npx vitest run tests/dungeon.test.ts
#
# Легенда — у src/config/dungeon.ts. Правила, під які намальовано кімнати (лицар — 3 клітинки заввишки,
# стрибок — до 3 рядків угору):
#   - підлога біля бічних виходів — рядок 15, уступи — по 1–3 рядки і не впритул до виходу;
#   - над будь-якою опорою щонайменше 3 вільні рядки (проходи не нижчі за 3);
#   - дошка — лише як місток або коротка платформа, не вище 3 рядків над опорою під нею;
#   - підйом до верхнього виходу — дошки ^ через 3 рядки «зиґзаґом»; без виходу U їх немає.
import json, sys

W, H = 30, 17
FLOOR = 15  # верхній ряд скелі підлоги; гравець стоїть у рядку 14
# стандартний підйом з підлоги до виходу U: з дошки на дошку — стрибок на 3 рядки і до 2 клітинок убік
CLIMB = [(9, 12, 12), (14, 17, 9), (10, 13, 6), (13, 16, 3)]


class Room:
    def __init__(self, id, type, exits):
        self.id, self.type, self.exits = id, type, exits
        self.g = [['#'] * W for _ in range(H)]
        self.carve(2, 2, W - 3, FLOOR - 1)  # базова порожнина
        if 'L' in exits:
            for y in range(11, 15): self.g[y][0] = 'L'; self.g[y][1] = '.'
        if 'R' in exits:
            for y in range(11, 15): self.g[y][W - 1] = 'R'; self.g[y][W - 2] = '.'
        if 'U' in exits:
            for x in range(13, 17): self.g[0][x] = 'U'; self.g[1][x] = 'u'
        if 'D' in exits:
            for x in range(13, 17): self.g[16][x] = 'D'; self.g[15][x] = 'd'

    def carve(self, x0, y0, x1, y1, ch='.'):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): self.g[y][x] = ch

    def fill(self, x0, y0, x1, y1): self.carve(x0, y0, x1, y1, '#')

    def ceil(self, x0, x1, bottom):
        """Стеля: скеля від рядка 2 до bottom включно."""
        self.fill(x0, 2, x1, bottom)

    def step(self, x0, x1, top):
        """Підвищення підлоги: скеля від рядка top до підлоги (стоїмо в рядку top-1)."""
        self.fill(x0, top, x1, FLOOR - 1)

    def plank(self, x0, x1, y, ch='='): self.carve(x0, y, x1, y, ch)

    def climb(self, steps=None):
        """Підйом до виходу U: короткі дошки ^ (x0, x1, рядок) через 3 рядки зиґзаґом, остання — під отвором."""
        for x0, x1, y in steps or CLIMB: self.plank(x0, x1, y, '^')

    def put(self, x, y, ch):
        assert self.g[y][x] == '.', (self.id, x, y, self.g[y][x])
        self.g[y][x] = ch

    def out(self):
        return {"id": self.id, "type": self.type, "exits": self.exits, "rows": [''.join(r) for r in self.g]}


rooms = []

# ---------- старт ----------
r = Room('start_camp', 'start', 'LRUD')
r.ceil(2, 8, 6); r.ceil(21, 27, 5); r.fill(9, 2, 9, 3); r.fill(20, 2, 20, 3)
r.climb()
r.put(4, 14, 'P'); r.put(23, 14, 'b'); r.put(25, 14, 'b')
rooms.append(r)

r = Room('start_ledge', 'start', 'LR')
r.ceil(2, 27, 5); r.fill(9, 6, 13, 6); r.fill(20, 6, 24, 7)
r.step(4, 9, 13)  # уступ на 2 рядки, з нього старт
r.put(6, 12, 'P'); r.put(20, 14, 'b'); r.put(22, 14, 'b')
rooms.append(r)

r = Room('start_arch', 'start', 'LR')
r.ceil(2, 27, 3); r.fill(2, 4, 5, 6); r.fill(23, 4, 27, 5)
r.fill(11, 4, 18, 9)  # нависла скеля-арка, під нею прохід у 5 рядків
r.put(5, 14, 'P'); r.put(8, 14, 'b'); r.put(24, 14, 'b')
rooms.append(r)

# ---------- вихід (ліфт + спуск) ----------
r = Room('exit_lift', 'exit', 'LRUD')
r.ceil(2, 8, 6); r.ceil(21, 27, 6); r.fill(9, 2, 9, 3); r.fill(20, 2, 20, 4)
r.climb()
r.put(5, 14, 'V')   # двері глибше
r.put(24, 14, 'E')  # ліфт нагору
rooms.append(r)

r = Room('exit_hall', 'exit', 'LR')
r.ceil(2, 27, 6); r.fill(11, 7, 18, 7)
r.step(12, 17, 13)  # невеликий поміст посередині
r.put(5, 14, 'V'); r.put(24, 14, 'E')
rooms.append(r)

r = Room('exit_gate', 'exit', 'LRD')
r.ceil(2, 27, 5); r.fill(2, 6, 10, 7); r.fill(19, 6, 27, 6)
r.step(4, 10, 13)  # двері глибше — на терасі на 2 рядки
r.put(7, 12, 'V'); r.put(23, 14, 'E')
rooms.append(r)

# ---------- скарб ----------
r = Room('treasure_vault', 'treasure', 'LRU')
r.ceil(2, 7, 6); r.ceil(22, 27, 6); r.fill(8, 2, 8, 3); r.fill(21, 2, 21, 3)
r.step(9, 20, 14); r.step(11, 18, 12)  # постамент сходинками 1 + 2
r.climb(CLIMB[1:])  # з постаменту — одразу на другу дошку
r.put(14, 11, 'C'); r.put(4, 14, 'b'); r.put(25, 14, 'b'); r.put(10, 13, 'b')
rooms.append(r)

r = Room('treasure_nook', 'treasure', 'LRD')
r.ceil(2, 27, 6); r.fill(9, 7, 20, 7)
r.step(3, 8, 13); r.step(21, 26, 13)    # бічні уступи на 2 рядки, скриня на лівому
r.put(5, 12, 'C'); r.put(24, 12, 'b'); r.put(10, 14, 'b'); r.put(19, 14, 'b')
rooms.append(r)

# ---------- бойові ----------
r = Room('combat_hall', 'combat', 'LR')
r.ceil(2, 27, 4); r.fill(2, 5, 6, 6); r.fill(11, 5, 18, 5); r.fill(23, 5, 27, 7)
r.plank(12, 17, 12)  # одна платформа посередині (під нею лицар проходить)
r.put(5, 14, 'e'); r.put(10, 14, 'e'); r.put(19, 14, 'e'); r.put(24, 14, 'e'); r.put(14, 8, 'f'); r.put(7, 9, 'f')
rooms.append(r)

r = Room('combat_bridge', 'combat', 'LR')
r.ceil(2, 27, 4); r.fill(2, 5, 5, 6); r.fill(24, 5, 27, 6); r.fill(11, 5, 18, 5)
r.step(5, 7, 13); r.step(8, 11, 12)     # сходинки 2 + 1 до краю ями
r.step(18, 21, 12); r.step(22, 24, 13)
r.plank(12, 17, 12)                     # місток над ямою глибиною 3 (з ями — стрибок на край)
r.put(9, 11, 'e'); r.put(20, 11, 'e'); r.put(14, 14, 'e'); r.put(26, 14, 'e'); r.put(15, 8, 'f')
rooms.append(r)

r = Room('combat_steps', 'combat', 'LRU')
r.ceil(2, 7, 5); r.ceil(22, 27, 5); r.fill(8, 2, 9, 3); r.fill(20, 2, 21, 3)
r.step(6, 23, 13); r.step(10, 19, 12)  # пологий пагорб: сходинки на 2 і на 1 рядок
r.climb(CLIMB[1:])  # з вершини пагорба
r.put(4, 14, 'e'); r.put(8, 12, 'e'); r.put(14, 11, 'e'); r.put(21, 12, 'e'); r.put(25, 14, 'e'); r.put(23, 8, 'f')
rooms.append(r)

r = Room('combat_shaft', 'combat', 'LRUD')
r.ceil(2, 8, 7); r.ceil(21, 27, 7); r.fill(9, 2, 9, 4); r.fill(20, 2, 20, 4)
r.climb()
r.put(5, 14, 'e'); r.put(11, 14, 'e'); r.put(18, 14, 'e'); r.put(24, 14, 'e'); r.put(17, 6, 'f')
rooms.append(r)

r = Room('combat_valley', 'combat', 'LRD')
r.ceil(2, 27, 4); r.fill(2, 5, 9, 6); r.fill(20, 5, 27, 6)
r.step(4, 10, 13); r.step(19, 25, 13)  # низина посередині, береги на 2 рядки
r.put(6, 12, 'e'); r.put(12, 14, 'e'); r.put(17, 14, 'e'); r.put(23, 12, 'e'); r.put(15, 8, 'f')
rooms.append(r)

r = Room('combat_pillar', 'combat', 'LRUD')
r.ceil(2, 8, 4); r.ceil(21, 27, 4)
r.fill(5, 5, 7, 8); r.fill(22, 5, 24, 8)  # кам'яні колони зі стелі, під ними — прохід
r.climb()
r.put(6, 14, 'e'); r.put(11, 14, 'e'); r.put(18, 14, 'e'); r.put(23, 14, 'e'); r.put(17, 6, 'f')
rooms.append(r)

r = Room('combat_cavern', 'combat', 'LR')
r.ceil(2, 27, 2); r.fill(2, 3, 6, 5); r.fill(12, 3, 17, 6); r.fill(23, 3, 27, 4)
r.step(10, 13, 13)  # один камінь-виступ на 2 рядки
r.put(5, 14, 'e'); r.put(11, 12, 'e'); r.put(17, 14, 'e'); r.put(21, 14, 'e'); r.put(25, 14, 'e'); r.put(8, 9, 'f'); r.put(20, 7, 'f')
rooms.append(r)

r = Room('combat_gallery', 'combat', 'LRU')
r.ceil(2, 8, 5); r.ceil(21, 27, 4)
r.fill(19, 9, 27, 10)  # кам'яний балкон праворуч, під ним — прохід до виходу
r.plank(14, 17, 12)    # сходинка на балкон
r.climb([(14, 17, 6), (13, 16, 3)])  # з балкона до отвору — дві дошки
r.put(5, 14, 'e'); r.put(10, 14, 'e'); r.put(24, 14, 'e'); r.put(23, 8, 'e'); r.put(11, 8, 'f')
rooms.append(r)

r = Room('combat_drop', 'combat', 'LRD')
r.ceil(2, 27, 5); r.fill(2, 6, 12, 7); r.fill(21, 6, 27, 6)
r.step(4, 12, 13)      # тераса ліворуч, далі уступ униз на 2 рядки
r.put(7, 12, 'e'); r.put(11, 12, 'e'); r.put(17, 14, 'e'); r.put(22, 14, 'e'); r.put(19, 9, 'f')
rooms.append(r)

r = Room('combat_corridor', 'combat', 'LRUD')
r.ceil(2, 8, 8); r.ceil(21, 27, 8); r.fill(9, 2, 9, 4); r.fill(20, 2, 20, 4)
r.climb()
r.put(5, 14, 'e'); r.put(8, 14, 'e'); r.put(21, 14, 'e'); r.put(24, 14, 'e')
rooms.append(r)

# вертикальний «колодязь» лише UD — для вертикальних з'єднань
r = Room('shaft_ud', 'combat', 'UD')
r.fill(2, 2, 8, 14); r.fill(21, 2, 27, 14)
r.climb()
r.put(19, 14, 'e'); r.put(17, 6, 'f')
rooms.append(r)

out = [x.out() for x in rooms]
for o in out:
    assert len(o['rows']) == H, o['id']
    assert all(len(row) == W for row in o['rows']), o['id']
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    json.dump(out, f, indent=1, ensure_ascii=False)
    f.write('\n')
for o in out:
    print(o['id'], o['type'], o['exits']); print('\n'.join(o['rows'])); print()
