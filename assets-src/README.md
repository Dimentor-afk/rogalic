# assets-src — сирі паки асетів

Сюди розпаковуються паки спрайтів **як є** (кожен у свою теку). Вміст теки, крім цього файлу, **не комітиться**
(див. `.gitignore`): ліцензії паків забороняють поширювати асети окремо від гри. У репозиторій ідуть
лише запаковані атласи в `public/assets/` — вони частина гри.

Після зміни паків або `tools/pack.config.json`:

```bash
npm run pack
```

## Очікувані теки

Імена тек задані в `tools/pack.config.json` → `packs`. Обгортки на кшталт `Pack/Pack/...` скрипт пропускає сам.

| Аліас у конфігу | Тека |
|---|---|
| `roguelike` | `Roguelike Dungeon - Asset Bundle` |
| `caves` | `PixelFantasy_Caves_1.0` |
| `dummy` | `Training Dummy 2D Pixel Art` |
| `golems` | `Golems_Free_Version` |
| `flydemon` | `Flying Demon 2D Pixel Art` |
| `cat` | `FREE_Cat 2D Pixel Art` |
| `spider` | `TheForest_GiantSpider_v2` |
| `tiny` | `Tiny RPG Character Asset Pack 02 v1.01-Free Demon_A&Blood Monster_A` |
| `archdemon` | `DuskBorne-ArchDemon` |
| `blacksmith` | `FREE - Blacksmith 2D Pixel Art` |
| `fx` | `Super Pixel Effects Gigapack (Free Version) v2.9.0` |
| `magic` | `Foozle_2DE0001_Pixel_Magic_Effects` |

Автори і ліцензії паків — у кореневому `README.md`, розділ «Асети і ліцензії».
