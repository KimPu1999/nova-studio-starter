export function safeCsvCell(value: string|number|null|undefined){
  const text=String(value??'');
  const guarded=/^[=+\-@]/.test(text)?`'${text}`:text;
  return `"${guarded.replaceAll('"','""')}"`;
}
