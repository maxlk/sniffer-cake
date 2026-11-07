# Нюхач: выкройки для печати

Одностраничное приложение без сервера: создаёт PDF с узорами Нюхача (Sniffer) из Minecraft, которые можно вырезать и наклеить на объёмную модель.
Откройте `sniffer-cake-v<версия>.html` в браузере, интернет не нужен.

Четыре узора, размеры в пикселях текстуры: спина 25×40, бок 40×20, красная шерсть 40×12, голова 31×32 (развёртка пяти граней морды, углы залиты тем же узором).

## Для разработки

```sh
npm install
npm test
npm run convert   # assets/sniffer.png -> SVG
npm run font      # контуры PT Sans -> src/glyphs.json
npm run build     # создаёт sniffer-cake-v<VERSION>.html
```

Новая версия: увеличьте номер в файле `VERSION`. Сборка откажется перезаписывать уже существующий файл.

## Источники и лицензии

- `assets/sniffer.png`: из официального клиента Minecraft 26.3, © Mojang. Неофициальный проект, не связан с Mojang и Microsoft.
- Шрифт подписей: PT Sans, © ParaType, SIL Open Font License 1.1, см. `licenses/PT-Sans-OFL.txt`.
