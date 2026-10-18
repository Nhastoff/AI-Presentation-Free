# Публичный API установленного PowerPoint

18 октября 2026 года извлечён полный каталог опубликованной COM-библиотеки `MSPPT.OLB` установленного Office12. Это дополнительные статические метаданные, **не Evidence Ghidra/REA**. Они полезны как проверяемый список объектов и операций для совместимого редактора.

Источник: `C:\Program Files (x86)\Microsoft Office\Office12\MSPPT.OLB`, 263 504 байта. SHA-256: `1949fd78f97f8e9e5b40caa012f7618d1035db2b2528922cebf6f8f000f44845`.

Библиотека `PowerPoint`, версия типовой библиотеки **2.9**, GUID `91493440-5a91-11cf-8700-00aa0060263b`, платформа `SYS_WIN32`. Версия 2.9 относится к COM-контракту, а не версии продукта.

| Объекты каталога | Число |
|---|---:|
| Все описания типов | 219 |
| Dispatch-интерфейсы | 131 |
| Остальные интерфейсы | 7 |
| COM-классы | 7 |
| Перечисления | 74 |
| Строки функций и свойств, включая повторяющиеся базовые COM-методы | 3 122 |
| Вызовы функций `INVOKE_FUNC` | 1 410 |
| Чтение свойств | 1 253 |
| Запись свойств | 459 |
| Уникальные имена членов внутри каждого типа, суммарно | 2 665 |
| Константы перечислений | 858 |

Геттер и сеттер одного свойства — отдельные строки. Базовые `QueryInterface`, `AddRef`, `Release`, `GetTypeInfoCount`, `GetTypeInfo`, `GetIDsOfNames`, `Invoke` повторяются в разных интерфейсах. Поэтому 3 122 — не число пользовательских команд или уникальных возможностей.

| Область | Опубликованные типы и примеры операций |
|---|---|
| Документы и файлы | `_Application`, `Presentations`, `_Presentation`; `Save`, `SaveAs`, `SaveCopyAs`, `Export`, `ExportAsFixedFormat`, `Convert`, `PrintOut` |
| Слайды и оформление | `Slides`, `_Slide`, `SlideRange`, `Designs`, `CustomLayouts`, `_Master`; `Add`, `AddSlide`, `InsertFromFile`, `ApplyTemplate`, `ApplyTheme` |
| Объекты на слайде | `Shapes`, `Shape`, `ShapeRange`, `GroupShapes`; `AddPicture`, `AddShape`, `AddTextbox`, `AddChart`, `AddTable`, `AddMediaObject`, `AddOLEObject` |
| Текст | `TextRange`, `TextFrame`, `TextFrame2`, `Font`, `ParagraphFormat`, `BulletFormat`, `Ruler`; поиск, замена, диапазоны, форматирование |
| Геометрия и стили | `FillFormat`, `LineFormat`, `ShadowFormat`, `ThreeDFormat`, `PictureFormat`, `ConnectorFormat`, `FreeformBuilder`, `ShapeNodes` |
| Анимация | `TimeLine`, `Sequence`, `Effect`, `Timing`, `AnimationBehavior`; `AddEffect`, `Clone`, эффекты движения, цвета, масштаба и вращения |
| Показ | `SlideShowSettings`, `SlideShowView`, `NamedSlideShows`, `SlideShowTransition`; `Run`, `First`, `Last`, `Next`, `Previous`, `GotoSlide`, `GotoClick`, `Exit` |
| Таблицы | `Table`, `Rows`, `Columns`, `Cell`, `CellRange`, `Borders`, `TableStyle`, `TableBackground` |
| Окна и выделение | `DocumentWindow`, `DocumentWindows`, `Selection`, `View`, `Panes`, `Pane` |
| Дополнительные операции | `Comments`, `Hyperlinks`, `Tags`, `CustomerData`, `AddIns`, `Research`, `WebOptions`, `PublishObjects`, `PrintOptions` |
| События | `EApplication`: 24 описания событий, включая открытие, сохранение, смену выделения и этапы показа |

Полная выгрузка: [powerpoint-public-api.json](../research/ppcore-complete/powerpoint-public-api.json). В ней сохранены все типы, GUID, связи реализуемых интерфейсов, имена функций/свойств, DISPID, вид вызова, параметры, флаги, вложенные описания VARTYPE и значения констант. Воспроизводимый скрипт: [dump-powerpoint-api.ps1](../research/ppcore-complete/dump-powerpoint-api.ps1).

Извлечение вызывает `LoadTypeLibEx(REGKIND_NONE)` и читает `ITypeLib`/`ITypeInfo`. PowerPoint не запускается, классы приложения не активируются, регистрация библиотеки не выполняется. Для `VT_PTR` и `VT_SAFEARRAY` раскрывается тип элемента. Для `VT_CARRAY` предусмотрены тип элемента, число измерений и границы. Для `VT_USERDEFINED` через `GetRefTypeInfo` разрешаются имя, GUID, вид типа и библиотека; для псевдонимов раскрывается базовый тип. Сохраняются исходный VARTYPE, его числовое значение и флаги.

При проверке выгрузки все **10 229 узлов описания типов** имеют `resolution_status: resolved`; среди них 2 585 указателей, 1 SAFEARRAY и 1 972 ссылки на именованные типы, включая 9 ссылок на псевдонимы с раскрытым базовым типом. CARRAY в этих сигнатурах не встретились, поэтому их обработка не подтверждена данным источником. Например, `Shapes.AddShape` возвращает указатель на `PowerPoint.Shape`, а параметр `Type` имеет тип `Office.MsoAutoShapeType`.

Ограничения раскрытия заданы явно: глубина вложенности 12, максимум 32 измерения массива; превышение или ошибка записываются отдельным статусом и сообщением. Значения параметров по умолчанию и полные определения типов внешних библиотек не извлечены. Имена внешних типов разрешены, но это не означает выгрузку всего Office API.

Каталог доказывает наличие опубликованного контракта в конкретной установленной сборке. Он не раскрывает частные реализации движка, координаты кнопок ленты, весь скрытый функционал или фактическое поведение во время исполнения. Равенство поведения будущего приложения необходимо проверять отдельно на сценариях и документах.
