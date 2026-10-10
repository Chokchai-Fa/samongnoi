/**
 * Stops user-supplied text from opening or closing a tag we use to fence it in a prompt.
 * `<` before a tag name or a slash becomes `&lt;`, so pasted pages, names and messages stay
 * plain text to the model.
 */
export function defangTags(text: string): string {
  return text.replace(/<(?=\/?[a-zA-Z])/g, '&lt;');
}
