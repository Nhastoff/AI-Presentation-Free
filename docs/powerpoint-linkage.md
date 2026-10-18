# PPCORE.DLL: статические связи модулей

Дополнительный офлайн-разбор PE import/export tables; приложение не запускалось. Поля таблиц наблюдены непосредственно в байтах выбранного DLL. Группировка подсистем ниже — вывод из имён импортов, не результат выполнения, декомпиляции функций или доказательство полной реализации возможности. Эти результаты не являются самостоятельной записью REA Evidence.

Источник: `C:\Program Files (x86)\Microsoft Office\Office12\PPCORE.DLL`; SHA-256 `41ac194cf36becccd0fe64343377be5932060317ad9b83cdbeea77a06de284b5`. Архитектура x86; предпочтительный ImageBase `0x30100000`.

**Наблюдено:** 7 прямых импортируемых DLL / 3 107 слотов; 11 delay-import DLL / 1 721 слот. Всего 18 DLL и 4 828 импортов. Три экспортных слота, три имени; один экспорт перенаправлен в MSO. Подсчёт относится к слотам таблиц, не к числу вызовов или функций всего движка.

## Полный перечень импортируемых DLL

| DLL | Связь | Импортов | По ordinal | Примеры буквальных имён / ordinal |
|---|---|---:|---:|---|
| MSVCR80.dll | прямая | 65 | 0 | _wcsicmp, ?_type_info_dtor_internal_method@type_info@@QAEXXZ, __clean_type_info_names_internal, _crt_debugger_hook, _except_handler4_common |
| KERNEL32.dll | прямая | 129 | 0 | QueryPerformanceFrequency, QueryPerformanceCounter, SetProcessWorkingSetSize, GetCurrentProcess, GetDateFormatW |
| GDI32.dll | прямая | 111 | 0 | StretchBlt, GetClipBox, CreateFontIndirectW, SetDIBColorTable, SetLayout |
| USER32.dll | прямая | 184 | 0 | KillTimer, SetWindowPos, FindWindowW, SetTimer, GetMonitorInfoW |
| ADVAPI32.dll | прямая | 12 | 0 | RegOpenKeyA, RegCreateKeyExW, RegCloseKey, RegQueryValueExW, RegSetValueExW |
| ole32.dll | прямая | 84 | 0 | CoCreateInstance, DoDragDrop, OleDestroyMenuDescriptor, OleCreateMenuDescriptor, OleTranslateAccelerator |
| oart.dll | прямая | 2522 | 2522 | #1010, #3780, #3782, #3781, #3778 |
| msptls.dll | отложенная | 13 | 13 | #104, #107, #1, #85, #83 |
| MSO.dll | отложенная | 1629 | 1629 | #6848, #6889, #1555, #1503, #1703 |
| MSACM32.dll | отложенная | 2 | 0 | acmMetrics, acmFormatChooseW |
| OLEAUT32.dll | отложенная | 37 | 37 | #200, #25, #2, #9, #6 |
| SHELL32.dll | отложенная | 2 | 0 | SHGetMalloc, SHGetFolderLocation |
| SHLWAPI.dll | отложенная | 1 | 0 | StrRetToBufW |
| AVIFIL32.dll | отложенная | 8 | 0 | AVIStreamGetFrame, AVIStreamRelease, AVIStreamInfoW, AVIStreamOpenFromFileW, AVIFileExit |
| WINMM.dll | отложенная | 23 | 0 | mixerGetLineInfoW, mmioClose, mmioOpenW, sndPlaySoundW, waveInGetDevCapsW |
| DDRAW.dll | отложенная | 1 | 0 | DirectDrawCreate |
| t2embed.dll | отложенная | 3 | 0 | TTLoadEmbeddedFont, TTGetEmbeddingType, TTDeleteEmbeddedFont |
| CRYPT32.dll | отложенная | 2 | 0 | CryptUnprotectData, CryptProtectData |

## Экспорты

| Ordinal | Имя | RVA | Предпочтительный VA / перенаправление |
|---:|---|---|---|
| 1 | DllGetLCID | `0x82fba` | `MSO.DllGetLCID` |
| 2 | _PPMain@0 | `0x5928` | `0x30105928` |
| 3 | _ShowSplashScreen@0 | `0x4ccd` | `0x30104ccd` |

VA рассчитан для предпочтительной базы. Фактическая загрузка может использовать другой адрес. Наличие `_PPMain@0` и `_ShowSplashScreen@0` устанавливает имена экспортов и адреса, но само по себе не доказывает семантику их тела.

## Выводы о границах подсистем

