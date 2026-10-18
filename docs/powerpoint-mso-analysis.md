# MSO Office 12: commands and shared ribbon

Target: `C:/Program Files (x86)/Common Files/Microsoft Shared/OFFICE12/MSO.dll`, version **12.0.4518.1014**, SHA-256 `8c20c23e968553a501edcb78d4c61e8d45febc0dee34eef53b00a7cbd43c29af`. This is the installed Office 2007 shared library, not the current Microsoft 365 implementation. No target application was executed during these inspections.

## Recovered command lookup data

Supplementary read-only PE parsing found two adjacent lookup tables, each with **4,353 entries**. The first uses `(command_id, name_pointer)` at file offsets `0xe558d0..0xe5e0d8` (exclusive end); the second uses `(name_pointer, command_id)` at `0xe5e0d8..0xe668e0`. The first is strictly sorted by numeric ID, the second by identifier. Their sets agree on **all 4,353 pairs**. Every pointer was checked against file-backed PE sections; every referenced identifier is a null-terminated ASCII token. Reproduce with `python research/mso-analysis/decode-command-map.py`.

The independent ordering and complete agreement support these static ID/name associations. They do not establish application-specific availability, runtime enabled state, callbacks, or ribbon positions. The tables include Word, Excel, Access, Outlook and shared commands.

| Family | Exact identifiers and numeric IDs |
|---|---|
| Tabs | TabHome 11954; TabInsert 11536; TabDesign 11576; TabAnimations 11577; TabSlideShow 11578; TabReview 11601; TabView 11541 |
| Home groups | GroupClipboard 12597; GroupSlides 11579; GroupFont 11543; GroupParagraph 11544; GroupDrawing 204; GroupEditing 12580 |
| Clipboard | Copy 19; Cut 21; Paste 22; FormatPainter 108 |
| Slides | SlideNew 680; SlideHide 729; SlideLayoutGallery 11526 |
| Grouping | ObjectsGroup 164; ObjectsUngroup 165; ObjectsRegroup 338 |
| Ordering | ObjectBringToFront 166; ObjectSendToBack 167; ObjectBringForward 170; ObjectSendBackward 171 |
| Align | ObjectsAlignLeft 664; ObjectsAlignRight 665; ObjectsAlignTop 666; ObjectsAlignBottom 667; ObjectsAlignCenterHorizontal 668; ObjectsAlignMiddleVertical 669 |
| Distribute | AlignDistributeHorizontally 12790; AlignDistributeVertically 12791 |
| Transform | ObjectFlipHorizontal 196; ObjectFlipVertical 197; ObjectRotateRight90 198; ObjectRotateLeft90 199 |
| Editing and insert | SelectionPane 13244; ReplaceDialog 313; SelectAll 756; HeaderFooterInsert 762; HyperlinkInsert 1576; HyperlinkInsertPowerPoint 4885 |
| Shape styling | ShapeFillColorPicker 11689; OutlineColorPicker 11690; ShapeOutlineColorPicker 15293 |

These group names identify possible families. **Table order is lookup order, not display order.** Home group placement in AI Presentation Free is an independent UI design choice informed by the existing PowerPoint-style layout, not a recovered coordinate map.

## Published command and ribbon contract

The embedded TYPELIB was read through `LoadTypeLibEx(REGKIND_NONE)` and `ITypeLib/ITypeInfo`: **442 types, 5,112 function/property rows, 2,456 constant/variable rows**. This reads metadata without registering the library or activating PowerPoint. Full data is `research/mso-analysis/mso-public-api.json`; a focused subset is `ribbon-contract.json`.

- `_CommandBars`, GUID `000c0302-0000-0000-c000-000000000046`, exposes `ExecuteMso(idMso)` and independent queries `GetEnabledMso`, `GetVisibleMso`, `GetPressedMso`, `GetLabelMso`, `GetScreentipMso`, `GetSupertipMso`, `GetImageMso`. Their DISPIDs are 1610809373 through 1610809380.
- `IRibbonUI`, GUID `000c03a7-0000-0000-c000-000000000046`: `Invalidate()` DISPID 1 and `InvalidateControl(ControlID)` DISPID 2.
- `IRibbonControl`, GUID `000c0395-0000-0000-c000-000000000046`: `Id` DISPID 1, `Context` DISPID 2, `Tag` DISPID 3.
- `IRibbonExtensibility`, GUID `000c0396-0000-0000-c000-000000000046`: `GetCustomUI(RibbonID)` DISPID 1.

