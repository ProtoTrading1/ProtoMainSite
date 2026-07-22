/**
 * Normalise product wording for display without changing the catalogue source.
 * Suppliers sometimes use an asterisk for dimensions (for example 30*27*11cm);
 * show a clear multiplication x instead.
 */
export function displayProductText(value) {
  return String(value ?? '')
    .replaceAll('*', 'x')
    .replace(/\+\s*\/?\s*[-−]/g, '±')
    .replace(/\s+[-–—]\s+/g, ' | ')
    .replace(/\s*,\s*/g, ' | ')
    .replace(/(\d)\s*[xX]\s*(\d)/g, '$1 x $2');
}
