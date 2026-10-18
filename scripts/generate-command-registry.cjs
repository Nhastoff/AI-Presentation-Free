const fs = require('node:fs');
const source = JSON.parse(fs.readFileSync('research/mso-analysis/command-id-map.json', 'utf8'));
const byName = new Map(source.verified_mapping.map(row => [row.id_mso, row.command_id]));
const commands = {
  new: 'FileNew', open: 'FileOpen', 'save-json': 'FileSave', export: 'FileSaveAsPowerPointPptx',
  copy: 'Copy', cut: 'Cut', paste: 'Paste', add: 'SlideNew', bold: 'Bold', italic: 'Italic', underline: 'Underline', undo: 'Undo', redo: 'Redo',
  find: 'FindDialog', replace: 'ReplaceDialog', 'select-all': 'SelectAll', group: 'ObjectsGroup', ungroup: 'ObjectsUngroup', regroup: 'ObjectsRegroup',
  'format-painter': 'FormatPainter', 'bring-forward': 'ObjectBringForward', 'send-backward': 'ObjectSendBackward',
  'object-align-left': 'ObjectsAlignLeft', 'object-align-center': 'ObjectsAlignCenterHorizontal', 'object-align-right': 'ObjectsAlignRight',
  'object-align-top': 'ObjectsAlignTop', 'object-align-middle': 'ObjectsAlignMiddleVertical', 'object-align-bottom': 'ObjectsAlignBottom',
  'distribute-x': 'AlignDistributeHorizontally', 'distribute-y': 'AlignDistributeVertically',
  'rotate-right': 'ObjectRotateRight90', 'rotate-left': 'ObjectRotateLeft90', 'flip-h': 'ObjectFlipHorizontal', 'flip-v': 'ObjectFlipVertical',
  forward: 'ObjectBringToFront', backward: 'ObjectSendToBack', 'selection-pane': 'SelectionPane', 'hide-slide': 'SlideHide',
  headers: 'HeaderFooterInsert', hyperlink: 'HyperlinkInsertPowerPoint', present: 'SlideShowFromCurrent', 'present-start': 'SlideShowFromBeginning',
};
const registry = Object.fromEntries(Object.entries(commands).map(([action, idMso]) => {
  if (!byName.has(idMso)) throw new Error('Unverified command name: ' + idMso);
  return [action, { idMso, numericId: byName.get(idMso) }];
}));
fs.writeFileSync('src/command-registry.js', '// Shared Office12 identifiers verified in two matching static MSO tables.\n// Association metadata does not assert equivalent behavior, PowerPoint availability, or exact placement.\nexport const commandRegistry = Object.freeze(' + JSON.stringify(registry, null, 2) + ');\n');
console.log('Verified command associations:', Object.keys(registry).length);