This supports separating command execution, command state, and ribbon rendering in a compatible independent application. It is a contract observation, not proof of private MSO dispatch internals or supported add-in execution in AI Presentation Free.

## Resources and layout evidence

REA PE resource Evidence `ev_0efd0f941402e68a15d303a6e8681c947cc7c17919069dac989f6a0b5889a291` inventories **45 resources**, including one TYPELIB, a `BETA1_TO_BETA2.XSLT` HTML resource, and opaque numeric resource types 217, 257 and 258. All source/payload hashes are preserved in `research/mso-analysis/resources.json`.

Read-only literal scans preserve raw offsets in `resource-metadata.json`. Observed identifiers include `RibbonTab`, `RibbonSection`, `RibbonLayout`, `RibbonButton`, `OfficeSpaceUpperRibbonLayout`, `InRibbonWhenChunkSizeGTE`, `InRibbonMinItemsLarge`, `InRibbonMaxItemsMedium`, `InRibbonItemsWidth` and `InRibbonItemsHeight`. These are evidence of named layout machinery and size-dependent gallery properties; their behavior remains inferred until code/runtime corroboration. They do **not** establish fixed positions.

The literal scan finds shared `customUI` schema/relationship names and `enabled`, `visible`, `label`, `tooltip`, `supertip`, `description`, `pressed`, `text`, `buttonSize`, `showImage`, `showLabel`, `imageMso`, `keyTip` property paths. A literal scan is not a complete UIFILE/XML schema decoder.

A further bounded decoder recovered **217 consecutive string-pool records** at file offsets `5374712..5378198`, containing the exact `OfficeSpaceUpperRibbonLayout` anchor. The observed record form is marker `0x01`, little-endian 16-bit byte length, then ASCII bytes. Selected records and offsets are in `netui-string-pool.json`; the decoder is `decode-netui-string-pool.py`. This removes substring/concatenation ambiguity for these selected records, but does not decode node references, hierarchy, numeric properties, command bindings or geometry. `OrderedGroup`, `GroupWidth`, `GroupOffset` and `OfficeSpaceAdaptiveLayoutHandler` are literal names, not recovered layout algorithms.

## Native analysis status

**Ghidra default autoanalysis completed in 702 seconds**, within the isolated job's 30-minute startup budget and 3 GiB heap. It reported **68,111 procedures and 41,722 defined strings**. Overview Evidence: `ev_d0d2c6a6f3108f102f784f22eb45de94d5096d85a839030a9c9a8c463e06da30`.

Ten selected functions have complete retained dossiers, including pseudocode, assembly, inclusive body ranges, CFG blocks and observed references. These are a focused investigation of entry points, not decompilation of all 68,111 procedures. Machine-readable summaries are in `research/mso-analysis/native-summary.json`; the full retained record set is `evidence-bundle.json`, with an exact-target `analysis-snapshot.json`. The owned native session was closed successfully.

