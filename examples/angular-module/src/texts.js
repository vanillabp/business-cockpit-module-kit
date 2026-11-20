// The GUI API gives a text per language, like the title of a user task: { en: '...', de: '...' }.
// A part shows the text of the language the cockpit gave it, and the English one when that
// language is missing. Drawing the object itself fails, in React with error #31.
export function inLanguage(text, language) {
  return text?.[language] ?? text?.en ?? Object.values(text ?? {})[0] ?? '';
}
