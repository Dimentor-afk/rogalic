/**
 * Побудова імен кадрів з шаблону.
 *  $1..$9 — групи регулярки (для kind: 'frames')
 *  {i}    — порядковий номер кадру (для 'strip' і 'cells')
 * Результат приводимо до нижнього регістру і замінюємо пробіли на «_»,
 * щоб у коді гри всі імена кадрів мали одну конвенцію: "player/sword/d0/idle/0".
 */
export function frameName(template: string, groups: readonly string[] = [], i?: number): string {
  let s = template.replace(/\$(\d)/g, (_, n: string) => {
    if (Number(n) >= groups.length) throw new Error(`Шаблон "${template}": немає групи $${n}`);
    // необов'язкова група регулярки, що не збіглася, — порожній рядок
    return groups[Number(n)] ?? '';
  });
  if (i !== undefined) s = s.replace(/\{i\}/g, String(i));
  return s.toLowerCase().replace(/\s+/g, '_');
}