| Entry point | Static observation from pseudocode | Evidence ID |
|---|---|---|
| `_MsoFCreateToolbarSet@28`, `0x3263ad74` | Allocates `0x22c` bytes, constructs/initializes the object, writes the output pointer on success, and invokes virtual slot `+0x1b0` on an initialization failure. This is lifecycle machinery, not a built-in command list. | `ev_042ea82e1bfcb1477a59f1d91d89c392f67c75fd48e01f0cd55f0975e2c616b1` |
| `_MsoFLoadToolbarSet@24`, `0x326693a2` | Forwards six arguments to `FUN_3264538a` with an additional final value `1`. The deeper helper's serialization format remains unresolved. | `ev_16c3184f55fab1fca68d146ee8538575b192b95a2823981316c2155e335030f0` |
| `_MsoFCreateControl@36`, `0x326428b2` | Rejects one flag/argument combination (`0x400000` and nonzero argument), calls factory `FUN_32642926`, initializes through virtual slot `+0xfc`, releases through `+0xf8` on failure, and conditionally sets flag `0x400` at object offset `+0xe`. | `ev_34a02954a801c9fa202dc70dfb343f19b2f52fc8ae97c8f432b9ca796dbc38ad` |
| `_MsoFActivateControl@4`, `0x32f1036b` | Obtains another interface through virtual calls, enumerates controls, compares object identity, tests `FUN_326e1069`, then invokes virtual slot `+0x44` with the matched index and value `0xc`. The exact interface identities and value meaning are not established. | `ev_2f68c2f1c50e7bdefd385a8c4aa9e338afba564a02e6713d664207d1eb17980c` |
| `_MsoGetToolbarMetrics@4`, `0x33270b65` | Calls `FUN_3263c10b`, then copies **11 four-byte values** from `DAT_3342ad98` when the destination is non-null. Their field names and runtime DPI values remain unknown. | `ev_a3f11c227157589978146e09bea66ba46d453405af39eb02386bac7a5286b705` |
| `_MsoFHandledMessageNeeded@4`, `0x3261b7ee` | Returns true only for numeric messages `0x201`, `0x106`, `0x7b`, `0x104` and `0x20a`. | `ev_a4c0493456bacd584e83e4be4b47a4eb1bd7a2734dd3af56421261cd58ca99a1` |
| `_MsoFWndProc@24`, `0x326408a9` | Among many branches, message `0x111` reaches guarded state tests at a helper object offset `+0x1c0`, then invokes the supplied object's virtual slot `+0x7c` with object, window, message and message parameters. The private PowerPoint recipient is unresolved. | `ev_35e8411f24b7c865a94a51ca5c45146c78c051a3b5d7852ea581b3b3cb483086` |
| `_MsoFWndProcNeeded@4`, `0x3261614f` | Returns true only when `DAT_33428180 > 0` and `FUN_3263f911(argument)` succeeds. | `ev_5b4dac3bfe0a1c538ee3efb7d9b09eeb2f4c10a996bd3ec2d03faff9daa17777` |
| `MsoMakeCustomItem`, `0x3270ae5a` | Validates the output pointer, allocates `0x74` bytes and calls `FUN_3270af16`; returns HRESULT-shaped success/pointer/allocation outcomes. This does not establish a complete add-in object contract. | `ev_5d0e4688f067f8c11949885d45e14343eaecca373171d493ed3187c16f7bd2bf` |
| `_MsoFGetButtonSize@0`, `0x3263b22e` | Returns whether global `DAT_3342a634` is nonzero. Despite its name, this entry point alone does **not** return button pixel dimensions. | `ev_e5795561e8340994ad900621b5dd727b45e19ad894d60e4c7f69dc12e4d17ab1` |

The window-procedure dossier exceeded the MCP response budget, but its analysis **completed** and its entire Evidence was retained. The complete exported record was recovered to `window-procedure-complete.json`. It contains 3,039 body bytes across 18 inclusive ranges, 212 CFG blocks, 72 resolved callees and 12 unresolved calls. Its pseudocode has 27,778 characters. Three Ghidra terminal-call observations exclude fallthrough at calls to `FUN_327af518`; their reason is unknown, so control-flow completeness beyond Ghidra's analyzed body is not claimed.

Several other procedures also have noncontiguous body ranges, and indirect calls leave partial call relationships. The exporter preserves these limitations; the enclosing address span must not be treated as continuous function bytes. Static analysis did not observe button clicks or application execution.

## What remains unresolved

- The virtual `+0x7c` command-forwarding recipient and the route from `ExecuteMso`/the numeric lookup table to each private PowerPoint handler.
- Internal implementations of ribbon invalidation, callback state caching and dynamic enable/visible/pressed updates; the published contracts are recovered, but their native methods were not individually decompiled here.
- Complete clipboard format negotiation, Paste Special behavior and undo transaction boundaries. The shared API and command IDs are present; implementation parity is not established.
- PowerPoint-specific ribbon hierarchy, group priorities, button coordinates, and responsive collapse rules. Shared layout names and a metrics-copy function cannot establish those facts.

The next targeted native pass should follow the resolved factory/loader helpers and identify the concrete object behind the window-procedure virtual slots, then correlate that object with PPCORE command handlers. The present evidence supports an independently written command/state registry and toolbar lifecycle, while leaving those private semantics explicit.

No Microsoft icons, implementation code, binary UI payloads or proprietary assets have been copied into AI Presentation Free. Only factual identifiers and independently implemented behavior are appropriate for its command coverage registry.