| Вывод из имён | Наблюдённые библиотеки и имена | Предел вывода |
|---|---|---|
| Оконная оболочка и события | USER32: SetWindowPos, DispatchMessageA, GetWindowRect | Не устанавливает структуру ленты и размещение команд. |
| Растровое рисование и шрифты | GDI32: StretchBlt, CreateDIBSection, CreateFontIndirectW | Не восстанавливает алгоритм рендера слайдов. |
| COM/OLE и внедрение объектов | ole32: CoCreateInstance, DoDragDrop, OleSaveToStream; OLEAUT32 по ordinal | Не раскрывает все COM-интерфейсы или формат документа. |
| Мультимедиа | WINMM: waveInOpen, mciSendCommandW; AVIFIL32: AVIStreamOpenFromFileW; MSACM32: acmFormatChooseW; DDRAW: DirectDrawCreate | Наличие статических связей не подтверждает, что эти API вызываются в выбранном сценарии. |
| Внедрение шрифтов | t2embed: TTLoadEmbeddedFont, TTGetEmbeddingType, TTDeleteEmbeddedFont | Не раскрывает правила лицензирования или полный поток сохранения. |
| Файлы, ресурсы, оболочка и настройки | KERNEL32, SHELL32, SHLWAPI, ADVAPI32 | Не доказывает поведение конкретной команды интерфейса. |
| Защита пользовательских данных | CRYPT32: CryptProtectData, CryptUnprotectData | Не доказывает шифрование PPT/PPTX или алгоритм пароля презентации. |
| Крупные внешние зависимости Office | oart.dll: 2 522 ordinal-импорта; MSO.dll: 1 629 ordinal-импортов; msptls.dll: 13 ordinal-импортов | Семантика ordinal неизвестна без отдельного анализа точных версий этих DLL. PPCORE не является замкнутым описанием всех функций продукта. |

MSVCR80.dll содержит связь с библиотекой выполнения C/C++: это инфраструктура исполнения, а не отдельная пользовательская возможность.

## Проверка и воспроизведение

Скрипт `research/ppcore-complete/extract-linkage.py` читает только DLL. Проверены целевой SHA, сигнатуры, границы заголовков, таблицы секций, отсутствие пересечения секций, отображение RVA в файловые диапазоны и завершённость строк/таблиц. Таблицы имён экспортов проверяются на допустимые индексы ordinal.

Все 4 828 имён/ordinal и IAT RVA, а также три экспорта независимо сопоставлены с полным парсером установленного pefile. Стандартный предохранитель pefile на 8 192 промежуточных импортных операции прерывал delay-разбор; локально в процессе проверки лимит повышен до 100 000. Итоговая проверка pefile не выдала предупреждений. Синтетические имена, которые pefile подставляет для известных ordinal, исключены: JSON сохраняет буквальный ordinal из бинарника. Никакие настройки системы не менялись.

Воспроизведение из корня: `python research/ppcore-complete/extract-linkage.py`; отчёт: `python research/ppcore-complete/report-linkage.py`. Полные записи DLL/function/ordinal/IAT RVA и экспортов находятся в `research/ppcore-complete/pe-linkage.json`.

Формат разобран по первичной спецификации Microsoft [PE Format](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format).

## Дополнение: привязка ordinal к найденным зависимостям

Проверены только четыре явно заданные папки: `Program Files` и `Program Files (x86)`, в каждой `Microsoft Office/Office12` и `Common Files/Microsoft Shared/OFFICE12`. Для каждой DLL найден один кандидат. Это разрешение кандидатов по файловой системе, не наблюдение фактического выбора Windows loader. Другие каталоги, манифесты и политики загрузки не исследовались.

| DLL | Версия | Экспортных слотов / имён | Сопоставленные импорты PPCORE | С именем экспорта |
|---|---|---:|---:|---:|
| oart.dll | 12.0.4518.1014 | 6492 / 14 | 2522 / 2522 | 0 |
| MSO.dll | 12.0.4518.1014 | 13341 / 154 | 1629 / 1629 | 79 |

- `C:\Program Files (x86)\Microsoft Office\Office12\oart.dll` — SHA-256 `1f739ee0f05dd8a902febe4ea19da2f535567b36e6f8fd55befbefb120341fa2`.
- `C:\Program Files (x86)\Common Files\Microsoft Shared\OFFICE12\MSO.dll` — SHA-256 `8c20c23e968553a501edcb78d4c61e8d45febc0dee34eef53b00a7cbd43c29af`.

Все 4 151 импортных слота PPCORE, направленных в эти две DLL, имеют соответствующий непустой экспорт в выбранных кандидатах. Из них только 79 сопоставлены с буквальными именами экспортов MSO; у всех 2 522 импортируемых ordinal oart.dll имён нет. Полная таблица ordinal → RVA сохранена; анонимные функции не получают придуманных названий.

Примеры наблюдённых имён MSO: ordinal 6330 → `_MsoFRegReadWz@12`; 1378 → `_MsoGetUILcid@0`; 1455 → `_MsoDwRegGetDw@4`. Эти имена подсказывают возможные роли, но тела зависимостей не декомпилировались.

Экспорты обоих DLL прочитаны с проверкой границ и независимо сопоставлены с pefile. Защитные пределы числа экспортов и повторов одинакового RVA в экземпляре pefile повышены до размера уже проверенной таблицы + 1: oart и MSO содержат много ordinal с одинаковой целью. После проверки предупреждений pefile нет. Это не изменение настроек системы.

Данные и воспроизведение: `research/ppcore-complete/dependency-bindings.json`; `python research/ppcore-complete/resolve-dependencies.py`, затем `python research/ppcore-complete/report-linkage.py`.
